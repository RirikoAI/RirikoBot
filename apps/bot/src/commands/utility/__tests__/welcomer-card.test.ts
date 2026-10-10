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

describe('/welcomer and /farewell text message (TASK-1333)', () => {
  const stored = {
    guildId: 'guild-1',
    channelId: CHANNEL,
    messageTemplate: 'Hi {user}',
    cardTheme: 'DEFAULT',
    backgroundUrl: null,
    backgroundFile: null,
    textColor: '#ffffff',
    isEnabled: true,
    textMessageEnabled: false,
    textMessage: '',
  };

  function bot(s: ReturnType<typeof services>) {
    return {
      ...s.value,
      welcomerService: { backgrounds: { prune: s.prune } },
    } as unknown as BotServices;
  }

  /** A prefix invocation such as `!welcomer text Read #rules`. */
  function prefixContext(args: string[]) {
    const ctx = context({});
    ctx.source = 'prefix';
    ctx.options.getRawArgs = () => args;
    return ctx;
  }

  function summaryOf(ctx: { reply: ReturnType<typeof vi.fn> }) {
    const reply = ctx.reply.mock.calls.at(-1)![0] as { embeds: { data: { fields: any[] } }[] };
    return reply.embeds[0]!.data.fields.find((field) => field.name === 'Text Message');
  }

  it('text:<message> sets the message and turns the text on', async () => {
    const s = services(stored);
    const ctx = context({ text: '  Welcome {user}! Read #rules  ' });
    await createWelcomerCommand(bot(s)).execute(ctx);
    expect(s.saved).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-1',
        textMessageEnabled: true,
        textMessage: 'Welcome {user}! Read #rules',
        messageTemplate: 'Hi {user}',
      }),
    );
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('updated') }),
    );
  });

  it('text:none turns the text off and keeps the stored message', async () => {
    const s = services({ ...stored, textMessageEnabled: true, textMessage: 'Read #rules' });
    await createFarewellCommand(bot(s)).execute(context({ text: ' None ' }));
    expect(s.saved).toHaveBeenCalledWith(
      expect.objectContaining({ textMessageEnabled: false, textMessage: 'Read #rules' }),
    );
  });

  it('keeps the text settings when other fields change', async () => {
    const s = services({ ...stored, textMessageEnabled: true, textMessage: 'Read #rules' });
    await createWelcomerCommand(bot(s)).execute(context({ color: '#000000' }));
    expect(s.saved).toHaveBeenCalledWith(
      expect.objectContaining({
        textColor: '#000000',
        textMessageEnabled: true,
        textMessage: 'Read #rules',
      }),
    );
  });

  it('defaults the text to off and empty for a card that has none stored', async () => {
    const s = services({ ...stored, textMessageEnabled: undefined, textMessage: undefined });
    await createWelcomerCommand(bot(s)).execute(context({ color: '#000000' }));
    expect(s.saved).toHaveBeenCalledWith(
      expect.objectContaining({ textMessageEnabled: false, textMessage: '' }),
    );
  });

  it('refuses an empty text and one over 2000 characters', async () => {
    const s = services(stored);
    const empty = context({ text: '   ' });
    await createWelcomerCommand(bot(s)).execute(empty);
    expect(empty.reply).toHaveBeenCalledWith(expect.stringContaining('1 to 2000 characters'));

    const long = context({ text: 'x'.repeat(2001) });
    await createFarewellCommand(bot(s)).execute(long);
    expect(long.reply).toHaveBeenCalledWith(expect.stringContaining('1 to 2000 characters'));
    expect(s.saved).not.toHaveBeenCalled();
  });

  it('reads the prefix forms "text <message>" and "text none"', async () => {
    const s = services(stored);
    await createWelcomerCommand(bot(s)).execute(
      prefixContext(['text', 'Read', '#rules', '{user}']),
    );
    expect(s.saved).toHaveBeenLastCalledWith(
      expect.objectContaining({ textMessageEnabled: true, textMessage: 'Read #rules {user}' }),
    );

    await createFarewellCommand(bot(s)).execute(prefixContext(['text', 'none']));
    expect(s.saved).toHaveBeenLastCalledWith(
      expect.objectContaining({ textMessageEnabled: false }),
    );

    const bare = prefixContext(['text']);
    await createWelcomerCommand(bot(s)).execute(bare);
    expect(bare.reply).toHaveBeenCalledWith(expect.stringContaining('1 to 2000 characters'));
    expect(s.saved).toHaveBeenCalledTimes(2);
  });

  it('shows whether the text is on, and the message, in the summary', async () => {
    const on = context({});
    await createWelcomerCommand(
      bot(services({ ...stored, textMessageEnabled: true, textMessage: 'Read `#rules`' })),
    ).execute(on);
    expect(summaryOf(on).value).toBe("✅ On: `Read '#rules'`");

    const kept = context({});
    await createWelcomerCommand(bot(services({ ...stored, textMessage: 'Read #rules' }))).execute(
      kept,
    );
    expect(summaryOf(kept).value).toBe('Off (message kept): `Read #rules`');

    const off = context({});
    await createWelcomerCommand(bot(services(stored))).execute(off);
    expect(summaryOf(off).value).toBe('Off');

    const long = context({});
    await createWelcomerCommand(
      bot(services({ ...stored, textMessageEnabled: true, textMessage: 'y'.repeat(1500) })),
    ).execute(long);
    expect(summaryOf(long).value.length).toBeLessThanOrEqual(1024);
  });

  it('offers a text option on both commands within the 100 character limit', () => {
    for (const create of [createWelcomerCommand, createFarewellCommand]) {
      const { metadata } = create(services().value as unknown as BotServices);
      const option = metadata.options!.find((candidate) => candidate.name === 'text');
      expect(option).toMatchObject({ type: 'STRING', required: false });
      expect(option!.description.length).toBeLessThanOrEqual(100);
      expect(metadata.usage).toContain('[text]');
    }
  });
});
