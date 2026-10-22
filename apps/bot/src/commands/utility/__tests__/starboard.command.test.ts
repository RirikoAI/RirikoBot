import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { GuildConfigSchemas } from '@ririko/core';
import { CommandCategory } from '@ririko/discord';
import { GuildConfigValidationError, fieldErrorsOf } from '@ririko/services';
import type { BotServices } from '../../../services.js';
import { createStarboardCommand } from '../starboard.command.js';

const GUILD_ID = '100000000000000001';
const USER_ID = '300000000000000001';
const STAR_CHANNEL = '200000000000000001';
const OTHER_CHANNEL = '200000000000000002';
const VOICE_CHANNEL = '200000000000000003';
const SPAM_CHANNEL = '200000000000000004';
const CUSTOM_ID = '600000000000000001';
const CUSTOM_EMOJI = `<:star:${CUSTOM_ID}>`;
const FOREIGN_EMOJI = '<:other:600000000000000002>';

interface CtxOptions {
  source?: 'slash' | 'prefix';
  args?: string[];
  strings?: Record<string, string>;
  integers?: Record<string, number>;
  booleans?: Record<string, boolean>;
  slashChannel?: { id: string } | null;
  perms?: bigint[];
  member?: unknown;
  guild?: unknown;
}

function defaultStarboard() {
  return {
    channelId: null as string | null,
    emoji: '⭐',
    threshold: 3,
    allowSelfStar: false,
    ignoredChannelIds: [] as string[],
  };
}

describe('/starboard command (TASK-2023)', () => {
  let stored: ReturnType<typeof defaultStarboard>;
  let update: ReturnType<typeof vi.fn>;
  let get: ReturnType<typeof vi.fn>;
  let services: BotServices;
  let channelCache: Map<string, unknown>;
  let channelFetch: ReturnType<typeof vi.fn>;
  let emojiCache: Map<string, unknown>;
  let botPermissions: { has: ReturnType<typeof vi.fn> };
  let starChannel: Record<string, unknown>;
  let botMember: unknown;

  const command = () => createStarboardCommand(services);
  const manager = [PermissionFlagsBits.ManageGuild];

  function makeCtx(opts: CtxOptions = {}) {
    const reply = vi.fn().mockResolvedValue(undefined);
    const perms = opts.perms ?? manager;
    const ctx: any = {
      source: opts.source ?? 'slash',
      guildId: GUILD_ID,
      guild:
        opts.guild === undefined
          ? {
              id: GUILD_ID,
              channels: { cache: channelCache, fetch: channelFetch },
              emojis: { cache: emojiCache },
              members: { me: botMember },
            }
          : opts.guild,
      member:
        opts.member === undefined
          ? { id: 'member-1', permissions: { has: (flag: bigint) => perms.includes(flag) } }
          : opts.member,
      user: { id: USER_ID },
      options: {
        getString: vi.fn((name: string) => opts.strings?.[name] ?? null),
        getInteger: vi.fn((name: string) => opts.integers?.[name] ?? null),
        getBoolean: vi.fn((name: string) => opts.booleans?.[name] ?? null),
        getChannel: vi.fn(async () => opts.slashChannel ?? null),
        getRawArgs: vi.fn().mockReturnValue(opts.args ?? []),
      },
      reply,
    };
    return { ctx, reply };
  }

  function lastText(reply: ReturnType<typeof vi.fn>): string {
    return reply.mock.calls.at(-1)![0].content;
  }

  async function run(opts: CtxOptions) {
    const made = makeCtx(opts);
    await command().execute(made.ctx);
    return made;
  }

  beforeEach(() => {
    starChannel = {
      id: STAR_CHANNEL,
      type: ChannelType.GuildText,
      permissionsFor: vi.fn(() => botPermissions),
    };
    channelCache = new Map<string, unknown>([
      [STAR_CHANNEL, starChannel],
      [
        OTHER_CHANNEL,
        {
          id: OTHER_CHANNEL,
          type: ChannelType.GuildAnnouncement,
          permissionsFor: () => botPermissions,
        },
      ],
      [VOICE_CHANNEL, { id: VOICE_CHANNEL, type: ChannelType.GuildVoice }],
      [SPAM_CHANNEL, { id: SPAM_CHANNEL, type: ChannelType.GuildText }],
    ]);
    channelFetch = vi.fn().mockResolvedValue(null);
    emojiCache = new Map([[CUSTOM_ID, { id: CUSTOM_ID }]]);
    botPermissions = { has: vi.fn().mockReturnValue(true) };
    botMember = { id: 'bot' };
    stored = defaultStarboard();
    get = vi.fn(async () => stored);
    update = vi.fn(async (_guildId: string, _module: string, patch: Record<string, unknown>) => {
      const parsed = GuildConfigSchemas.starboard.safeParse({ ...stored, ...patch });
      if (!parsed.success) throw new GuildConfigValidationError(fieldErrorsOf(parsed.error.issues));
      stored = parsed.data as typeof stored;
      return { values: stored, changes: [] };
    });
    services = { guildConfigService: { get, update } } as unknown as BotServices;
  });

  describe('metadata', () => {
    it('is a guild-registered utility command with five actions and five options', () => {
      const { metadata } = command();
      expect(metadata.name).toBe('starboard');
      expect(metadata.aliases).toEqual(['star-board', 'stars']);
      expect(metadata.registrationScope).toBe('guild');
      expect(metadata.category).toBe(CommandCategory.UTILITY);
      expect(metadata.isGuildOnly).toBe(true);
      expect(metadata.options!.map((o) => o.name)).toEqual([
        'action',
        'channel',
        'emoji',
        'threshold',
        'enabled',
      ]);
      const types = Object.fromEntries(metadata.options!.map((o) => [o.name, o.type]));
      expect(types).toMatchObject({ channel: 'CHANNEL', threshold: 'INTEGER', enabled: 'BOOLEAN' });
      const threshold = metadata.options!.find((o) => o.name === 'threshold')!;
      expect([threshold.minValue, threshold.maxValue]).toEqual([1, 100]);
      const action = metadata.options!.find((o) => o.name === 'action')!;
      expect(action.choices!.map((c) => c.value)).toEqual([
        'setup',
        'off',
        'selfstar',
        'ignore',
        'settings',
      ]);
      for (const word of ['setup', 'off', 'selfstar', 'ignore', 'settings']) {
        expect(metadata.usage).toContain(word);
        expect(metadata.examples!.some((e) => e.includes(word))).toBe(true);
      }
      expect(metadata.prefixEnabled).not.toBe(false);
    });
  });

  describe('outside a server, with a bad action or without permission', () => {
    it('refuses without a guild', async () => {
      const { reply } = await run({ guild: null });
      expect(lastText(reply)).toContain('only be used within a server');
    });

    it('shows the usage for an unknown action or extra words', async () => {
      const unknown = await run({ source: 'prefix', args: ['bogus'] });
      expect(lastText(unknown.reply)).toContain('Usage');
      const extra = await run({ source: 'prefix', args: ['off', 'now'] });
      expect(lastText(extra.reply)).toContain('Usage');
      const tooMany = await run({
        source: 'prefix',
        args: ['setup', `<#${STAR_CHANNEL}>`, '⭐', '3', 'more'],
      });
      expect(lastText(tooMany.reply)).toContain('Usage');
      expect(update).not.toHaveBeenCalled();
    });

    it.each(['setup', 'off', 'selfstar', 'ignore', 'settings'])(
      'refuses %s without Manage Server (slash and prefix)',
      async (action) => {
        const slash = await run({
          strings: { action },
          slashChannel: { id: STAR_CHANNEL },
          perms: [PermissionFlagsBits.ManageRoles],
        });
        expect(lastText(slash.reply)).toContain('Manage Server or Administrator');
        const prefix = await run({
          source: 'prefix',
          args: [action],
          perms: [],
        });
        expect(lastText(prefix.reply)).toContain('Manage Server or Administrator');
        expect(update).not.toHaveBeenCalled();
      },
    );

    it('refuses with no action and no permission, and without a member', async () => {
      const none = await run({ source: 'prefix', args: [], perms: [] });
      expect(lastText(none.reply)).toContain('Manage Server or Administrator');
      const noMember = await run({ member: null });
      expect(lastText(noMember.reply)).toContain('Manage Server or Administrator');
    });

    it('lets an Administrator through', async () => {
      const { reply } = await run({ perms: [PermissionFlagsBits.Administrator] });
      expect(lastText(reply)).toContain('Starboard settings');
    });
  });

  describe('setup', () => {
    it('saves the channel, emoji and threshold from slash options', async () => {
      const { reply } = await run({
        strings: { action: 'setup', emoji: '🌟' },
        integers: { threshold: 5 },
        slashChannel: { id: STAR_CHANNEL },
      });
      expect(update).toHaveBeenCalledWith(
        GUILD_ID,
        'starboard',
        { channelId: STAR_CHANNEL, emoji: '🌟', threshold: 5 },
        { userId: USER_ID, source: 'discord' },
      );
      expect(stored).toMatchObject({ channelId: STAR_CHANNEL, emoji: '🌟', threshold: 5 });
      const text = lastText(reply);
      expect(text).toContain('now **on**');
      expect(text).toContain(`<#${STAR_CHANNEL}>`);
      expect(text).toContain('**5** 🌟');
      expect(text).toContain('Starboard** page of the dashboard');
      expect(reply.mock.calls.at(-1)![0].ephemeral).toBe(true);
    });

    it('saves the same values from a prefix command', async () => {
      const { reply } = await run({
        source: 'prefix',
        args: ['setup', `<#${STAR_CHANNEL}>`, '🌟', '5'],
      });
      expect(stored).toMatchObject({ channelId: STAR_CHANNEL, emoji: '🌟', threshold: 5 });
      expect(lastText(reply)).toContain('now **on**');
    });

    it('keeps the current emoji and threshold when they are not given', async () => {
      stored.emoji = '🌟';
      stored.threshold = 7;
      const { ctx } = makeCtx({ source: 'prefix', args: ['setup', STAR_CHANNEL] });
      await command().execute(ctx);
      expect(update.mock.calls[0]![2]).toEqual({ channelId: STAR_CHANNEL });
      expect(stored).toMatchObject({ channelId: STAR_CHANNEL, emoji: '🌟', threshold: 7 });
    });

    it('reads a lone number after the channel as the threshold', async () => {
      await run({ source: 'prefix', args: ['setup', STAR_CHANNEL, '10'] });
      expect(update.mock.calls[0]![2]).toEqual({ channelId: STAR_CHANNEL, threshold: 10 });
    });

    it('accepts an announcement channel', async () => {
      await run({ source: 'prefix', args: ['setup', OTHER_CHANNEL] });
      expect(stored.channelId).toBe(OTHER_CHANNEL);
    });

    it('asks for a channel when none is given', async () => {
      const slash = await run({ strings: { action: 'setup' } });
      expect(lastText(slash.reply)).toContain('Say which channel');
      const prefix = await run({ source: 'prefix', args: ['setup'] });
      expect(lastText(prefix.reply)).toContain('Say which channel');
      expect(update).not.toHaveBeenCalled();
    });

    it('refuses a channel it cannot find', async () => {
      const text = await run({ source: 'prefix', args: ['setup', '#nowhere'] });
      expect(lastText(text.reply)).toContain('could not find that channel');
      const missing = await run({ source: 'prefix', args: ['setup', '999999999999999999'] });
      expect(lastText(missing.reply)).toContain('could not find that channel');
      expect(channelFetch).toHaveBeenCalledWith('999999999999999999');
      expect(update).not.toHaveBeenCalled();
    });

    it('fetches a channel that is not cached', async () => {
      const fetched = {
        id: '200000000000000099',
        type: ChannelType.GuildText,
        permissionsFor: () => botPermissions,
      };
      channelFetch.mockResolvedValue(fetched);
      await run({ source: 'prefix', args: ['setup', fetched.id] });
      expect(stored.channelId).toBe(fetched.id);
    });

    it('refuses a channel that is not a text or announcement channel', async () => {
      const { reply } = await run({ source: 'prefix', args: ['setup', VOICE_CHANNEL] });
      expect(lastText(reply)).toContain('text or announcement channel');
      expect(update).not.toHaveBeenCalled();
    });

    it('shows the schema message for an invalid emoji', async () => {
      const { reply } = await run({ source: 'prefix', args: ['setup', STAR_CHANNEL, 'hello'] });
      expect(lastText(reply)).toContain('Use one emoji');
      expect(stored.channelId).toBeNull();
    });

    it('shows the schema message for a threshold out of range', async () => {
      const prefix = await run({ source: 'prefix', args: ['setup', STAR_CHANNEL, '⭐', '101'] });
      expect(lastText(prefix.reply)).toContain('Enter a whole number from 1 to 100');
      const zero = await run({ source: 'prefix', args: ['setup', STAR_CHANNEL, '⭐', '0'] });
      expect(lastText(zero.reply)).toContain('Enter a whole number from 1 to 100');
      expect(stored.channelId).toBeNull();
    });

    it('refuses a threshold that is not a number', async () => {
      const { reply } = await run({
        source: 'prefix',
        args: ['setup', STAR_CHANNEL, '⭐', 'three'],
      });
      expect(lastText(reply)).toContain('whole number from 1 to 100');
      expect(update).not.toHaveBeenCalled();
    });

    it('warns, without refusing, when Ririko cannot post in the channel', async () => {
      botPermissions.has.mockImplementation(
        (flag: bigint) => flag !== PermissionFlagsBits.EmbedLinks,
      );
      const { reply } = await run({ source: 'prefix', args: ['setup', STAR_CHANNEL] });
      expect(stored.channelId).toBe(STAR_CHANNEL);
      const text = lastText(reply);
      expect(text).toContain('now **on**');
      expect(text).toContain('**Embed Links**');
      expect(text).not.toContain('View Channel');
    });

    it('lists every missing permission when Ririko has no access', async () => {
      botPermissions.has.mockReturnValue(false);
      const { reply } = await run({ source: 'prefix', args: ['setup', STAR_CHANNEL] });
      expect(lastText(reply)).toContain('**View Channel**, **Send Messages**, **Embed Links**');
      botPermissions.has.mockReturnValue(true);
      (starChannel.permissionsFor as ReturnType<typeof vi.fn>).mockReturnValue(null);
      const noOverwrites = await run({ source: 'prefix', args: ['setup', STAR_CHANNEL] });
      expect(lastText(noOverwrites.reply)).toContain('**View Channel**');
    });

    it('skips the permission check when Ririko is not in the member cache', async () => {
      botMember = null;
      const { reply } = await run({ source: 'prefix', args: ['setup', STAR_CHANNEL] });
      expect(lastText(reply)).not.toContain('I do not have');
      expect(starChannel.permissionsFor).not.toHaveBeenCalled();
    });

    it('accepts a server custom emoji and warns about one it cannot see', async () => {
      const known = await run({ source: 'prefix', args: ['setup', STAR_CHANNEL, CUSTOM_EMOJI] });
      expect(stored.emoji).toBe(CUSTOM_EMOJI);
      expect(lastText(known.reply)).not.toContain('cannot find the custom emoji');

      const foreign = await run({ source: 'prefix', args: ['setup', STAR_CHANNEL, FOREIGN_EMOJI] });
      expect(stored.emoji).toBe(FOREIGN_EMOJI);
      expect(lastText(foreign.reply)).toContain('cannot find the custom emoji');
    });
  });

  describe('off', () => {
    it('clears the channel and keeps the other settings', async () => {
      stored = { ...stored, channelId: STAR_CHANNEL, emoji: '🌟', threshold: 4 };
      const { reply } = await run({ strings: { action: 'off' } });
      expect(update).toHaveBeenCalledWith(
        GUILD_ID,
        'starboard',
        { channelId: null },
        { userId: USER_ID, source: 'discord' },
      );
      expect(stored).toMatchObject({ channelId: null, emoji: '🌟', threshold: 4 });
      expect(lastText(reply)).toContain('now **off**');
      expect(lastText(reply)).toContain('dashboard');
    });

    it('works as a prefix command', async () => {
      stored.channelId = STAR_CHANNEL;
      const { reply } = await run({ source: 'prefix', args: ['off'] });
      expect(stored.channelId).toBeNull();
      expect(lastText(reply)).toContain('now **off**');
    });

    it('says so when the starboard is already off', async () => {
      const { reply } = await run({ strings: { action: 'off' } });
      expect(lastText(reply)).toContain('already **off**');
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('selfstar', () => {
    it('shows the current value when none is given', async () => {
      stored.allowSelfStar = true;
      const slash = await run({ strings: { action: 'selfstar' } });
      expect(lastText(slash.reply)).toContain('**on**');
      const prefix = await run({ source: 'prefix', args: ['selfstar'] });
      expect(lastText(prefix.reply)).toContain('**on**');
      expect(update).not.toHaveBeenCalled();
    });

    it('turns it on and off from a slash boolean', async () => {
      const on = await run({ strings: { action: 'selfstar' }, booleans: { enabled: true } });
      expect(stored.allowSelfStar).toBe(true);
      expect(lastText(on.reply)).toContain('**counts**');
      const off = await run({ strings: { action: 'selfstar' }, booleans: { enabled: false } });
      expect(stored.allowSelfStar).toBe(false);
      expect(lastText(off.reply)).toContain('**does not count**');
      expect(update).toHaveBeenCalledWith(
        GUILD_ID,
        'starboard',
        { allowSelfStar: false },
        { userId: USER_ID, source: 'discord' },
      );
    });

    it('turns it on and off from prefix words', async () => {
      await run({ source: 'prefix', args: ['selfstar', 'on'] });
      expect(stored.allowSelfStar).toBe(true);
      await run({ source: 'prefix', args: ['selfstar', 'off'] });
      expect(stored.allowSelfStar).toBe(false);
    });

    it('saves nothing for a word that is not on or off', async () => {
      const { reply } = await run({ source: 'prefix', args: ['selfstar', 'maybe'] });
      expect(lastText(reply)).toContain('Say `on` or `off`');
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('ignore', () => {
    it('adds a channel from a slash option', async () => {
      const { reply } = await run({
        strings: { action: 'ignore' },
        slashChannel: { id: SPAM_CHANNEL },
      });
      expect(update).toHaveBeenCalledWith(
        GUILD_ID,
        'starboard',
        { ignoredChannelIds: [SPAM_CHANNEL] },
        { userId: USER_ID, source: 'discord' },
      );
      expect(lastText(reply)).toContain('will never reach the starboard');
      expect(lastText(reply)).toContain(`<#${SPAM_CHANNEL}>`);
    });

    it('adds a channel from a prefix mention, keeping the others', async () => {
      stored.ignoredChannelIds = [VOICE_CHANNEL];
      await run({ source: 'prefix', args: ['ignore', `<#${SPAM_CHANNEL}>`] });
      expect(stored.ignoredChannelIds).toEqual([VOICE_CHANNEL, SPAM_CHANNEL]);
    });

    it('removes a channel that is already ignored, even one that was deleted', async () => {
      const gone = '200000000000000077';
      stored.ignoredChannelIds = [SPAM_CHANNEL, gone];
      const first = await run({ source: 'prefix', args: ['ignore', SPAM_CHANNEL] });
      expect(stored.ignoredChannelIds).toEqual([gone]);
      expect(lastText(first.reply)).toContain('can reach the starboard again');
      await run({ source: 'prefix', args: ['ignore', gone] });
      expect(stored.ignoredChannelIds).toEqual([]);
    });

    it('asks for a channel and refuses one it cannot find', async () => {
      const none = await run({ source: 'prefix', args: ['ignore'] });
      expect(lastText(none.reply)).toContain('Say which channel');
      const text = await run({ source: 'prefix', args: ['ignore', '#nowhere'] });
      expect(lastText(text.reply)).toContain('could not find that channel');
      const missing = await run({ source: 'prefix', args: ['ignore', '999999999999999999'] });
      expect(lastText(missing.reply)).toContain('could not find that channel');
      expect(update).not.toHaveBeenCalled();
    });

    it('shows the schema message when the list would be too long', async () => {
      stored.ignoredChannelIds = Array.from({ length: 25 }, (_, i) => `4000000000000000${10 + i}`);
      const { reply } = await run({ source: 'prefix', args: ['ignore', SPAM_CHANNEL] });
      expect(lastText(reply)).toContain('Choose at most 25');
      expect(stored.ignoredChannelIds).toHaveLength(25);
    });
  });

  describe('settings', () => {
    it('shows the settings of a server that has not set up the starboard', async () => {
      const { reply } = await run({ strings: { action: 'settings' } });
      const text = lastText(reply);
      expect(text).toContain('Starboard: off');
      expect(text).toContain('Emoji: ⭐');
      expect(text).toContain('Stars needed: 3');
      expect(text).toContain("The author's own star counts: off");
      expect(text).toContain('Ignored channels: none');
      expect(text).toContain('/starboard action:setup');
      expect(reply.mock.calls.at(-1)![0].ephemeral).toBe(true);
    });

    it('shows the channel, emoji, threshold, self-star and ignored channels', async () => {
      stored = {
        channelId: STAR_CHANNEL,
        emoji: CUSTOM_EMOJI,
        threshold: 8,
        allowSelfStar: true,
        ignoredChannelIds: [SPAM_CHANNEL, VOICE_CHANNEL],
      };
      const { reply } = await run({ source: 'prefix', args: ['settings'] });
      const text = lastText(reply);
      expect(text).toContain(`on, in <#${STAR_CHANNEL}>`);
      expect(text).toContain(`Emoji: ${CUSTOM_EMOJI}`);
      expect(text).toContain('Stars needed: 8');
      expect(text).toContain("The author's own star counts: on");
      expect(text).toContain(`<#${SPAM_CHANNEL}> <#${VOICE_CHANNEL}>`);
      expect(text).not.toContain('/starboard action:setup');
    });

    it('is the default for a slash command and a prefix command with no action', async () => {
      const slash = await run({});
      expect(lastText(slash.reply)).toContain('Starboard settings');
      const prefix = await run({ source: 'prefix', args: [] });
      expect(lastText(prefix.reply)).toContain('Starboard settings');
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('failures', () => {
    it('rethrows an error that is not a validation error', async () => {
      update.mockRejectedValueOnce(new Error('database is down'));
      await expect(run({ source: 'prefix', args: ['setup', STAR_CHANNEL] })).rejects.toThrow(
        'database is down',
      );
    });
  });
});
