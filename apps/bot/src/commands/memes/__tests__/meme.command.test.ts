import { describe, it, expect, vi } from 'vitest';
import type { AutocompleteInteraction } from 'discord.js';
import type { CommandContext } from '@ririko/discord';
import { createMemeCommand } from '../meme.command.js';
import type { BotServices } from '../../../services.js';
import { MEME_TEMPLATE_NAMES } from '@ririko/services';

function makeCtx(opts: {
  source: 'slash' | 'prefix';
  invokedName: string;
  invokedPrefix?: string;
  slashOptions?: Record<string, string | null>;
  rawArgs?: string[];
  guildId?: string | null;
}) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const ctx = {
    source: opts.source,
    invokedName: opts.invokedName,
    invokedPrefix: opts.invokedPrefix ?? (opts.source === 'slash' ? '/' : '!'),
    user: { id: '123456789', username: 'TestUser' },
    guildId: opts.guildId ?? null,
    options: {
      getString: vi.fn((name: string) => opts.slashOptions?.[name] ?? null),
      getRawArgs: vi.fn(() => opts.rawArgs ?? []),
    },
    reply,
  };
  return { ctx: ctx as unknown as CommandContext, reply };
}

function mockServices(customGenerate?: ReturnType<typeof vi.fn>): BotServices {
  const generateMeme =
    customGenerate ??
    vi.fn().mockResolvedValue({
      buffer: Buffer.from('fake-meme-png-buffer'),
      mimeType: 'image/png',
      template: { id: '0days', title: '0 Days Without Accidents' },
    });
  return {
    memeSynthesizer: {
      generateMeme,
    },
    guildSettingsService: {
      getPrefix: vi.fn().mockResolvedValue('!'),
    },
  } as unknown as BotServices;
}

describe('MemeCommand (TASK-1312)', () => {
  it('registers all 11 legacy meme template names as prefix aliases', () => {
    const cmd = createMemeCommand(mockServices());
    const aliases = cmd.metadata.aliases ?? [];
    for (const name of MEME_TEMPLATE_NAMES) {
      expect(aliases).toContain(name);
    }
    expect(aliases).toContain('alwaysbeen');
  });

  describe('autocomplete', () => {
    it('returns up to 25 templates on autocomplete interaction', async () => {
      const cmd = createMemeCommand(mockServices());
      const respond = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        options: {
          getFocused: vi.fn().mockReturnValue(''),
        },
        respond,
      } as unknown as AutocompleteInteraction;

      await cmd.autocomplete!(interaction);
      expect(respond).toHaveBeenCalled();
      const choices = respond.mock.calls[0]![0];
      expect(choices.length).toBe(11);
      expect(choices[0].value).toBe('0days');
    });

    it('filters templates by query', async () => {
      const cmd = createMemeCommand(mockServices());
      const respond = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        options: {
          getFocused: vi.fn().mockReturnValue('chopper'),
        },
        respond,
      } as unknown as AutocompleteInteraction;

      await cmd.autocomplete!(interaction);
      expect(respond).toHaveBeenCalled();
      const choices = respond.mock.calls[0]![0];
      expect(choices.length).toBeGreaterThanOrEqual(1);
      expect(choices[0].value).toBe('american-chopper');
    });
  });

  describe('slash execution', () => {
    it('executes /meme with template and texts and replies with attachment', async () => {
      const generateMeme = vi.fn().mockResolvedValue({
        buffer: Buffer.from('png-bytes'),
        mimeType: 'image/png',
        template: { id: '0days', title: '0 Days Without Accidents' },
      });
      const services = mockServices(generateMeme);
      const { ctx, reply } = makeCtx({
        source: 'slash',
        invokedName: 'meme',
        slashOptions: {
          template: '0days',
          text1: 'Accident Free',
          text2: 'Until Today',
        },
      });

      await createMemeCommand(services).execute(ctx);

      expect(generateMeme).toHaveBeenCalledWith(expect.objectContaining({ id: '0days' }), [
        'Accident Free',
        'Until Today',
      ]);
      expect(reply).toHaveBeenCalled();
      const payload = reply.mock.calls[0]![0];
      expect(payload.content).toContain('0 Days Without Accidents');
      expect(payload.files).toHaveLength(1);
      expect(payload.files[0].attachment).toEqual(Buffer.from('png-bytes'));
    });

    it('replies with error message for unknown template in slash', async () => {
      const { ctx, reply } = makeCtx({
        source: 'slash',
        invokedName: 'meme',
        slashOptions: {
          template: 'non-existent-template',
          text1: 'Hello',
        },
      });

      await createMemeCommand(mockServices()).execute(ctx);

      expect(reply).toHaveBeenCalled();
      const payload = reply.mock.calls[0]![0];
      expect(payload.content).toContain('is not a known meme template');
      expect(payload.ephemeral).toBe(true);
    });

    it('prompts when no text is provided in slash', async () => {
      const { ctx, reply } = makeCtx({
        source: 'slash',
        invokedName: 'meme',
        slashOptions: {
          template: '0days',
        },
      });

      await createMemeCommand(mockServices()).execute(ctx);

      expect(reply).toHaveBeenCalled();
      const payload = reply.mock.calls[0]![0];
      expect(payload.content).toContain('Please provide text for the meme');
      expect(payload.ephemeral).toBe(true);
    });
  });

  describe('canonical prefix execution', () => {
    it('parses !meme <template> text1 | text2 with pipe delimiter', async () => {
      const generateMeme = vi.fn().mockResolvedValue({
        buffer: Buffer.from('png-bytes'),
        mimeType: 'image/png',
        template: { id: 'chad', title: 'GigaChad vs Virgin' },
      });
      const services = mockServices(generateMeme);
      const { ctx, reply } = makeCtx({
        source: 'prefix',
        invokedName: 'meme',
        rawArgs: ['chad', 'Average JS fan', '|', 'Average TS enjoyer'],
      });

      await createMemeCommand(services).execute(ctx);

      expect(generateMeme).toHaveBeenCalledWith(expect.objectContaining({ id: 'chad' }), [
        'Average JS fan',
        'Average TS enjoyer',
      ]);
      expect(reply).toHaveBeenCalled();
    });

    it('shows help when !meme is called without arguments', async () => {
      const { ctx, reply } = makeCtx({
        source: 'prefix',
        invokedName: 'meme',
        rawArgs: [],
      });

      await createMemeCommand(mockServices()).execute(ctx);

      expect(reply).toHaveBeenCalled();
      const payload = reply.mock.calls[0]![0];
      expect(payload.content).toContain('Please specify which meme template to generate');
    });
  });

  describe('legacy prefix alias execution', () => {
    it('executes direct legacy alias !0days text1 | text2', async () => {
      const generateMeme = vi.fn().mockResolvedValue({
        buffer: Buffer.from('png-bytes'),
        mimeType: 'image/png',
        template: { id: '0days', title: '0 Days Without Accidents' },
      });
      const services = mockServices(generateMeme);
      const { ctx, reply } = makeCtx({
        source: 'prefix',
        invokedName: '0days',
        rawArgs: ['0 Days', '|', 'Without TypeScript Errors'],
      });

      await createMemeCommand(services).execute(ctx);

      expect(generateMeme).toHaveBeenCalledWith(expect.objectContaining({ id: '0days' }), [
        '0 Days',
        'Without TypeScript Errors',
      ]);
      expect(reply).toHaveBeenCalled();
      const payload = reply.mock.calls[0]![0];
      expect(payload.content).toContain('0 Days Without Accidents');
    });

    it('executes legacy alias with quoted tokens !chad "Left" "Right"', async () => {
      const generateMeme = vi.fn().mockResolvedValue({
        buffer: Buffer.from('png-bytes'),
        mimeType: 'image/png',
        template: { id: 'chad', title: 'GigaChad vs Virgin' },
      });
      const services = mockServices(generateMeme);
      const { ctx } = makeCtx({
        source: 'prefix',
        invokedName: 'chad',
        rawArgs: ['Left Panel', 'Right Panel'],
      });

      await createMemeCommand(services).execute(ctx);

      expect(generateMeme).toHaveBeenCalledWith(expect.objectContaining({ id: 'chad' }), [
        'Left Panel',
        'Right Panel',
      ]);
    });

    it('executes 5-panel meme !american-chopper with 5 pipe-delimited panels', async () => {
      const generateMeme = vi.fn().mockResolvedValue({
        buffer: Buffer.from('png-bytes'),
        mimeType: 'image/png',
        template: { id: 'american-chopper', title: 'American Chopper Argument' },
      });
      const services = mockServices(generateMeme);
      const { ctx } = makeCtx({
        source: 'prefix',
        invokedName: 'american-chopper',
        rawArgs: ['P1', '|', 'P2', '|', 'P3', '|', 'P4', '|', 'P5'],
      });

      await createMemeCommand(services).execute(ctx);

      expect(generateMeme).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'american-chopper' }),
        ['P1', 'P2', 'P3', 'P4', 'P5'],
      );
    });

    it('resolves legacy alias alwaysbeen', async () => {
      const generateMeme = vi.fn().mockResolvedValue({
        buffer: Buffer.from('png-bytes'),
        mimeType: 'image/png',
        template: { id: 'always-been', title: 'Always Has Been' },
      });
      const services = mockServices(generateMeme);
      const { ctx } = makeCtx({
        source: 'prefix',
        invokedName: 'alwaysbeen',
        rawArgs: ['Wait its all tests?', '|', 'Always has been.'],
      });

      await createMemeCommand(services).execute(ctx);

      expect(generateMeme).toHaveBeenCalledWith(expect.objectContaining({ id: 'always-been' }), [
        'Wait its all tests?',
        'Always has been.',
      ]);
    });

    it('handles synthesis errors gracefully with user-facing message', async () => {
      const generateMeme = vi.fn().mockRejectedValue(new Error('Canvas rendering crashed'));
      const services = mockServices(generateMeme);
      const { ctx, reply } = makeCtx({
        source: 'prefix',
        invokedName: '0days',
        rawArgs: ['Crash test'],
      });

      await createMemeCommand(services).execute(ctx);

      expect(reply).toHaveBeenCalled();
      const payload = reply.mock.calls[0]![0];
      expect(payload.content).toContain('Failed to generate meme: Canvas rendering crashed');
      expect(payload.ephemeral).toBe(true);
    });
  });
});
