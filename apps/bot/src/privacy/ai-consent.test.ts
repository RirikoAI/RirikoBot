import { describe, expect, it, vi } from 'vitest';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import type { CommandContext } from '@ririko/discord';
import type { BotServices } from '../services.js';
import {
  AI_CONSENT_ACCEPT_PREFIX,
  AI_CONSENT_DECLINE_PREFIX,
  buildAiConsentPrompt,
  buildAiConsentText,
  describeConfiguredProviders,
  ensureAiConsent,
  formatAiConsentStatus,
  formatAiWithdrawReply,
  handleAiConsentButton,
  requireAiConsent,
  requireAiConsentForButton,
  withdrawAiConsent,
} from './ai-consent.js';

const links = {
  termsUrl: 'https://ririko.example/terms',
  privacyUrl: 'https://ririko.example/privacy',
};

interface FakeProvider {
  id: string;
  name: string;
  isAvailable: boolean;
}

function provider(id: string, name = id, isAvailable = true): FakeProvider {
  return { id, name, isAvailable };
}

function promptServices(
  ai: FakeProvider[] = [provider('gemini', 'Google Gemini'), provider('ollama', 'Ollama / Local')],
  images: FakeProvider[] = [
    provider('gemini', 'Google Gemini Imagen'),
    provider('replicate', 'Replicate Cloud AI'),
    provider('comfyui', 'ComfyUI / Stable Diffusion WebUI'),
    provider('mock', 'Offline Mock Generator'),
  ],
) {
  return {
    fallbackChainManager: { getProviders: () => ai },
    imageGenerationService: { getAvailableProviders: () => images.filter((p) => p.isAvailable) },
    legalLinks: links,
  } as unknown as Pick<
    BotServices,
    'fallbackChainManager' | 'imageGenerationService' | 'legalLinks'
  >;
}

function gateServices(accepted: boolean) {
  const consentService = {
    hasAccepted: vi.fn().mockResolvedValue(accepted),
    accept: vi.fn().mockResolvedValue(undefined),
    withdraw: vi.fn().mockResolvedValue(true),
    status: vi.fn(),
  };
  return {
    ...promptServices(),
    consentService,
  } as unknown as BotServices & { consentService: typeof consentService };
}

describe('describeConfiguredProviders', () => {
  it('names outside services and host providers once, in the order they are configured', () => {
    expect(describeConfiguredProviders(promptServices())).toEqual({
      external: ['Google Gemini', 'Replicate'],
      host: ['Ollama', 'ComfyUI'],
    });
  });

  it('leaves out providers without credentials and the offline image synthesizer', () => {
    const services = promptServices(
      [provider('gemini', 'Google Gemini', false), provider('openai', 'OpenAI')],
      [provider('mock', 'Offline Mock Generator'), provider('replicate', 'Replicate', false)],
    );
    expect(describeConfiguredProviders(services)).toEqual({ external: ['OpenAI'], host: [] });
  });

  it('falls back to the provider name for an id it does not know', () => {
    const services = promptServices([provider('custom', 'Custom Cloud')], []);
    expect(describeConfiguredProviders(services).external).toEqual(['Custom Cloud']);
  });
});

describe('the consent prompt text', () => {
  it('names the providers, keeps the promises of the acceptance and links both pages', () => {
    const text = buildAiConsentText(promptServices());

    expect(text).toContain('**Google Gemini**, **Replicate**');
    expect(text).toContain("**Ollama**, **ComfyUI** run on the host's own machine.");
    expect(text).toContain('keep what they receive under their own policies');
    expect(text).toContain('The bot owner cannot change or recall it.');
    expect(text).toContain('stores your AI chats for 90 days');
    expect(text).toContain('`ai clear`');
    expect(text).toContain('`ai clear all`');
    expect(text).toContain('`ai consent withdraw`');
    expect(text).toContain(`[Terms of Service](<${links.termsUrl}>)`);
    expect(text).toContain(`[Privacy Policy](<${links.privacyUrl}>)`);
  });

  it('says "runs" for one host provider and omits the provider policy line without outside services', () => {
    const text = buildAiConsentText(promptServices([provider('ollama', 'Ollama / Local')], []));

    expect(text).toContain("**Ollama** runs on the host's own machine.");
    expect(text).not.toContain('own policies');
  });

  it('still reads well when no provider is available', () => {
    const text = buildAiConsentText(promptServices([], []));

    expect(text).toContain('uses the AI services this bot is set up with');
  });

  it('builds an embed with "I agree" and "No thanks" buttons that carry the user id', () => {
    const prompt = buildAiConsentPrompt(promptServices(), 'user-9');
    const buttons = prompt.components[0]!.components.map((b) => b.toJSON());

    expect(prompt.embeds).toHaveLength(1);
    expect(buttons).toMatchObject([
      { label: 'I agree', custom_id: `${AI_CONSENT_ACCEPT_PREFIX}user-9` },
      { label: 'No thanks', custom_id: `${AI_CONSENT_DECLINE_PREFIX}user-9` },
    ]);
  });
});

describe('ensureAiConsent', () => {
  it('lets a user who agreed through without asking', async () => {
    const services = gateServices(true);
    const respond = vi.fn();

    expect(await ensureAiConsent(services, 'u1', respond)).toBe(true);

    expect(services.consentService.hasAccepted).toHaveBeenCalledWith('u1', 'ai');
    expect(respond).not.toHaveBeenCalled();
  });

  it('shows the prompt to a user who did not agree and says stop', async () => {
    const services = gateServices(false);
    const respond = vi.fn().mockResolvedValue(undefined);

    expect(await ensureAiConsent(services, 'u1', respond)).toBe(false);

    expect(respond).toHaveBeenCalledTimes(1);
  });

  it('does not swallow a failing consent check, so the caller cannot go on', async () => {
    const services = gateServices(true);
    services.consentService.hasAccepted.mockRejectedValue(new Error('db down'));
    const respond = vi.fn();

    await expect(ensureAiConsent(services, 'u1', respond)).rejects.toThrow('db down');
    expect(respond).not.toHaveBeenCalled();
  });
});

describe('where the prompt goes', () => {
  function context(overrides: Partial<CommandContext>) {
    return {
      user: { id: 'u1' },
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      isReplied: false,
      isDeferred: false,
      source: 'slash',
      ...overrides,
    } as unknown as CommandContext;
  }

  it('replies to a prefix message in the channel', async () => {
    const ctx = context({ source: 'prefix' });
    expect(await requireAiConsent(ctx, gateServices(false))).toBe(false);
    const sent = vi.mocked(ctx.reply).mock.calls[0]![0] as Record<string, unknown>;
    expect(sent.flags).toBeUndefined();
    expect(sent.components).toHaveLength(1);
  });

  it('replies to a slash command privately', async () => {
    const ctx = context({});
    await requireAiConsent(ctx, gateServices(false));
    expect(vi.mocked(ctx.reply).mock.calls[0]![0]).toMatchObject({ flags: MessageFlags.Ephemeral });
  });

  it('edits the private placeholder of a context menu command that was deferred', async () => {
    const ctx = context({ source: 'context-menu', isDeferred: true });
    await requireAiConsent(ctx, gateServices(false));
    expect(ctx.editReply).toHaveBeenCalledTimes(1);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('follows up privately when the command already replied', async () => {
    const ctx = context({ isReplied: true });
    await requireAiConsent(ctx, gateServices(false));
    expect(vi.mocked(ctx.followUp).mock.calls[0]![0]).toMatchObject({
      flags: MessageFlags.Ephemeral,
    });
  });

  it('does not touch the context of a user who agreed', async () => {
    const ctx = context({});
    expect(await requireAiConsent(ctx, gateServices(true))).toBe(true);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('replies to a button press privately', async () => {
    const interaction = {
      user: { id: 'u1' },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ButtonInteraction;

    expect(await requireAiConsentForButton(interaction, gateServices(false))).toBe(false);
    expect(vi.mocked(interaction.reply).mock.calls[0]![0]).toMatchObject({
      flags: MessageFlags.Ephemeral,
    });
  });
});

describe('the "I agree" and "No thanks" buttons', () => {
  function press(customId: string, userId: string) {
    const interaction = {
      customId,
      user: { id: userId },
      reply: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };
    return interaction as unknown as ButtonInteraction & typeof interaction;
  }

  it('records the AI consent and the terms for the user who agreed, and asks them to send again', async () => {
    const services = gateServices(false);
    const interaction = press(`${AI_CONSENT_ACCEPT_PREFIX}u1`, 'u1');

    await handleAiConsentButton(interaction, services);

    expect(services.consentService.accept).toHaveBeenCalledWith('u1', 'terms');
    expect(services.consentService.accept).toHaveBeenCalledWith('u1', 'ai');
    const update = interaction.update.mock.calls[0]![0] as Record<string, unknown>;
    expect(update.content).toContain('Send your request again');
    expect(update.components).toEqual([]);
    expect(update.embeds).toEqual([]);
  });

  it('does not record the terms again when the user already accepted them', async () => {
    const services = gateServices(true);
    const interaction = press(`${AI_CONSENT_ACCEPT_PREFIX}u1`, 'u1');

    await handleAiConsentButton(interaction, services);

    expect(services.consentService.accept).toHaveBeenCalledTimes(1);
    expect(services.consentService.accept).toHaveBeenCalledWith('u1', 'ai');
  });

  it('records nothing for "No thanks" and says AI stays off', async () => {
    const services = gateServices(false);
    const interaction = press(`${AI_CONSENT_DECLINE_PREFIX}u1`, 'u1');

    await handleAiConsentButton(interaction, services);

    expect(services.consentService.accept).not.toHaveBeenCalled();
    expect(vi.mocked(interaction.update).mock.calls[0]![0]).toMatchObject({
      content: expect.stringContaining('AI features stay off for you'),
      components: [],
    });
  });

  it.each([AI_CONSENT_ACCEPT_PREFIX, AI_CONSENT_DECLINE_PREFIX])(
    'refuses a user who was not asked (%s)',
    async (prefix) => {
      const services = gateServices(false);
      const interaction = press(`${prefix}u1`, 'intruder');

      await handleAiConsentButton(interaction, services);

      expect(services.consentService.accept).not.toHaveBeenCalled();
      expect(interaction.update).not.toHaveBeenCalled();
      expect(vi.mocked(interaction.reply).mock.calls[0]![0]).toMatchObject({
        flags: MessageFlags.Ephemeral,
        content: expect.stringContaining('for someone else'),
      });
    },
  );

  it('keeps the prompt and asks again when the choice could not be saved', async () => {
    const services = gateServices(false);
    services.consentService.accept.mockRejectedValue(new Error('disk full'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const interaction = press(`${AI_CONSENT_ACCEPT_PREFIX}u1`, 'u1');

    await handleAiConsentButton(interaction, services);

    expect(interaction.update).not.toHaveBeenCalled();
    expect(vi.mocked(interaction.reply).mock.calls[0]![0]).toMatchObject({
      content: expect.stringContaining('could not save'),
      flags: MessageFlags.Ephemeral,
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('ignores a custom id that is not a consent button', async () => {
    const interaction = press('imagine:regen:job', 'u1');

    await handleAiConsentButton(interaction, gateServices(false));

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.update).not.toHaveBeenCalled();
  });
});

describe('withdrawing', () => {
  function manager(conversations: number, preferences: boolean) {
    return {
      clearAllMemory: vi.fn().mockResolvedValue(conversations),
      deleteUserPreferences: vi.fn().mockResolvedValue(preferences),
    };
  }

  it('withdraws the consent first, then deletes the conversations and the preferences', async () => {
    const order: string[] = [];
    const services = {
      consentService: {
        withdraw: vi.fn(async () => {
          order.push('withdraw');
          return true;
        }),
      },
      conversationManager: {
        clearAllMemory: vi.fn(async () => {
          order.push('clear');
          return 3;
        }),
        deleteUserPreferences: vi.fn(async () => {
          order.push('preferences');
          return true;
        }),
      },
    } as unknown as BotServices;

    expect(await withdrawAiConsent(services, 'u1')).toEqual({
      hadConsent: true,
      conversations: 3,
      preferences: true,
    });
    expect(order).toEqual(['withdraw', 'clear', 'preferences']);
    expect(services.consentService.withdraw).toHaveBeenCalledWith('u1', 'ai');
  });

  it('tells what was deleted and that providers keep what they got', () => {
    const reply = formatAiWithdrawReply({ hadConsent: true, conversations: 2, preferences: true });

    expect(reply).toContain('Your AI consent is withdrawn');
    expect(reply).toContain('2 conversations and your AI preferences');
    expect(reply).toContain('cannot be recalled');
    expect(reply).toContain('stay off for you until you agree again');
  });

  it('uses the singular and handles a user with nothing stored', () => {
    expect(
      formatAiWithdrawReply({ hadConsent: true, conversations: 1, preferences: false }),
    ).toContain('Deleted: 1 conversation.');
    const empty = formatAiWithdrawReply({
      hadConsent: false,
      conversations: 0,
      preferences: false,
    });
    expect(empty).toContain('You had not agreed to AI features');
    expect(empty).toContain('no AI conversations or preferences stored for you');
  });

  it('is deterministic about the manager shape it needs', async () => {
    const services = {
      consentService: { withdraw: vi.fn().mockResolvedValue(false) },
      conversationManager: manager(0, false),
    } as unknown as BotServices;
    expect(await withdrawAiConsent(services, 'u1')).toEqual({
      hadConsent: false,
      conversations: 0,
      preferences: false,
    });
  });
});

describe('consent status', () => {
  const when = new Date('2026-10-17T10:00:00.000Z');
  const unix = Math.floor(when.getTime() / 1000);
  const statusOf = (value: unknown) =>
    formatAiConsentStatus(
      { consentService: { status: vi.fn().mockResolvedValue(value) } } as unknown as BotServices,
      'u1',
    );

  it('shows the date a user agreed', async () => {
    const text = await statusOf({ version: '2026-10-15', acceptedAt: when, current: true });
    expect(text).toContain(`agreed to AI features on <t:${unix}:D>`);
    expect(text).toContain('ai consent withdraw');
  });

  it('says AI is off for a user who never agreed or withdrew', async () => {
    expect(await statusOf(null)).toContain('You have not agreed to AI features');
  });

  it('says an older agreement no longer counts', async () => {
    const text = await statusOf({ version: '2025-01-01', acceptedAt: when, current: false });
    expect(text).toContain('earlier version');
    expect(text).toContain('ask you again');
  });
});
