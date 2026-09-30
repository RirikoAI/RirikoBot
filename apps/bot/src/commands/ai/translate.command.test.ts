import { describe, expect, it, vi } from 'vitest';
import {
  EmbedBuilder,
  MessageFlags,
  type MessageContextMenuCommandInteraction,
  type Interaction,
  type Message,
} from 'discord.js';
import {
  CommandRouter,
  CommandSynchronizer,
  createCooldownMiddleware,
  createCommandOverrideMiddleware,
} from '@ririko/discord';
import { createTranslateCommand } from './translate.command.js';
import type { BotServices } from '../../services.js';

function setup(content = 'Bonjour !', embeds: EmbedBuilder[] = []) {
  const generate = vi.fn().mockResolvedValue({
    content: 'Hello!',
    provider: 'fake',
    model: 'fake',
    finishReason: 'stop',
  });
  const getGuildPreferences = vi
    .fn()
    .mockResolvedValue({ providerOverride: 'gemini', modelOverride: 'gemini-2.5-flash' });
  const services = {
    fallbackChainManager: { generate },
    conversationManager: { getGuildPreferences },
  } as unknown as Pick<BotServices, 'fallbackChainManager' | 'conversationManager'>;
  const router = new CommandRouter();
  router.registry.register(createTranslateCommand(services));
  const raw = {
    id: 'interaction',
    user: { id: 'reader' },
    guildId: 'guild',
    channelId: 'channel',
    guild: null,
    member: null,
    channel: null,
    client: {},
    commandName: 'Translate to English',
    replied: false,
    deferred: false,
    isMessageContextMenuCommand: () => true,
    isAutocomplete: () => false,
    isChatInputCommand: () => false,
    targetMessage: {
      content,
      embeds: embeds.map((e) => ({ ...e.data, fields: e.data.fields ?? [] })),
    },
    deferReply: vi.fn(async () => {
      raw.deferred = true;
    }),
    editReply: vi.fn(async () => {
      raw.replied = true;
    }),
    reply: vi.fn(),
    followUp: vi.fn(),
  };
  const interaction = raw as unknown as MessageContextMenuCommandInteraction;
  return { router, raw, interaction, generate, getGuildPreferences };
}

describe('Translate to English message context menu', () => {
  it('registers a type-3 message menu, preserving case and excluding slash options/description', () => {
    const { router } = setup();
    const rest = { put: vi.fn() } as unknown as ConstructorParameters<
      typeof CommandSynchronizer
    >[0];
    expect(new CommandSynchronizer(rest, router.registry).generatePayloads()).toEqual([
      { name: 'Translate to English', type: 3 },
    ]);
  });

  it('defers privately before middleware, translates the selected message and applies guild preferences', async () => {
    const { router, interaction, raw, generate } = setup();
    router.pipeline.use(async (ctx, next) => {
      expect(raw.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
      expect(ctx.commandName).toBe('translate');
      expect(ctx.source).toBe('context-menu');
      await next();
    });
    expect(await router.dispatchInteraction(interaction)).toBe(true);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [{ role: 'user', content: 'Bonjour !' }] }),
      { providerId: 'gemini', model: 'gemini-2.5-flash' },
    );
    expect(raw.editReply).toHaveBeenCalledWith({
      content: 'Hello!',
      allowedMentions: { parse: [] },
      flags: MessageFlags.SuppressEmbeds,
    });
    expect(raw.reply).not.toHaveBeenCalled();
    expect(raw.followUp).not.toHaveBeenCalled();
  });

  it('includes readable embed text even when the body is empty', async () => {
    const embed = new EmbedBuilder()
      .setAuthor({ name: 'Auteur' })
      .setTitle('Titre')
      .setDescription('Bonjour')
      .addFields({ name: 'Nom', value: 'Valeur' })
      .setFooter({ text: 'Fin' });
    const { router, interaction, generate } = setup('', [embed]);
    await router.dispatchInteraction(interaction);
    expect(generate.mock.calls[0]![0].messages[0].content).toBe(
      'Auteur\n\nTitre\n\nBonjour\n\nNom\n\nValeur\n\nFin',
    );
  });

  it.each(['', '  ', 'x'.repeat(12001)])(
    'privately rejects missing/oversized text without calling AI (%#)',
    async (content) => {
      const { router, interaction, raw, generate } = setup(content);
      await router.dispatchInteraction(interaction);
      expect(raw.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
      expect(raw.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining(content.trim() ? 'too long' : 'no text'),
        }),
      );
      expect(generate).not.toHaveBeenCalled();
      expect(raw.followUp).not.toHaveBeenCalled();
    },
  );

  it('delivers all of a long translation as an attachment in the private reply', async () => {
    const { router, interaction, raw, generate } = setup();
    const text = 'Hello '.repeat(700).trim();
    generate.mockResolvedValue({
      content: text,
      provider: 'fake',
      model: 'fake',
      finishReason: 'stop',
    });
    await router.dispatchInteraction(interaction);
    const payload = raw.editReply.mock.calls[0] as unknown as [
      { files: { attachment: Buffer; name: string }[] },
    ];
    expect(payload[0].files[0]!.attachment.toString('utf8')).toBe(text);
    expect(payload[0].files[0]!.name).toBe('translation-en.txt');
    expect(raw.followUp).not.toHaveBeenCalled();
  });

  it('returns a private sanitized error on provider failure', async () => {
    const { router, interaction, raw, generate } = setup();
    generate.mockRejectedValue(new Error('secret provider diagnostics'));
    await router.dispatchInteraction(interaction);
    expect(raw.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Translation is unavailable') }),
    );
    expect(JSON.stringify(raw.editReply.mock.calls)).not.toContain('secret');
  });

  it('uses defaults in DMs without loading guild preferences', async () => {
    const { router, interaction, generate, getGuildPreferences } = setup();
    Object.assign(interaction, { guildId: null });
    await router.dispatchInteraction(interaction);
    expect(getGuildPreferences).not.toHaveBeenCalled();
    expect(generate.mock.calls[0]![1]).toEqual({});
  });

  it('enforces the cooldown before another provider request', async () => {
    const { router, interaction, raw, generate } = setup();
    router.pipeline.use(createCooldownMiddleware());
    await router.dispatchInteraction(interaction);
    raw.replied = false;
    await router.dispatchInteraction(interaction);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(raw.editReply).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: expect.stringContaining('wait') }),
    );
  });

  it('applies server command overrides using the canonical translate name', async () => {
    const { router, interaction, raw, generate } = setup();
    const resolve = vi.fn().mockResolvedValue({
      enabled: false,
      allowedRoleIds: [],
      blockedRoleIds: [],
      channelId: null,
    });
    router.pipeline.use(createCommandOverrideMiddleware({ resolve }));
    await router.dispatchInteraction(interaction);
    expect(resolve).toHaveBeenCalledWith('guild', 'channel', 'translate');
    expect(generate).not.toHaveBeenCalled();
    expect(raw.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('disabled') }),
    );
  });

  it('ignores unknown context menus and other interaction types', async () => {
    const { router, interaction, raw, generate } = setup();
    Object.assign(interaction, { commandName: 'Different app' });
    expect(await router.dispatchInteraction(interaction)).toBe(false);
    const other = {
      isMessageContextMenuCommand: () => false,
      isAutocomplete: () => false,
      isChatInputCommand: () => false,
    } as unknown as Interaction;
    expect(await router.dispatchInteraction(other)).toBe(false);
    expect(raw.deferReply).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it('points prefix invocations to the message menu instead of executing publicly', async () => {
    const { router, generate } = setup();
    const reply = vi.fn();
    const message = {
      content: '!translate',
      author: { bot: false },
      client: {},
      reply,
    } as unknown as Message;
    await router.dispatchMessage(message);
    expect(reply).toHaveBeenCalledWith('Right-click a message → Apps → Translate to English.');
    expect(generate).not.toHaveBeenCalled();
  });
});
