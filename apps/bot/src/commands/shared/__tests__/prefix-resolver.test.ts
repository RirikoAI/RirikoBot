import { describe, it, expect, vi } from 'vitest';
import type { CommandContext } from '@ririko/discord';
import { DEFAULT_COMMAND_PREFIX } from '@ririko/discord';
import { resolveContextPrefix } from '../prefix-resolver.js';
import type { BotServices } from '../../../services.js';

describe('resolveContextPrefix shared utility', () => {
  const createMockContext = (options: {
    source?: 'slash' | 'prefix';
    invokedPrefix?: string;
    guildId?: string | null;
  } = {}): CommandContext => {
    return {
      source: options.source ?? 'prefix',
      invokedPrefix: options.invokedPrefix ?? '!',
      guildId: options.guildId ?? 'guild-123',
    } as unknown as CommandContext;
  };

  it('returns ctx.invokedPrefix if invoked as prefix and not slash', async () => {
    const ctx = createMockContext({
      source: 'prefix',
      invokedPrefix: 'r!',
      guildId: 'guild-123',
    });

    const prefix = await resolveContextPrefix(ctx);
    expect(prefix).toBe('r!');
  });

  it('resolves guild prefix from guildSettingsService when slash invoked or prefix is /', async () => {
    const ctx = createMockContext({
      source: 'slash',
      invokedPrefix: '/',
      guildId: 'guild-abc',
    });

    const mockServices = {
      guildSettingsService: {
        getPrefix: vi.fn().mockResolvedValue('?'),
      },
    } as unknown as BotServices;

    const prefix = await resolveContextPrefix(ctx, mockServices);
    expect(prefix).toBe('?');
    expect(mockServices.guildSettingsService.getPrefix).toHaveBeenCalledWith('guild-abc', DEFAULT_COMMAND_PREFIX);
  });

  it('falls back to DEFAULT_COMMAND_PREFIX when outside guild and not invoked via custom prefix', async () => {
    const ctx = createMockContext({
      source: 'slash',
      invokedPrefix: '/',
      guildId: null,
    });

    const prefix = await resolveContextPrefix(ctx);
    expect(prefix).toBe(DEFAULT_COMMAND_PREFIX);
    expect(prefix).toBe('!');
  });

  it('falls back gracefully if guildSettingsService throws an error', async () => {
    const ctx = createMockContext({
      source: 'slash',
      invokedPrefix: '/',
      guildId: 'guild-error',
    });

    const mockServices = {
      guildSettingsService: {
        getPrefix: vi.fn().mockRejectedValue(new Error('DB failure')),
      },
    } as unknown as BotServices;

    const prefix = await resolveContextPrefix(ctx, mockServices);
    expect(prefix).toBe(DEFAULT_COMMAND_PREFIX);
  });
});
