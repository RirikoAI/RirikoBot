import { describe, it, expect, vi, type Mock } from 'vitest';
import { EventEmitter } from 'node:events';
import { MessageFlags, type ButtonInteraction, type Guild, type User } from 'discord.js';
import type { CommandContext, ICommandOptionsResolver } from '@ririko/discord';
import type { BotServices } from '../../../services.js';
import {
  createImagineCommand,
  parseImaginePrefixArgs,
  handleImagineButtonInteraction,
} from '../imagine.command.js';
import { createSdModelCommand, createSetupSdApiCommand } from '../config.command.js';

interface MockCollector extends EventEmitter {
  resetTimer: ReturnType<typeof vi.fn>;
}

interface MockMessage {
  createMessageComponentCollector: ReturnType<typeof vi.fn>;
  edit: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

function makeContext(
  source: 'slash' | 'prefix',
  options: {
    prompt?: string | null;
    aspectRatio?: string | null;
    preset?: string | null;
    negativePrompt?: string | null;
    provider?: string | null;
    rawArgs?: string[];
    userId?: string;
    guildId?: string | null;
  } = {},
) {
  const collector: MockCollector = Object.assign(new EventEmitter(), {
    resetTimer: vi.fn(),
  });

  const message: MockMessage = {
    createMessageComponentCollector: vi.fn().mockReturnValue(collector),
    edit: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  const getString = vi.fn().mockImplementation((name: string) => {
    switch (name) {
      case 'prompt':
        return options.prompt ?? null;
      case 'aspect_ratio':
        return options.aspectRatio ?? null;
      case 'preset':
        return options.preset ?? null;
      case 'negative_prompt':
        return options.negativePrompt ?? null;
      case 'provider':
        return options.provider ?? null;
      default:
        return null;
    }
  });

  const getRawArgs = vi.fn().mockReturnValue(options.rawArgs ?? []);

  const ctx: Partial<CommandContext> = {
    source,
    invokedName: 'imagine',
    invokedPrefix: '!',
    user: { id: options.userId ?? 'user-1', username: 'TestUser' } as unknown as User,
    guildId: options.guildId ?? 'guild-1',
    guild: { name: 'Test Guild' } as unknown as Guild,
    channelId: 'chan-1',
    options: {
      getString,
      getRawArgs,
    } as unknown as ICommandOptionsResolver,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(message),
  };

  return { ctx: ctx as CommandContext, collector, message };
}

function createMockServices(overrides: Partial<BotServices> = {}): BotServices {
  const mockImageGenService = {
    generateImage: vi.fn().mockResolvedValue({
      jobId: 'job-123',
      prompt: 'a futuristic anime city',
      negativePrompt: 'blurry',
      preset: 'anime',
      aspectRatio: '16:9',
      providerId: 'mock',
      providerName: 'Mock Provider',
      durationMs: 450,
      images: [
        {
          buffer: Buffer.from('fake-png-bytes'),
          mimeType: 'image/png',
          width: 1024,
          height: 576,
        },
      ],
    }),
    getAvailableProviders: vi.fn().mockReturnValue([
      { id: 'gemini', name: 'Google Gemini Imagen', isAvailable: true },
      { id: 'comfyui', name: 'ComfyUI / SD-WebUI', isAvailable: false },
      { id: 'mock', name: 'Mock Image Provider', isAvailable: true },
    ]),
  };

  const mockImageRepo = {
    findById: vi.fn().mockResolvedValue({
      id: 'job-123',
      userId: 'user-1',
      guildId: 'guild-1',
      prompt: 'a futuristic anime city',
      negativePrompt: 'blurry',
      preset: 'anime',
      aspectRatio: '16:9',
      providerId: 'mock',
      status: 'COMPLETED',
    }),
    getGuildSettings: vi.fn().mockResolvedValue({
      guildId: 'guild-1',
      defaultProvider: null,
      memberDailyLimit: 5,
      defaultPreset: null,
    }),
    saveGuildSettings: vi.fn(async (settings: unknown) => settings),
  };

  return {
    imageGenerationService: mockImageGenService as unknown as BotServices['imageGenerationService'],
    imageRepo: mockImageRepo as unknown as BotServices['imageRepo'],
    // Every user has agreed to AI features unless a test says otherwise.
    consentService: {
      hasAccepted: vi.fn().mockResolvedValue(true),
    } as unknown as BotServices['consentService'],
    legalLinks: {
      termsUrl: 'https://example.test/terms',
      privacyUrl: 'https://example.test/privacy',
    },
    fallbackChainManager: {
      getProviders: vi.fn().mockReturnValue([]),
    } as unknown as BotServices['fallbackChainManager'],
    ...overrides,
  } as unknown as BotServices;
}

function withoutConsent(services: BotServices): void {
  (services.consentService.hasAccepted as unknown as Mock).mockResolvedValue(false);
}

describe('Dual-Dispatch /imagine Command Suite (TASK-1322)', () => {
  describe('parseImaginePrefixArgs', () => {
    it('parses basic prompt without flags', () => {
      const parsed = parseImaginePrefixArgs(['a', 'cute', 'anime', 'cat']);
      expect(parsed).toEqual({
        prompt: 'a cute anime cat',
        negativePrompt: undefined,
        aspectRatio: undefined,
        preset: undefined,
        provider: undefined,
      });
    });

    it('parses --ar flag', () => {
      const parsed = parseImaginePrefixArgs(['scenery', '--ar', '16:9']);
      expect(parsed.prompt).toBe('scenery');
      expect(parsed.aspectRatio).toBe('16:9');
    });

    it('parses --preset flag', () => {
      const parsed = parseImaginePrefixArgs(['neon', 'warrior', '--preset', 'cyberpunk']);
      expect(parsed.prompt).toBe('neon warrior');
      expect(parsed.preset).toBe('cyberpunk');
    });

    it('parses --negative flag', () => {
      const parsed = parseImaginePrefixArgs([
        'portrait',
        '--negative',
        'blurry,',
        'distorted,',
        'low',
        'quality',
      ]);
      expect(parsed.prompt).toBe('portrait');
      expect(parsed.negativePrompt).toBe('blurry, distorted, low quality');
    });

    it('parses combined flags in arbitrary order', () => {
      const parsed = parseImaginePrefixArgs([
        '--preset',
        'fantasy',
        'dragon',
        'flying',
        '--ar',
        '4:3',
        '--backend',
        'gemini',
        '--neg',
        'clouds',
      ]);
      expect(parsed.prompt).toBe('dragon flying');
      expect(parsed.preset).toBe('fantasy');
      expect(parsed.aspectRatio).toBe('4:3');
      expect(parsed.provider).toBe('gemini');
      expect(parsed.negativePrompt).toBe('clouds');
    });

    it('handles empty input gracefully', () => {
      const parsed = parseImaginePrefixArgs([]);
      expect(parsed.prompt).toBe('');
    });
  });

  describe('Slash Command Execution', () => {
    it('successfully generates an image and sends attachment + embed + action row', async () => {
      const services = createMockServices();
      const command = createImagineCommand(services);
      const { ctx, message } = makeContext('slash', {
        prompt: 'a futuristic anime city',
        aspectRatio: '16:9',
        preset: 'anime',
      });

      await command.execute(ctx);

      expect(ctx.deferReply).toHaveBeenCalled();
      expect(services.imageGenerationService.generateImage).toHaveBeenCalledWith({
        prompt: 'a futuristic anime city',
        negativePrompt: undefined,
        aspectRatio: '16:9',
        preset: 'anime',
        providerId: undefined,
        userId: 'user-1',
        guildId: 'guild-1',
      });

      expect(ctx.editReply).toHaveBeenCalled();
      const call = (ctx.editReply as Mock).mock.calls[0]![0];
      expect(call.files).toHaveLength(1);
      expect(call.embeds).toHaveLength(1);
      expect(call.components).toHaveLength(1);

      // Verify collector attached
      expect(message.createMessageComponentCollector).toHaveBeenCalled();
    });

    it('rejects empty prompt with help message', async () => {
      const services = createMockServices();
      const command = createImagineCommand(services);
      const { ctx } = makeContext('slash', { prompt: '' });

      await command.execute(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          ephemeral: true,
        }),
      );
      expect(services.imageGenerationService.generateImage).not.toHaveBeenCalled();
    });

    it('asks for AI consent instead of generating when the user has not agreed', async () => {
      const services = createMockServices();
      withoutConsent(services);
      const command = createImagineCommand(services);
      const { ctx } = makeContext('slash', { prompt: 'a futuristic anime city' });

      await command.execute(ctx);

      expect(services.consentService.hasAccepted).toHaveBeenCalledWith('user-1', 'ai');
      expect(ctx.deferReply).not.toHaveBeenCalled();
      expect(services.imageGenerationService.generateImage).not.toHaveBeenCalled();
      const reply = (ctx.reply as Mock).mock.calls[0]![0];
      expect(reply.flags).toBe(MessageFlags.Ephemeral);
      expect(reply.components).toHaveLength(1);
    });

    it('handles image generation errors gracefully', async () => {
      const services = createMockServices();
      (services.imageGenerationService.generateImage as unknown as Mock).mockRejectedValueOnce(
        new Error('Generation queue timeout'),
      );
      const command = createImagineCommand(services);
      const { ctx } = makeContext('slash', { prompt: 'error test' });

      await command.execute(ctx);

      expect(ctx.editReply).toHaveBeenCalledWith({
        content: '❌ Image generation failed: Generation queue timeout',
        embeds: [],
        components: [],
      });
    });
  });

  describe('Prefix Command Execution', () => {
    it('replies to the message with the consent prompt and generates nothing without consent', async () => {
      const services = createMockServices();
      withoutConsent(services);
      const command = createImagineCommand(services);
      const { ctx } = makeContext('prefix', { rawArgs: ['a', 'cute', 'cat'] });

      await command.execute(ctx);

      expect(services.imageGenerationService.generateImage).not.toHaveBeenCalled();
      expect(ctx.deferReply).not.toHaveBeenCalled();
      const reply = (ctx.reply as Mock).mock.calls[0]![0];
      expect(reply.flags).toBeUndefined();
      expect(reply.components).toHaveLength(1);
    });

    it('parses rawArgs and invokes generation service', async () => {
      const services = createMockServices();
      const command = createImagineCommand(services);
      const { ctx } = makeContext('prefix', {
        rawArgs: ['anime', 'girl', '--ar', '9:16', '--preset', 'photoreal'],
      });

      await command.execute(ctx);

      expect(services.imageGenerationService.generateImage).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'anime girl',
          aspectRatio: '9:16',
          preset: 'photoreal',
        }),
      );
    });
  });

  describe('Interactive Button Actions', () => {
    it('deletes message on imagine:dismiss when clicked by owner', async () => {
      const services = createMockServices();
      const mockMessage = { delete: vi.fn().mockResolvedValue(undefined) };
      const interaction = {
        customId: 'imagine:dismiss:user-1',
        user: { id: 'user-1' },
        message: mockMessage,
      } as unknown as ButtonInteraction;

      await handleImagineButtonInteraction(interaction, services);

      expect(mockMessage.delete).toHaveBeenCalled();
    });

    it('rejects imagine:dismiss if clicked by another user', async () => {
      const services = createMockServices();
      const mockMessage = { delete: vi.fn() };
      const interaction = {
        customId: 'imagine:dismiss:user-1',
        user: { id: 'user-intruder' },
        message: mockMessage,
        reply: vi.fn().mockResolvedValue(undefined),
      } as unknown as ButtonInteraction;

      await handleImagineButtonInteraction(interaction, services);

      expect(mockMessage.delete).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith({
        content: '❌ Only the person who requested this image can dismiss it.',
        ephemeral: true,
      });
    });

    it('regenerates image on imagine:regen when clicked by owner', async () => {
      const services = createMockServices();
      const interaction = {
        customId: 'imagine:regen:job-123',
        user: { id: 'user-1', username: 'TestUser' },
        guildId: 'guild-1',
        channelId: 'chan-1',
        deferUpdate: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      } as unknown as ButtonInteraction;

      await handleImagineButtonInteraction(interaction, services);

      expect(interaction.deferUpdate).toHaveBeenCalled();
      expect(services.imageRepo.findById).toHaveBeenCalledWith('job-123');
      expect(services.imageGenerationService.generateImage).toHaveBeenCalledWith({
        prompt: 'a futuristic anime city',
        negativePrompt: 'blurry',
        // The saved prompt already carries its preset.
        preset: 'none',
        aspectRatio: '1:1',
        providerId: 'mock',
        userId: 'user-1',
        guildId: 'guild-1',
      });
      expect(interaction.editReply).toHaveBeenCalled();
    });

    it('asks for AI consent on imagine:regen and generates nothing without it', async () => {
      const services = createMockServices();
      withoutConsent(services);
      const interaction = {
        customId: 'imagine:regen:job-123',
        user: { id: 'user-1', username: 'TestUser' },
        guildId: 'guild-1',
        deferUpdate: vi.fn(),
        editReply: vi.fn(),
        reply: vi.fn().mockResolvedValue(undefined),
      } as unknown as ButtonInteraction;

      await handleImagineButtonInteraction(interaction, services);

      expect(services.imageGenerationService.generateImage).not.toHaveBeenCalled();
      expect(interaction.deferUpdate).not.toHaveBeenCalled();
      const reply = (interaction.reply as Mock).mock.calls[0]![0];
      expect(reply.flags).toBe(MessageFlags.Ephemeral);
      expect(reply.components).toHaveLength(1);
    });

    it('does not show the prompt to another user who pressed regenerate', async () => {
      const services = createMockServices();
      withoutConsent(services);
      const interaction = {
        customId: 'imagine:regen:job-123',
        user: { id: 'user-intruder' },
        reply: vi.fn().mockResolvedValue(undefined),
      } as unknown as ButtonInteraction;

      await handleImagineButtonInteraction(interaction, services);

      expect(services.imageGenerationService.generateImage).not.toHaveBeenCalled();
      expect(services.consentService.hasAccepted).not.toHaveBeenCalled();
    });

    it('rejects imagine:regen if job not found', async () => {
      const services = createMockServices();
      (services.imageRepo.findById as unknown as Mock).mockResolvedValueOnce(null);

      const interaction = {
        customId: 'imagine:regen:unknown-job',
        user: { id: 'user-1' },
        reply: vi.fn().mockResolvedValue(undefined),
      } as unknown as ButtonInteraction;

      await handleImagineButtonInteraction(interaction, services);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: '❌ Original image job information could not be found to regenerate.',
        ephemeral: true,
      });
    });
  });

  describe('Configuration Commands', () => {
    it('/stablediffusion-model displays current settings if called without options', async () => {
      const services = createMockServices();
      const command = createSdModelCommand(services);
      const { ctx } = makeContext('slash', {});

      await command.execute(ctx);

      expect(ctx.reply).toHaveBeenCalled();
      const call = (ctx.reply as Mock).mock.calls[0]![0];
      expect(call.embeds).toHaveLength(1);
      expect(call.embeds[0].data.title).toContain('Server Image Generation Settings');
    });

    it('/stablediffusion-model saves the server preset and provider (TASK-1163)', async () => {
      const services = createMockServices();
      const command = createSdModelCommand(services);
      const { ctx } = makeContext('slash', { preset: 'cyberpunk', provider: 'gemini' });

      await command.execute(ctx);

      // The member limit set on the dashboard is kept.
      expect(services.imageRepo.saveGuildSettings).toHaveBeenCalledWith({
        guildId: 'guild-1',
        defaultProvider: 'gemini',
        memberDailyLimit: 5,
        defaultPreset: 'cyberpunk',
      });
      expect(ctx.reply).toHaveBeenCalled();
    });

    it('/stablediffusion-model resets the provider with auto and refuses unconfigured ones', async () => {
      const services = createMockServices();
      const command = createSdModelCommand(services);

      const reset = makeContext('slash', { provider: 'auto' });
      await command.execute(reset.ctx);
      expect(services.imageRepo.saveGuildSettings).toHaveBeenCalledWith(
        expect.objectContaining({ defaultProvider: null }),
      );

      const missing = makeContext('slash', { provider: 'replicate' });
      await command.execute(missing.ctx);
      expect(missing.ctx.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('not configured for this bot'),
      });
      expect(services.imageRepo.saveGuildSettings).toHaveBeenCalledTimes(1);
    });

    it('/setup-stablediffusion-api displays ADR-011 plaintext token deprecation notice', async () => {
      const command = createSetupSdApiCommand();
      const { ctx } = makeContext('slash', {});

      await command.execute(ctx);

      expect(ctx.reply).toHaveBeenCalled();
      const call = (ctx.reply as Mock).mock.calls[0]![0];
      expect(call.embeds).toHaveLength(1);
      expect(call.embeds[0].data.title).toContain(
        'Security Notice: Plaintext Token Storage Deprecation',
      );
      expect(call.embeds[0].data.description).toContain('permanently discontinued');
    });

    it('attaches WebP images correctly with imagine.webp and attachment://imagine.webp (BUG-0019)', async () => {
      const services = createMockServices();
      (services.imageGenerationService.generateImage as Mock).mockResolvedValueOnce({
        jobId: 'job-webp-123',
        prompt: 'anime character',
        preset: 'anime',
        aspectRatio: '1:1',
        providerId: 'replicate',
        providerName: 'Replicate Cloud AI',
        durationMs: 4200,
        images: [
          {
            buffer: Buffer.from('fake-webp-buffer'),
            mimeType: 'image/webp',
          },
        ],
      });

      const command = createImagineCommand(services);
      const { ctx } = makeContext('prefix', { rawArgs: ['anime', 'character'] });

      await command.execute(ctx);

      expect(ctx.editReply).toHaveBeenCalled();
      const call = (ctx.editReply as Mock).mock.calls[0]![0];
      expect(call.files).toHaveLength(1);
      expect(call.files[0].name).toBe('imagine.webp');
      expect(call.embeds[0].data.image.url).toBe('attachment://imagine.webp');
      expect(call.embeds[0].data.fields[0].value).toBe('`Replicate Cloud AI`');
    });
  });
});
