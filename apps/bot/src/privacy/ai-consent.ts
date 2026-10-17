import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
} from 'discord.js';
import { describeErrorForLog } from '@ririko/core';
import type { CommandContext } from '@ririko/discord';
import { RETENTION_DAYS } from '@ririko/services';
import type { BotServices } from '../services.js';

/** Custom id prefixes of the two buttons of the AI consent prompt. The user's id follows. */
export const AI_CONSENT_ACCEPT_PREFIX = 'consent:ai:accept:';
export const AI_CONSENT_DECLINE_PREFIX = 'consent:ai:decline:';

/** What the consent prompt and the gate need from the bot services. */
export type AiConsentServices = Pick<
  BotServices,
  'consentService' | 'legalLinks' | 'fallbackChainManager' | 'imageGenerationService'
>;

/** What `ai consent withdraw` needs on top of the gate. */
export type AiWithdrawServices = Pick<BotServices, 'consentService' | 'conversationManager'>;

const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  replicate: 'Replicate',
  ollama: 'Ollama',
  comfyui: 'ComfyUI',
};

/** Providers that run on the machine that hosts the bot, so nothing is sent to a third party. */
const HOST_PROVIDERS: ReadonlySet<string> = new Set(['ollama', 'comfyui']);

/** Image providers that make an image on the host itself without any outside service. */
const OFFLINE_IMAGE_PROVIDERS: ReadonlySet<string> = new Set(['mock']);

export interface ConfiguredProviders {
  /** Outside services that receive what the user writes, by name. */
  readonly external: string[];
  /** Providers that run on the bot host's own machine, by name. */
  readonly host: string[];
}

/**
 * The AI and image providers this bot is set up to use, by name, split into outside services and
 * providers on the host's own machine. Read from the live providers, so it is what the bot would
 * really call. The offline image synthesizer sends nothing anywhere and is left out.
 */
export function describeConfiguredProviders(
  services: Pick<BotServices, 'fallbackChainManager' | 'imageGenerationService'>,
): ConfiguredProviders {
  const providers = [
    ...services.fallbackChainManager.getProviders().filter((p) => p.isAvailable),
    ...services.imageGenerationService
      .getAvailableProviders()
      .filter((p) => !OFFLINE_IMAGE_PROVIDERS.has(p.id)),
  ];
  const external = new Set<string>();
  const host = new Set<string>();
  for (const provider of providers) {
    const label = PROVIDER_LABELS[provider.id] ?? provider.name;
    (HOST_PROVIDERS.has(provider.id) ? host : external).add(label);
  }
  return { external: [...external], host: [...host] };
}

function joinNames(names: readonly string[]): string {
  return names.map((name) => `**${name}**`).join(', ');
}

/** The text of the consent prompt. */
export function buildAiConsentText(
  services: Pick<BotServices, 'fallbackChainManager' | 'imageGenerationService' | 'legalLinks'>,
): string {
  const { external, host } = describeConfiguredProviders(services);
  const { termsUrl, privacyUrl } = services.legalLinks;
  const lines: string[] = [];

  if (external.length > 0) {
    lines.push(
      `To answer you, Ririko sends what you write (chat, text to translate, image prompts) to: ${joinNames(external)}.`,
    );
  } else {
    lines.push('To answer you, Ririko uses the AI services this bot is set up with.');
  }
  if (host.length > 0) {
    lines.push(`${joinNames(host)} run${host.length === 1 ? 's' : ''} on the host's own machine.`);
  }
  if (external.length > 0) {
    lines.push(
      'These providers keep what they receive under their own policies. The bot owner cannot change or recall it.',
    );
  }
  lines.push(
    '',
    `Ririko stores your AI chats for ${RETENTION_DAYS.ai} days, then deletes them.`,
    '',
    '`ai clear` deletes the chat in this channel.',
    '`ai clear all` deletes all your chats.',
    '`ai consent withdraw` takes back your consent and deletes your AI data.',
    '',
    `[Terms of Service](<${termsUrl}>) · [Privacy Policy](<${privacyUrl}>)`,
    '',
    'Press **I agree** to use AI features.',
  );
  return lines.join('\n');
}

/** The consent prompt: an embed with the two buttons that only `userId` may press. */
export function buildAiConsentPrompt(
  services: Pick<BotServices, 'fallbackChainManager' | 'imageGenerationService' | 'legalLinks'>,
  userId: string,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const embed = new EmbedBuilder()
    .setColor(0xe91e63)
    .setTitle('Before you use AI features')
    .setDescription(buildAiConsentText(services));
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${AI_CONSENT_ACCEPT_PREFIX}${userId}`)
      .setLabel('I agree')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${AI_CONSENT_DECLINE_PREFIX}${userId}`)
      .setLabel('No thanks')
      .setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

/**
 * The AI consent gate. True when the user agreed to the current AI consent. Otherwise `respond`
 * shows them the prompt and the result is false: the caller must stop before it reads, stores or
 * sends anything. A failing consent check also stops the request (the error is not caught here).
 */
export async function ensureAiConsent(
  services: Pick<BotServices, 'consentService'>,
  userId: string,
  respond: () => Promise<unknown>,
): Promise<boolean> {
  if (await services.consentService.hasAccepted(userId, 'ai')) return true;
  await respond();
  return false;
}

/**
 * Shows the consent prompt for a command: a reply to a prefix message, an ephemeral reply to a
 * slash command, and the edit of the private placeholder when the router already deferred a
 * context menu command.
 */
export async function sendAiConsentPrompt(
  ctx: CommandContext,
  services: AiConsentServices,
): Promise<void> {
  const prompt = buildAiConsentPrompt(services, ctx.user.id);
  if (ctx.source === 'prefix') {
    await ctx.reply(prompt);
  } else if (ctx.isReplied) {
    await ctx.followUp({ ...prompt, flags: MessageFlags.Ephemeral });
  } else if (ctx.isDeferred) {
    await ctx.editReply(prompt);
  } else {
    await ctx.reply({ ...prompt, flags: MessageFlags.Ephemeral });
  }
}

/** The gate for a command: true to go on, false after showing the prompt. */
export async function requireAiConsent(
  ctx: CommandContext,
  services: AiConsentServices,
): Promise<boolean> {
  return ensureAiConsent(services, ctx.user.id, () => sendAiConsentPrompt(ctx, services));
}

/** The gate for a button (a regenerate button of an older image): ephemeral prompt. */
export async function requireAiConsentForButton(
  interaction: ButtonInteraction,
  services: AiConsentServices,
): Promise<boolean> {
  return ensureAiConsent(services, interaction.user.id, async () => {
    await interaction.reply({
      ...buildAiConsentPrompt(services, interaction.user.id),
      flags: MessageFlags.Ephemeral,
    });
  });
}

/**
 * Handles "I agree" and "No thanks". Only the user the prompt was shown to can press them.
 * "I agree" records the AI consent (and the terms, when missing); "No thanks" records nothing.
 */
export async function handleAiConsentButton(
  interaction: ButtonInteraction,
  services: Pick<BotServices, 'consentService'>,
): Promise<void> {
  const { customId } = interaction;
  const accepting = customId.startsWith(AI_CONSENT_ACCEPT_PREFIX);
  const declining = customId.startsWith(AI_CONSENT_DECLINE_PREFIX);
  if (!accepting && !declining) return;

  const ownerId = customId.slice(
    (accepting ? AI_CONSENT_ACCEPT_PREFIX : AI_CONSENT_DECLINE_PREFIX).length,
  );
  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: 'This question is for someone else. Ask Ririko yourself to get your own.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (declining) {
    await interaction.update({
      content: 'No problem. AI features stay off for you.',
      embeds: [],
      components: [],
    });
    return;
  }

  try {
    const { consentService } = services;
    if (!(await consentService.hasAccepted(ownerId, 'terms'))) {
      await consentService.accept(ownerId, 'terms');
    }
    await consentService.accept(ownerId, 'ai');
  } catch (error) {
    console.error(
      `[AiConsent] Could not save the consent of ${ownerId}: ${describeErrorForLog(error)}`,
    );
    await interaction.reply({
      content: 'Sorry, I could not save your choice. Please press **I agree** again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.update({
    content: 'Thank you. AI features are on for you. Send your request again.',
    embeds: [],
    components: [],
  });
}

export interface AiWithdrawResult {
  /** Whether the user had agreed to AI features before. */
  hadConsent: boolean;
  /** Conversations that were deleted. */
  conversations: number;
  /** Whether AI preferences were deleted. */
  preferences: boolean;
}

/**
 * Takes back the user's AI consent and deletes their AI data: every conversation with its
 * messages (all servers and channels) and their AI preferences. The consent goes first, so no
 * new AI request is accepted while the rest is deleted.
 */
export async function withdrawAiConsent(
  services: AiWithdrawServices,
  userId: string,
): Promise<AiWithdrawResult> {
  const hadConsent = await services.consentService.withdraw(userId, 'ai');
  const conversations = await services.conversationManager.clearAllMemory(userId);
  const preferences = await services.conversationManager.deleteUserPreferences(userId);
  return { hadConsent, conversations, preferences };
}

/** The reply of `ai consent withdraw`. */
export function formatAiWithdrawReply(result: AiWithdrawResult): string {
  const { hadConsent, conversations, preferences } = result;
  const deleted: string[] = [];
  if (conversations > 0) {
    deleted.push(`${conversations} conversation${conversations === 1 ? '' : 's'}`);
  }
  if (preferences) deleted.push('your AI preferences');
  return [
    hadConsent
      ? '🔒 **Your AI consent is withdrawn.**'
      : '🔒 **You had not agreed to AI features.** Nothing to withdraw.',
    deleted.length > 0
      ? `Deleted: ${deleted.join(' and ')}.`
      : 'Ririko had no AI conversations or preferences stored for you.',
    'Messages already sent to an AI provider cannot be recalled.',
    'AI features stay off for you until you agree again.',
  ].join('\n');
}

/** The reply of `ai consent status`. */
export async function formatAiConsentStatus(
  services: Pick<BotServices, 'consentService'>,
  userId: string,
): Promise<string> {
  const status = await services.consentService.status(userId, 'ai');
  if (!status) {
    return '🔒 **You have not agreed to AI features.** AI is off for you. Ask Ririko something to see the question.';
  }
  const when = `<t:${Math.floor(status.acceptedAt.getTime() / 1000)}:D>`;
  if (!status.current) {
    return `🔒 **You agreed to an earlier version of the AI consent on ${when}.** Ririko will ask you again before it uses AI for you.`;
  }
  return `🔒 **You agreed to AI features on ${when}.** \`ai consent withdraw\` takes your consent back and deletes your AI data.`;
}
