import dns from 'node:dns/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BotServices } from '../../../services.js';
import { createFarewellCommand } from '../farewell.command.js';
import { createWelcomerCommand } from '../welcomer.command.js';

const CHANNEL = '123456789012345678';

function services(existing: Record<string, unknown> | null = null) {
  const saved = vi.fn(async (data: unknown) => data);
  return {
    saved,
    prune: vi.fn().mockResolvedValue(undefined),
    value: {
      welcomerRepo: {
        getWelcomeConfig: vi.fn().mockResolvedValue(existing),
        setWelcomeConfig: saved,
        getFarewellConfig: vi.fn().mockResolvedValue(existing),
        setFarewellConfig: saved,
      },
    },
  };
}

function context(options: Record<string, unknown>) {
  return {
    source: 'slash',
    guild: {
      id: 'guild-1',
      channels: {
        cache: new Map([[CHANNEL, { isTextBased: () => true }]]),
        fetch: vi.fn().mockRejectedValue(new Error('Unknown Channel')),
      },
    },
    member: { permissions: { has: vi.fn().mockReturnValue(true) } },
    options: {
      getString: (name: string) => (options[name] as string | undefined) ?? null,
      getBoolean: (name: string) => (options[name] as boolean | undefined) ?? null,
      getChannel: async (name: string) => (options[name] ? { id: options[name] } : null),
      getRawArgs: () => [],
    },
    reply: vi.fn(),
  } as any;
}

describe('/welcomer and /farewell (TASK-1663)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses a background link that resolves to a private address', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '10.0.0.8', family: 4 }] as never);
    const s = services();
    const ctx = context({ background: 'https://intranet.example/bg.png' });
    await createWelcomerCommand({
      ...s.value,
      welcomerService: { backgrounds: { prune: s.prune } },
    } as unknown as BotServices).execute(ctx);
    expect(s.saved).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('public image'));
  });

  it('refuses a named color and a channel of another server', async () => {
    const s = services();
    const bot = {
      ...s.value,
      welcomerService: { backgrounds: { prune: s.prune } },
    } as unknown as BotServices;
    const colorCtx = context({ color: 'red' });
    await createFarewellCommand(bot).execute(colorCtx);
    expect(colorCtx.reply).toHaveBeenCalledWith(expect.stringContaining('#ffffff'));

    const channelCtx = context({ channel: '999999999999999999' });
    await createFarewellCommand(bot).execute(channelCtx);
    expect(channelCtx.reply).toHaveBeenCalledWith(expect.stringContaining('text channel'));
    expect(s.saved).not.toHaveBeenCalled();
  });

  it('replaces an uploaded background with a public link and deletes old uploads', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const s = services({
      guildId: 'guild-1',
      channelId: CHANNEL,
      messageTemplate: 'Hi {user}',
      cardTheme: 'DEFAULT',
      backgroundUrl: null,
      backgroundFile: 'upload.png',
      textColor: '#ffffff',
      isEnabled: true,
    });
    const ctx = context({ background: 'https://example.com/bg.png', color: '#00FF00' });
    await createWelcomerCommand({
      ...s.value,
      welcomerService: { backgrounds: { prune: s.prune } },
    } as unknown as BotServices).execute(ctx);
    expect(s.saved).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundUrl: 'https://example.com/bg.png',
        backgroundFile: null,
        textColor: '#00ff00',
      }),
    );
    expect(s.prune).toHaveBeenCalledWith('guild-1', 'welcome', null);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('updated') }),
    );
  });
});
