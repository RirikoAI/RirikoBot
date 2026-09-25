import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordAPIError } from '@discordjs/rest';
import type { APIEmbed } from 'discord-api-types/v10';
import { DiscordNotifier } from './discord-notifier';

const DASHBOARD = 'https://dash.example.com';
const GUILD = '100000000000000001';
const context = {
  at: new Date('2026-09-25T10:00:00Z'),
  ipAddress: '203.0.113.7',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
};

function discordError(code: number, status: number) {
  return new DiscordAPIError(
    { code, message: 'Cannot send messages to this user' },
    code,
    status,
    'POST',
    '/channels/1/messages',
    {},
  );
}

describe('DiscordNotifier (TASK-1172)', () => {
  let post: ReturnType<typeof vi.fn>;
  let logChannelId: string | null;
  let notifier: DiscordNotifier;

  beforeEach(() => {
    post = vi.fn(async (route: string) => (route === '/users/@me/channels' ? { id: 'dm-1' } : {}));
    logChannelId = 'log-1';
    notifier = new DiscordNotifier({
      rest: { post } as never,
      guildSettings: { findById: async () => ({ logChannelId }) as never },
      dashboardUrl: DASHBOARD,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sentEmbed = (call = 1): APIEmbed => post.mock.calls[call]?.[1].body.embeds[0];

  it('opens a DM channel and sends the new-device alert without pinging anyone', async () => {
    await notifier.newDeviceSignIn('user-1', context);

    expect(post).toHaveBeenNthCalledWith(1, '/users/@me/channels', {
      body: { recipient_id: 'user-1' },
    });
    expect(post.mock.calls[1]?.[0]).toBe('/channels/dm-1/messages');
    expect(post.mock.calls[1]?.[1].body.allowed_mentions).toEqual({ parse: [] });
    const embed = sentEmbed();
    expect(embed.title).toBe('New sign-in to the Ririko dashboard');
    expect(embed.fields).toEqual([
      { name: 'When', value: '<t:1790330400:F>', inline: true },
      { name: 'Browser', value: 'Chrome on Windows', inline: true },
      { name: 'IP address', value: '203.0.113.7', inline: true },
      expect.objectContaining({
        name: 'Not you?',
        value: expect.stringContaining(`${DASHBOARD}/account/sessions`),
      }),
    ]);
  });

  it('never lets user-controlled text become a link or break out of inline code', async () => {
    await notifier.passkeyRemoved('user-1', 'x` [Secure your account](https://evil.example)', 0, {
      ...context,
      ipAddress: '[click](https://evil.example)',
      userAgent: '[click](https://evil.example)',
    });

    const embed = sentEmbed();
    expect(embed.description).toBe(
      'The passkey `xˋ [Secure your account](https://evil.example)` was removed. You have no passkeys left, so signing in to the dashboard only needs Discord again.',
    );
    expect(embed.fields?.slice(1, 3).map((field) => field.value)).toEqual([
      'Unknown browser',
      'Unknown',
    ]);
  });

  it('logs and swallows DM failures such as users who block DMs', async () => {
    post.mockImplementation(async (route: string) => {
      if (route === '/users/@me/channels') return { id: 'dm-1' };
      throw discordError(50007, 403);
    });
    await expect(notifier.passkeyAdded('user-1', 'Laptop', context)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Discord error 50007'));

    post.mockRejectedValue(new Error('network down'));
    await expect(notifier.newDeviceSignIn('user-1', context)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('posts dashboard changes to the guild log channel with field diffs', async () => {
    await notifier.guildSettingsChanged(GUILD, {
      userId: 'user-1',
      module: 'general',
      changes: [
        { field: 'prefix', before: '!', after: '@everyone' },
        { field: 'timezone', before: null, after: 'Asia/Tokyo' },
      ],
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[0]).toBe('/channels/log-1/messages');
    expect(post.mock.calls[0]?.[1].body.allowed_mentions).toEqual({ parse: [] });
    const embed: APIEmbed = post.mock.calls[0]?.[1].body.embeds[0];
    expect(embed.url).toBe(`${DASHBOARD}/dashboard/${GUILD}/general`);
    expect(embed.description).toBe(
      [
        '<@user-1> changed the **General** settings on the dashboard.',
        '`prefix`: `!` → `@everyone`',
        '`timezone`: *none* → `Asia/Tokyo`',
      ].join('\n'),
    );
  });

  it('lists at most ten changes and skips guilds without a log channel', async () => {
    const changes = Array.from({ length: 12 }, (_, index) => ({
      field: `field${index}`,
      before: index,
      after: index + 1,
    }));
    await notifier.guildSettingsChanged(GUILD, { userId: 'user-1', module: 'general', changes });
    const description = (post.mock.calls[0]?.[1].body.embeds[0] as APIEmbed).description ?? '';
    expect(description.split('\n')).toHaveLength(12);
    expect(description).toContain('…and 2 more (see the audit log).');

    post.mockClear();
    logChannelId = null;
    await notifier.guildSettingsChanged(GUILD, { userId: 'user-1', module: 'general', changes });
    expect(post).not.toHaveBeenCalled();
  });
});
