import { describe, it, expect, vi, type Mock } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ButtonInteraction, Guild, User } from 'discord.js';
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
    getPresetByName: vi.fn().mockResolvedValue(null),
    savePreset: vi.fn().mockResolvedValue({ id: 'p-1', name: 'guild:guild-1' }),
  };

  return {
    imageGenerationService: mockImageGenService as unknown as BotServices['imageGenerationService'],
    imageRepo: mockImageRepo as unknown as BotServices['imageRepo'],
    ...overrides,
  } as unknown as BotServices;
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
        aspectRatio: '1:1',
        providerId: 'mock',
        userId: 'user-1',
        guildId: 'guild-1',
      });
      expect(interaction.editReply).toHaveBeenCalled();
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

    it('/stablediffusion-model saves preset if specified', async () => {
      const services = createMockServices();
      const command = createSdModelCommand(services);
      const { ctx } = makeContext('slash', { preset: 'cyberpunk', provider: 'comfyui' });

      await command.execute(ctx);

      expect(services.imageRepo.savePreset).toHaveBeenCalledWith({
        name: 'guild:guild-1',
        positivePromptPrefix: '',
        negativePromptPreset: null,
        isSystemPreset: false,
      });
      expect(ctx.reply).toHaveBeenCalled();
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
