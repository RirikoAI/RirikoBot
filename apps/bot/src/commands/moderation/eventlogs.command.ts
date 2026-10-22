import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type NewsChannel,
  type TextChannel,
} from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { canManageServer, parseToggle, saveGuildConfig } from '../shared/guild-config-command.js';

export const EVENT_LOG_ACTIONS = ['set', 'off', 'ignore', 'bots', 'settings'] as const;
export type EventLogAction = (typeof EVENT_LOG_ACTIONS)[number];

/** The four logs, each with the config field that holds its channel. */
const LOG_FIELDS = {
  message: 'messageChannelId',
  member: 'memberChannelId',
  server: 'serverChannelId',
  voice: 'voiceChannelId',
} as const;
type LogType = keyof typeof LOG_FIELDS;
const LOG_TYPES = Object.keys(LOG_FIELDS) as LogType[];
const TYPE_CHOICES = [...LOG_TYPES, 'all'] as const;
type TypeChoice = (typeof TYPE_CHOICES)[number];

const USAGE =
  'Usage: `/eventlogs action:set|off|ignore|bots|settings`. Examples: `!eventlogs set message #message-log`, `!eventlogs set all #logs`, `!eventlogs off voice`, `!eventlogs ignore #bot-spam`, `!eventlogs bots on`, `!eventlogs settings`.';
const TYPE_HINT = `Say which log: ${TYPE_CHOICES.map((t) => `\`${t}\``).join(', ')}.`;
const NO_PERMISSION =
  'You need the Manage Server or Administrator permission to change the event logs.';
const EDIT_HINT = 'You can also change this on the **Logging** page of the dashboard.';
const IGNORE_NOTE = 'Ignored channels affect the message log only.';

const CHANNEL_ARG = /^(?:<#)?(\d{17,20})>?$/;

/** What the member asked for, the same shape for a slash command and a prefix command. */
interface EventLogsRequest {
  action: string | null;
  /** The log type word, lowercased; null when none was given. */
  type: string | null;
  /** The channel ID the command carried; null when none or it is not a mention or ID. */
  channelId: string | null;
  /** True when a channel was given, even a prefix word that is not a mention or ID. */
  channelGiven: boolean;
  /** The bots switch: null when no value was given or the text is not on/off. */
  toggle: boolean | null;
  /** True when a bots value was given, even one that is not on/off. */
  toggleGiven: boolean;
  /** True when a prefix command carried more words than its action takes. */
  extra: boolean;
}

function nullIfEmpty(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function isTypeChoice(type: string | null): type is TypeChoice {
  return type !== null && (TYPE_CHOICES as readonly string[]).includes(type);
}

function isTextChannel(channel: unknown): channel is TextChannel | NewsChannel {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    'type' in channel &&
    (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
  );
}

/** A channel by ID from the cache, else from Discord; null when it cannot be found. */
async function findChannel(guild: Guild, id: string) {
  return guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null));
}

/**
 * Reads the action and its options. A slash command carries typed options. A prefix command is
 * `!eventlogs <action> ...`: `set <type> <channel>`, `off <type>`, `ignore <channel>` and
 * `bots on|off`.
 */
async function readRequest(ctx: CommandContext): Promise<EventLogsRequest> {
  if (ctx.source === 'slash') {
    const channel = await ctx.options.getChannel('channel');
    const enabled = ctx.options.getBoolean('enabled');
    return {
      action: ctx.options.getString('action')?.toLowerCase() ?? null,
      type: nullIfEmpty(ctx.options.getString('type')),
      channelId: channel?.id ?? null,
      channelGiven: channel !== null,
      toggle: enabled,
      toggleGiven: enabled !== null,
      extra: false,
    };
  }

  const args = [...ctx.options.getRawArgs()];
  const action = args.shift()?.toLowerCase() ?? null;
  const request: EventLogsRequest = {
    action,
    type: null,
    channelId: null,
    channelGiven: false,
    toggle: null,
    toggleGiven: false,
    extra: false,
  };

  if (action === 'set' || action === 'off') request.type = nullIfEmpty(args.shift());
  if (action === 'set' || action === 'ignore') {
    const channelText = args.shift();
    request.channelGiven = channelText !== undefined;
    request.channelId = channelText ? (CHANNEL_ARG.exec(channelText)?.[1] ?? null) : null;
  } else if (action === 'bots') {
    const word = args.shift();
    request.toggle = parseToggle(word);
    request.toggleGiven = word !== undefined;
  }
  request.extra = args.length > 0;
  return request;
}

/** Ephemeral for slash commands; a prefix command has no private replies and ignores the flag. */
async function say(ctx: CommandContext, content: string): Promise<void> {
  await ctx.reply({ content, ephemeral: true, allowedMentions: { parse: [] } });
}

function describeChannels(ids: readonly string[]): string {
  return ids.length > 0 ? ids.map((id) => `<#${id}>`).join(' ') : 'none';
}

/** The logs a type word stands for. */
function typesOf(type: TypeChoice): LogType[] {
  return type === 'all' ? LOG_TYPES : [type];
}

const BOT_PERMISSIONS: ReadonlyArray<readonly [bigint, string]> = [
  [PermissionFlagsBits.ViewChannel, 'View Channel'],
  [PermissionFlagsBits.SendMessages, 'Send Messages'],
  [PermissionFlagsBits.EmbedLinks, 'Embed Links'],
];

/** What Ririko lacks in the channel to post there; empty when it can, or when its member is unknown. */
function missingPermissions(
  channel: TextChannel | NewsChannel,
  me: GuildMember | null | undefined,
): string[] {
  if (!me) return [];
  const granted = channel.permissionsFor(me);
  return BOT_PERMISSIONS.filter(([flag]) => !granted?.has(flag)).map(([, label]) => label);
}

async function showSettings(ctx: CommandContext, services: BotServices): Promise<void> {
  const current = await services.guildConfigService.get(ctx.guildId!, 'eventlogs');
  const lines = ['**Event log settings**'];
  for (const type of LOG_TYPES) {
    const channelId = current[LOG_FIELDS[type]];
    lines.push(`${type} log: ${channelId ? `on, in <#${channelId}>` : 'off'}`);
  }
  lines.push(
    `Ignored channels (message log only): ${describeChannels(current.ignoredChannelIds)}`,
    `Ignore bots: ${current.ignoreBots ? 'on' : 'off'}`,
  );
  if (LOG_TYPES.every((type) => !current[LOG_FIELDS[type]])) {
    lines.push('Turn a log on with `/eventlogs action:set type:message channel:#message-log`.');
  }
  lines.push(EDIT_HINT);
  await say(ctx, lines.join('\n'));
}

async function setLog(
  ctx: CommandContext,
  services: BotServices,
  request: EventLogsRequest,
): Promise<void> {
  const guild = ctx.guild!;
  if (!isTypeChoice(request.type)) {
    await say(ctx, TYPE_HINT);
    return;
  }
  if (!request.channelGiven) {
    await say(
      ctx,
      'Say which channel: `/eventlogs action:set type:message channel:#message-log` or `!eventlogs set message #message-log`.',
    );
    return;
  }
  const channel = request.channelId ? await findChannel(guild, request.channelId) : null;
  if (!channel) {
    await say(ctx, 'I could not find that channel. Mention it or give its ID.');
    return;
  }
  if (!isTextChannel(channel)) {
    await say(ctx, 'A log channel needs to be a text or announcement channel.');
    return;
  }

  const types = typesOf(request.type);
  const patch: Record<string, unknown> = {};
  for (const type of types) patch[LOG_FIELDS[type]] = channel.id;
  if (!(await saveGuildConfig(ctx, services, 'eventlogs', patch))) return;

  const missing = missingPermissions(channel, guild.members.me);
  const lines = [
    request.type === 'all'
      ? `All four event logs (message, member, server and voice) now post in <#${channel.id}>.`
      : `The **${request.type}** log is now **on**, in <#${channel.id}>.`,
  ];
  if (missing.length > 0) {
    lines.push(
      `I do not have **${missing.join('**, **')}** in <#${channel.id}>, so I cannot post there yet.`,
    );
  }
  lines.push(EDIT_HINT);
  await say(ctx, lines.join('\n'));
}

async function turnOff(
  ctx: CommandContext,
  services: BotServices,
  request: EventLogsRequest,
): Promise<void> {
  if (!isTypeChoice(request.type)) {
    await say(ctx, TYPE_HINT);
    return;
  }
  const types = typesOf(request.type);
  const current = await services.guildConfigService.get(ctx.guildId!, 'eventlogs');
  if (types.every((type) => !current[LOG_FIELDS[type]])) {
    await say(
      ctx,
      request.type === 'all'
        ? 'All four event logs are already **off**.'
        : `The **${request.type}** log is already **off**.`,
    );
    return;
  }

  const patch: Record<string, unknown> = {};
  for (const type of types) patch[LOG_FIELDS[type]] = null;
  if (!(await saveGuildConfig(ctx, services, 'eventlogs', patch))) return;
  await say(
    ctx,
    `${
      request.type === 'all'
        ? 'All four event logs are now **off**.'
        : `The **${request.type}** log is now **off**.`
    } Messages already posted stay, and your other settings are kept. ${EDIT_HINT}`,
  );
}

async function toggleIgnore(
  ctx: CommandContext,
  services: BotServices,
  request: EventLogsRequest,
): Promise<void> {
  const guild = ctx.guild!;
  if (!request.channelGiven) {
    await say(
      ctx,
      'Say which channel: `/eventlogs action:ignore channel:#bot-spam` or `!eventlogs ignore #bot-spam`.',
    );
    return;
  }
  if (!request.channelId) {
    await say(ctx, 'I could not find that channel. Mention it or give its ID.');
    return;
  }
  const channelId = request.channelId;
  const { ignoredChannelIds } = await services.guildConfigService.get(guild.id, 'eventlogs');

  // A channel that is already ignored can always be removed, even after it was deleted.
  const ignored = ignoredChannelIds.includes(channelId);
  if (!ignored && !(await findChannel(guild, channelId))) {
    await say(ctx, 'I could not find that channel. Mention it or give its ID.');
    return;
  }

  const next = ignored
    ? ignoredChannelIds.filter((id) => id !== channelId)
    : [...ignoredChannelIds, channelId];
  const saved = await saveGuildConfig(ctx, services, 'eventlogs', { ignoredChannelIds: next });
  if (!saved) return;
  await say(
    ctx,
    `The message log ${ignored ? 'will log' : 'will skip'} messages in <#${channelId}>. Ignored channels: ${describeChannels(saved.ignoredChannelIds)}. ${IGNORE_NOTE} ${EDIT_HINT}`,
  );
}

async function setBots(
  ctx: CommandContext,
  services: BotServices,
  request: EventLogsRequest,
): Promise<void> {
  if (!request.toggleGiven) {
    const { ignoreBots } = await services.guildConfigService.get(ctx.guildId!, 'eventlogs');
    await say(
      ctx,
      `Ignore bots: **${ignoreBots ? 'on' : 'off'}**. Change it with \`/eventlogs action:bots enabled:true\`.`,
    );
    return;
  }
  if (request.toggle === null) {
    await say(ctx, `Say \`on\` or \`off\`, for example \`!eventlogs bots on\`. ${USAGE}`);
    return;
  }
  if (!(await saveGuildConfig(ctx, services, 'eventlogs', { ignoreBots: request.toggle }))) return;
  await say(
    ctx,
    `Ignore bots is now **${request.toggle ? 'on' : 'off'}**: ${
      request.toggle
        ? "bots' messages and voice activity are left out of the logs"
        : "bots' messages and voice activity are logged"
    }. Member events for bots are always logged. ${EDIT_HINT}`,
  );
}

export function createEventLogsCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'eventlogs',
      registrationScope: 'guild',
      category: CommandCategory.MODERATION,
      description:
        'Set up the message, member, server and voice event logs: pick a channel for each, ignore channels, skip bots',
      aliases: ['eventlog', 'event-logs'],
      isGuildOnly: true,
      usage: '/eventlogs <set|off|ignore|bots|settings> [type] [channel] [enabled]',
      examples: [
        '/eventlogs action:set type:message channel:#message-log',
        '/eventlogs action:set type:all channel:#logs',
        '/eventlogs action:off type:voice',
        '/eventlogs action:ignore channel:#bot-spam',
        '/eventlogs action:bots enabled:true',
        '/eventlogs action:settings',
        '!eventlogs',
        '!eventlogs set message #message-log',
        '!eventlogs off voice',
        '!eventlogs ignore #bot-spam',
        '!eventlogs bots on',
        '!eventlogs settings',
      ],
      options: [
        {
          name: 'action',
          description: 'What to do (default: settings)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Set (turn a log on in a channel)', value: 'set' },
            { name: 'Off (turn a log off)', value: 'off' },
            { name: 'Ignore (add or remove an ignored channel)', value: 'ignore' },
            { name: 'Bots (leave bots out of the logs, on or off)', value: 'bots' },
            { name: 'Settings (show the current settings)', value: 'settings' },
          ],
        },
        {
          name: 'type',
          description: 'Which log (for set and off)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Message (edited and deleted messages)', value: 'message' },
            { name: 'Member (joins, leaves, roles, bans)', value: 'member' },
            { name: 'Server (channels and roles)', value: 'server' },
            { name: 'Voice (joins, leaves, moves)', value: 'voice' },
            { name: 'All four logs', value: 'all' },
          ],
        },
        {
          name: 'channel',
          description: 'The log channel (set) or the channel to ignore (ignore)',
          type: 'CHANNEL',
          required: false,
        },
        {
          name: 'enabled',
          description: 'Leave bots out of the logs: true or false (for bots)',
          type: 'BOOLEAN',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId || !ctx.guild) {
        await say(ctx, 'This command can only be used within a server.');
        return;
      }

      const request = await readRequest(ctx);
      const action = request.action ?? 'settings';
      if (!(EVENT_LOG_ACTIONS as readonly string[]).includes(action) || request.extra) {
        await say(ctx, USAGE);
        return;
      }
      if (!canManageServer(ctx.member)) {
        await say(ctx, NO_PERMISSION);
        return;
      }

      if (action === 'set') await setLog(ctx, services, request);
      else if (action === 'off') await turnOff(ctx, services, request);
      else if (action === 'ignore') await toggleIgnore(ctx, services, request);
      else if (action === 'bots') await setBots(ctx, services, request);
      else await showSettings(ctx, services);
    },
  };
}
