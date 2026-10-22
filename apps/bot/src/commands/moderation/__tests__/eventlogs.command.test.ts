import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { GuildConfigSchemas, MAX_EVENT_LOG_IGNORED_CHANNELS } from '@ririko/core';
import { CommandCategory } from '@ririko/discord';
import { GuildConfigValidationError, fieldErrorsOf } from '@ririko/services';
import type { BotServices } from '../../../services.js';
import { createEventLogsCommand } from '../eventlogs.command.js';

const GUILD_ID = '100000000000000001';
const USER_ID = '300000000000000001';
const LOG_CHANNEL = '200000000000000001';
const NEWS_CHANNEL = '200000000000000002';
const VOICE_CHANNEL = '200000000000000003';
const SPAM_CHANNEL = '200000000000000004';

interface CtxOptions {
  source?: 'slash' | 'prefix';
  args?: string[];
  strings?: Record<string, string>;
  booleans?: Record<string, boolean>;
  slashChannel?: { id: string } | null;
  perms?: bigint[];
  member?: unknown;
  guild?: unknown;
}

function defaultEventLogs() {
  return {
    messageChannelId: null as string | null,
    memberChannelId: null as string | null,
    serverChannelId: null as string | null,
    voiceChannelId: null as string | null,
    ignoredChannelIds: [] as string[],
    ignoreBots: false,
  };
}

describe('/eventlogs command (TASK-2024)', () => {
  let stored: ReturnType<typeof defaultEventLogs>;
  let update: ReturnType<typeof vi.fn>;
  let get: ReturnType<typeof vi.fn>;
  let services: BotServices;
  let channelCache: Map<string, unknown>;
  let channelFetch: ReturnType<typeof vi.fn>;
  let botPermissions: { has: ReturnType<typeof vi.fn> };
  let botMember: unknown;

  const command = () => createEventLogsCommand(services);
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
    botPermissions = { has: vi.fn().mockReturnValue(true) };
    botMember = { id: 'bot' };
    channelCache = new Map<string, unknown>([
      [
        LOG_CHANNEL,
        { id: LOG_CHANNEL, type: ChannelType.GuildText, permissionsFor: () => botPermissions },
      ],
      [
        NEWS_CHANNEL,
        {
          id: NEWS_CHANNEL,
          type: ChannelType.GuildAnnouncement,
          permissionsFor: () => botPermissions,
        },
      ],
      [VOICE_CHANNEL, { id: VOICE_CHANNEL, type: ChannelType.GuildVoice }],
      [SPAM_CHANNEL, { id: SPAM_CHANNEL, type: ChannelType.GuildText }],
    ]);
    channelFetch = vi.fn().mockResolvedValue(null);
    stored = defaultEventLogs();
    get = vi.fn(async () => stored);
    update = vi.fn(async (_guildId: string, _module: string, patch: Record<string, unknown>) => {
      const parsed = GuildConfigSchemas.eventlogs.safeParse({ ...stored, ...patch });
      if (!parsed.success) throw new GuildConfigValidationError(fieldErrorsOf(parsed.error.issues));
      stored = parsed.data as typeof stored;
      return { values: stored, changes: [] };
    });
    services = { guildConfigService: { get, update } } as unknown as BotServices;
  });

  describe('metadata', () => {
    it('is a guild-registered moderation command with five actions', () => {
      const { metadata } = command();
      expect(metadata.name).toBe('eventlogs');
      expect(metadata.aliases).toEqual(['eventlog', 'event-logs']);
      expect(metadata.registrationScope).toBe('guild');
      expect(metadata.category).toBe(CommandCategory.MODERATION);
      expect(metadata.isGuildOnly).toBe(true);
      expect(metadata.options!.map((o) => o.name)).toEqual([
        'action',
        'type',
        'channel',
        'enabled',
      ]);
      const types = Object.fromEntries(metadata.options!.map((o) => [o.name, o.type]));
      expect(types).toMatchObject({ channel: 'CHANNEL', enabled: 'BOOLEAN', type: 'STRING' });
      const action = metadata.options!.find((o) => o.name === 'action')!;
      expect(action.choices!.map((c) => c.value)).toEqual([
        'set',
        'off',
        'ignore',
        'bots',
        'settings',
      ]);
      const type = metadata.options!.find((o) => o.name === 'type')!;
      expect(type.choices!.map((c) => c.value)).toEqual([
        'message',
        'member',
        'server',
        'voice',
        'all',
      ]);
      for (const word of ['set', 'off', 'ignore', 'bots', 'settings']) {
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
      const extra = await run({ source: 'prefix', args: ['off', 'voice', 'now'] });
      expect(lastText(extra.reply)).toContain('Usage');
      const tooMany = await run({
        source: 'prefix',
        args: ['set', 'message', `<#${LOG_CHANNEL}>`, 'more'],
      });
      expect(lastText(tooMany.reply)).toContain('Usage');
      expect(update).not.toHaveBeenCalled();
    });

    it.each(['set', 'off', 'ignore', 'bots', 'settings'])(
      'refuses %s without Manage Server (slash and prefix)',
      async (action) => {
        const slash = await run({
          strings: { action, type: 'message' },
          slashChannel: { id: LOG_CHANNEL },
          perms: [PermissionFlagsBits.ManageRoles],
        });
        expect(lastText(slash.reply)).toContain('Manage Server or Administrator');
        const prefix = await run({ source: 'prefix', args: [action], perms: [] });
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
      expect(lastText(reply)).toContain('Event log settings');
    });
  });

  describe('set', () => {
    it('turns one log on from slash options, saving only that field', async () => {
      const { reply } = await run({
        strings: { action: 'set', type: 'message' },
        slashChannel: { id: LOG_CHANNEL },
      });
      expect(update).toHaveBeenCalledWith(
        GUILD_ID,
        'eventlogs',
        { messageChannelId: LOG_CHANNEL },
        { userId: USER_ID, source: 'discord' },
      );
      expect(stored.messageChannelId).toBe(LOG_CHANNEL);
      expect(stored.memberChannelId).toBeNull();
      const text = lastText(reply);
      expect(text).toContain('**message** log is now **on**');
      expect(text).toContain(`<#${LOG_CHANNEL}>`);
      expect(text).toContain('**Logging** page of the dashboard');
      expect(reply.mock.calls.at(-1)![0].ephemeral).toBe(true);
    });

    it.each([
      ['message', 'messageChannelId'],
      ['member', 'memberChannelId'],
      ['server', 'serverChannelId'],
      ['voice', 'voiceChannelId'],
    ])('maps the %s log to %s on a prefix command', async (type, field) => {
      const { reply } = await run({ source: 'prefix', args: ['set', type, `<#${LOG_CHANNEL}>`] });
      expect(update.mock.calls[0]![2]).toEqual({ [field]: LOG_CHANNEL });
      expect(lastText(reply)).toContain(`**${type}** log is now **on**`);
    });

    it('reads the type in any case and a bare channel ID', async () => {
      await run({ source: 'prefix', args: ['SET', 'Voice', LOG_CHANNEL] });
      expect(stored.voiceChannelId).toBe(LOG_CHANNEL);
    });

    it('sets all four logs for "all"', async () => {
      const { reply } = await run({
        strings: { action: 'set', type: 'all' },
        slashChannel: { id: LOG_CHANNEL },
      });
      expect(update.mock.calls[0]![2]).toEqual({
        messageChannelId: LOG_CHANNEL,
        memberChannelId: LOG_CHANNEL,
        serverChannelId: LOG_CHANNEL,
        voiceChannelId: LOG_CHANNEL,
      });
      expect(lastText(reply)).toContain('All four event logs');
    });

    it('accepts an announcement channel', async () => {
      await run({ source: 'prefix', args: ['set', 'server', NEWS_CHANNEL] });
      expect(stored.serverChannelId).toBe(NEWS_CHANNEL);
    });

    it('asks for a type when it is missing or wrong', async () => {
      const none = await run({ strings: { action: 'set' }, slashChannel: { id: LOG_CHANNEL } });
      expect(lastText(none.reply)).toContain('Say which log');
      const bad = await run({ source: 'prefix', args: ['set', 'audit', LOG_CHANNEL] });
      expect(lastText(bad.reply)).toContain('Say which log');
      const swapped = await run({ source: 'prefix', args: ['set', LOG_CHANNEL] });
      expect(lastText(swapped.reply)).toContain('Say which log');
      expect(update).not.toHaveBeenCalled();
    });

    it('asks for a channel when none is given', async () => {
      const slash = await run({ strings: { action: 'set', type: 'voice' } });
      expect(lastText(slash.reply)).toContain('Say which channel');
      const prefix = await run({ source: 'prefix', args: ['set', 'voice'] });
      expect(lastText(prefix.reply)).toContain('Say which channel');
      expect(update).not.toHaveBeenCalled();
    });

    it('refuses a channel it cannot find', async () => {
      const text = await run({ source: 'prefix', args: ['set', 'voice', '#nowhere'] });
      expect(lastText(text.reply)).toContain('could not find that channel');
      const missing = await run({ source: 'prefix', args: ['set', 'voice', '999999999999999999'] });
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
      await run({ source: 'prefix', args: ['set', 'member', fetched.id] });
      expect(stored.memberChannelId).toBe(fetched.id);
    });

    it('refuses a channel that is not a text or announcement channel', async () => {
      const { reply } = await run({ source: 'prefix', args: ['set', 'voice', VOICE_CHANNEL] });
      expect(lastText(reply)).toContain('text or announcement channel');
      expect(update).not.toHaveBeenCalled();
    });

    it('warns, without refusing, when Ririko cannot post in the channel', async () => {
      botPermissions.has.mockImplementation(
        (flag: bigint) => flag !== PermissionFlagsBits.EmbedLinks,
      );
      const { reply } = await run({ source: 'prefix', args: ['set', 'message', LOG_CHANNEL] });
      expect(stored.messageChannelId).toBe(LOG_CHANNEL);
      expect(lastText(reply)).toContain('**Embed Links**');
      expect(lastText(reply)).toContain('cannot post there yet');
    });

    it('lists every missing permission', async () => {
      botPermissions.has.mockReturnValue(false);
      const { reply } = await run({ source: 'prefix', args: ['set', 'message', LOG_CHANNEL] });
      expect(lastText(reply)).toContain('View Channel**, **Send Messages**, **Embed Links');
    });

    it('skips the permission warning when the bot member is not cached', async () => {
      botMember = null;
      botPermissions.has.mockReturnValue(false);
      const { reply } = await run({ source: 'prefix', args: ['set', 'message', LOG_CHANNEL] });
      expect(stored.messageChannelId).toBe(LOG_CHANNEL);
      expect(lastText(reply)).not.toContain('cannot post there yet');
    });

    it('shows the schema message and saves nothing when validation fails', async () => {
      update.mockRejectedValueOnce(
        new GuildConfigValidationError({ messageChannelId: ['Enter a channel ID.'] }),
      );
      const { reply } = await run({ source: 'prefix', args: ['set', 'message', LOG_CHANNEL] });
      expect(lastText(reply)).toBe('Enter a channel ID.');
      expect(stored.messageChannelId).toBeNull();
    });

    it('rethrows an error that is not a validation error', async () => {
      update.mockRejectedValueOnce(new Error('database down'));
      await expect(
        run({ source: 'prefix', args: ['set', 'message', LOG_CHANNEL] }),
      ).rejects.toThrow('database down');
    });
  });

  describe('off', () => {
    beforeEach(() => {
      stored = {
        ...defaultEventLogs(),
        messageChannelId: LOG_CHANNEL,
        memberChannelId: LOG_CHANNEL,
        serverChannelId: NEWS_CHANNEL,
        voiceChannelId: NEWS_CHANNEL,
        ignoredChannelIds: [SPAM_CHANNEL],
        ignoreBots: true,
      };
    });

    it('clears one log and keeps the rest', async () => {
      const { reply } = await run({ strings: { action: 'off', type: 'voice' } });
      expect(update).toHaveBeenCalledWith(
        GUILD_ID,
        'eventlogs',
        { voiceChannelId: null },
        { userId: USER_ID, source: 'discord' },
      );
      expect(stored.voiceChannelId).toBeNull();
      expect(stored.serverChannelId).toBe(NEWS_CHANNEL);
      expect(stored.ignoredChannelIds).toEqual([SPAM_CHANNEL]);
      expect(stored.ignoreBots).toBe(true);
      expect(lastText(reply)).toContain('**voice** log is now **off**');
    });

    it('clears every log for "all" on a prefix command', async () => {
      const { reply } = await run({ source: 'prefix', args: ['off', 'ALL'] });
      expect(update.mock.calls[0]![2]).toEqual({
        messageChannelId: null,
        memberChannelId: null,
        serverChannelId: null,
        voiceChannelId: null,
      });
      expect(lastText(reply)).toContain('All four event logs are now **off**');
    });

    it('says so, and saves nothing, when the log is already off', async () => {
      stored.memberChannelId = null;
      const one = await run({ source: 'prefix', args: ['off', 'member'] });
      expect(lastText(one.reply)).toContain('**member** log is already **off**');
      stored = defaultEventLogs();
      const all = await run({ source: 'prefix', args: ['off', 'all'] });
      expect(lastText(all.reply)).toContain('All four event logs are already **off**');
      expect(update).not.toHaveBeenCalled();
    });

    it('asks for a type when it is missing or wrong', async () => {
      const none = await run({ strings: { action: 'off' } });
      expect(lastText(none.reply)).toContain('Say which log');
      const bad = await run({ source: 'prefix', args: ['off', 'audio'] });
      expect(lastText(bad.reply)).toContain('Say which log');
      expect(update).not.toHaveBeenCalled();
    });

    it('shows the schema message when validation fails', async () => {
      update.mockRejectedValueOnce(
        new GuildConfigValidationError({ voiceChannelId: ['Not allowed.'] }),
      );
      const { reply } = await run({ source: 'prefix', args: ['off', 'voice'] });
      expect(lastText(reply)).toBe('Not allowed.');
    });
  });

  describe('ignore', () => {
    it('adds a channel and says it affects the message log only', async () => {
      const { reply } = await run({
        strings: { action: 'ignore' },
        slashChannel: { id: SPAM_CHANNEL },
      });
      expect(update).toHaveBeenCalledWith(
        GUILD_ID,
        'eventlogs',
        { ignoredChannelIds: [SPAM_CHANNEL] },
        { userId: USER_ID, source: 'discord' },
      );
      const text = lastText(reply);
      expect(text).toContain(`<#${SPAM_CHANNEL}>`);
      expect(text).toContain('will skip');
      expect(text).toContain('message log only');
    });

    it('removes a channel that is already ignored, even a deleted one', async () => {
      const gone = '200000000000000077';
      stored.ignoredChannelIds = [SPAM_CHANNEL, gone];
      const { reply } = await run({ source: 'prefix', args: ['ignore', gone] });
      expect(stored.ignoredChannelIds).toEqual([SPAM_CHANNEL]);
      expect(channelFetch).not.toHaveBeenCalled();
      expect(lastText(reply)).toContain('will log');
      expect(lastText(reply)).toContain('message log only');
    });

    it('adds to the existing list on a prefix command', async () => {
      stored.ignoredChannelIds = [NEWS_CHANNEL];
      await run({ source: 'prefix', args: ['ignore', `<#${SPAM_CHANNEL}>`] });
      expect(stored.ignoredChannelIds).toEqual([NEWS_CHANNEL, SPAM_CHANNEL]);
    });

    it('asks for a channel when none is given', async () => {
      const slash = await run({ strings: { action: 'ignore' } });
      expect(lastText(slash.reply)).toContain('Say which channel');
      const prefix = await run({ source: 'prefix', args: ['ignore'] });
      expect(lastText(prefix.reply)).toContain('Say which channel');
      expect(update).not.toHaveBeenCalled();
    });

    it('refuses a channel it cannot find', async () => {
      const text = await run({ source: 'prefix', args: ['ignore', '#nowhere'] });
      expect(lastText(text.reply)).toContain('could not find that channel');
      const missing = await run({ source: 'prefix', args: ['ignore', '999999999999999999'] });
      expect(lastText(missing.reply)).toContain('could not find that channel');
      expect(update).not.toHaveBeenCalled();
    });

    it('shows the schema message when the list is full', async () => {
      stored.ignoredChannelIds = Array.from(
        { length: MAX_EVENT_LOG_IGNORED_CHANNELS },
        (_, i) => `4000000000000000${String(i).padStart(2, '0')}`,
      );
      const { reply } = await run({ source: 'prefix', args: ['ignore', SPAM_CHANNEL] });
      expect(lastText(reply)).toContain(`${MAX_EVENT_LOG_IGNORED_CHANNELS}`);
      expect(stored.ignoredChannelIds).not.toContain(SPAM_CHANNEL);
    });
  });

  describe('bots', () => {
    it('shows the current value when none is given', async () => {
      const slash = await run({ strings: { action: 'bots' } });
      expect(lastText(slash.reply)).toContain('Ignore bots: **off**');
      stored.ignoreBots = true;
      const prefix = await run({ source: 'prefix', args: ['bots'] });
      expect(lastText(prefix.reply)).toContain('Ignore bots: **on**');
      expect(update).not.toHaveBeenCalled();
    });

    it('turns it on and off from slash and prefix', async () => {
      const on = await run({ strings: { action: 'bots' }, booleans: { enabled: true } });
      expect(update).toHaveBeenCalledWith(
        GUILD_ID,
        'eventlogs',
        { ignoreBots: true },
        { userId: USER_ID, source: 'discord' },
      );
      expect(stored.ignoreBots).toBe(true);
      expect(lastText(on.reply)).toContain('now **on**');
      const off = await run({ source: 'prefix', args: ['bots', 'off'] });
      expect(stored.ignoreBots).toBe(false);
      expect(lastText(off.reply)).toContain('now **off**');
      await run({ source: 'prefix', args: ['bots', 'Enable'] });
      expect(stored.ignoreBots).toBe(true);
    });

    it('refuses a value that is not on or off', async () => {
      const { reply } = await run({ source: 'prefix', args: ['bots', 'maybe'] });
      expect(lastText(reply)).toContain('Say `on` or `off`');
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('settings', () => {
    it('shows the four channels, ignored channels and ignore-bots', async () => {
      stored = {
        ...defaultEventLogs(),
        messageChannelId: LOG_CHANNEL,
        serverChannelId: NEWS_CHANNEL,
        ignoredChannelIds: [SPAM_CHANNEL],
        ignoreBots: true,
      };
      const { reply } = await run({ strings: { action: 'settings' } });
      const text = lastText(reply);
      expect(text).toContain(`message log: on, in <#${LOG_CHANNEL}>`);
      expect(text).toContain('member log: off');
      expect(text).toContain(`server log: on, in <#${NEWS_CHANNEL}>`);
      expect(text).toContain('voice log: off');
      expect(text).toContain(`message log only): <#${SPAM_CHANNEL}>`);
      expect(text).toContain('Ignore bots: on');
      expect(text).not.toContain('Turn a log on');
      expect(text).toContain('**Logging** page of the dashboard');
      expect(update).not.toHaveBeenCalled();
    });

    it('is the default with no action, and suggests a first step while every log is off', async () => {
      const slash = await run({});
      expect(lastText(slash.reply)).toContain('Turn a log on');
      expect(lastText(slash.reply)).toContain('Ignored channels (message log only): none');
      expect(lastText(slash.reply)).toContain('Ignore bots: off');
      const prefix = await run({ source: 'prefix', args: [] });
      expect(lastText(prefix.reply)).toContain('Event log settings');
    });
  });
});
