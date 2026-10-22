import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type NewsChannel,
  type TextChannel,
} from 'discord.js';
import { MAX_STARBOARD_THRESHOLD, parseStarboardEmoji } from '@ririko/core';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { canManageServer, parseToggle, saveGuildConfig } from '../shared/guild-config-command.js';

export const STARBOARD_ACTIONS = ['setup', 'off', 'selfstar', 'ignore', 'settings'] as const;
export type StarboardAction = (typeof STARBOARD_ACTIONS)[number];

const USAGE =
  'Usage: `/starboard action:setup|off|selfstar|ignore|settings`. Examples: `!starboard setup #starboard ⭐ 3`, `!starboard off`, `!starboard selfstar on`, `!starboard ignore #spam`, `!starboard settings`.';
const SETUP_USAGE =
  'Say which channel the starboard posts in: `/starboard action:setup channel:#starboard` or `!starboard setup #starboard [emoji] [threshold]`.';
const NO_PERMISSION =
  'You need the Manage Server or Administrator permission to change the starboard.';
const EDIT_HINT =
  'You can also change this on the **Starboard** page of the dashboard (Engagement section).';
const THRESHOLD_HINT = `The threshold must be a whole number from 1 to ${MAX_STARBOARD_THRESHOLD}.`;

const CHANNEL_ARG = /^(?:<#)?(\d{17,20})>?$/;
const THRESHOLD_ARG = /^\d{1,9}$/;

/** What the member asked for, the same shape for a slash command and a prefix command. */
interface StarboardRequest {
  action: string | null;
  /** The channel ID the command carried; null when none or it is not a mention or ID. */
  channelId: string | null;
  /** True when a channel was given, even a prefix word that is not a mention or ID. */
  channelGiven: boolean;
  emoji: string | null;
  /** Null when no threshold was given. */
  threshold: number | null;
  /** True when a threshold word was given that is not a whole number. */
  thresholdInvalid: boolean;
  /** The selfstar switch: null when no value was given or the text is not on/off. */
  toggle: boolean | null;
  /** True when a selfstar value was given, even one that is not on/off. */
  toggleGiven: boolean;
  /** True when a prefix command carried more words than its action takes. */
  extra: boolean;
}

function nullIfEmpty(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
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
 * `!starboard <action> ...`: `setup <channel> [emoji] [threshold]` (a lone number after the channel
 * is the threshold), `selfstar on|off` and `ignore <channel>`.
 */
async function readRequest(ctx: CommandContext): Promise<StarboardRequest> {
  if (ctx.source === 'slash') {
    const channel = await ctx.options.getChannel('channel');
    const enabled = ctx.options.getBoolean('enabled');
    return {
      action: ctx.options.getString('action')?.toLowerCase() ?? null,
      channelId: channel?.id ?? null,
      channelGiven: channel !== null,
      emoji: nullIfEmpty(ctx.options.getString('emoji')),
      threshold: ctx.options.getInteger('threshold'),
      thresholdInvalid: false,
      toggle: enabled,
      toggleGiven: enabled !== null,
      extra: false,
    };
  }

  const args = [...ctx.options.getRawArgs()];
  const action = args.shift()?.toLowerCase() ?? null;
  const request: StarboardRequest = {
    action,
    channelId: null,
    channelGiven: false,
    emoji: null,
    threshold: null,
    thresholdInvalid: false,
    toggle: null,
    toggleGiven: false,
    extra: false,
  };

  if (action === 'setup' || action === 'ignore') {
    const channelText = args.shift();
    request.channelGiven = channelText !== undefined;
    request.channelId = channelText ? (CHANNEL_ARG.exec(channelText)?.[1] ?? null) : null;
  }
  if (action === 'setup') {
    let thresholdText: string | undefined;
    if (args.length === 1 && THRESHOLD_ARG.test(args[0]!)) thresholdText = args.shift();
    else {
      request.emoji = nullIfEmpty(args.shift());
      thresholdText = args.shift();
    }
    if (thresholdText !== undefined) {
      if (THRESHOLD_ARG.test(thresholdText)) request.threshold = Number(thresholdText);
      else request.thresholdInvalid = true;
    }
  } else if (action === 'selfstar') {
    const word = args.shift();
    request.toggle = parseToggle(word);
    request.toggleGiven = word !== undefined;
  }
  request.extra = args.length > 0;
  return request;
}

/** Ephemeral for slash commands; a prefix command has no private replies and ignores the flag. */
async function say(ctx: CommandContext, content: string, ephemeral = true): Promise<void> {
  await ctx.reply({ content, ephemeral, allowedMentions: { parse: [] } });
}

function describeChannels(ids: readonly string[]): string {
  return ids.length > 0 ? ids.map((id) => `<#${id}>`).join(' ') : 'none';
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
  const current = await services.guildConfigService.get(ctx.guildId!, 'starboard');
  const lines = [
    '**Starboard settings**',
    `Starboard: ${current.channelId ? `on, in <#${current.channelId}>` : 'off'}`,
    `Emoji: ${current.emoji}`,
    `Stars needed: ${current.threshold}`,
    `The author's own star counts: ${current.allowSelfStar ? 'on' : 'off'}`,
    `Ignored channels: ${describeChannels(current.ignoredChannelIds)}`,
  ];
  if (!current.channelId) {
    lines.push('Turn it on with `/starboard action:setup channel:#starboard`.');
  }
  lines.push(EDIT_HINT);
  await say(ctx, lines.join('\n'));
}

async function setup(
  ctx: CommandContext,
  services: BotServices,
  request: StarboardRequest,
): Promise<void> {
  const guild = ctx.guild!;
  if (!request.channelGiven) {
    await say(ctx, SETUP_USAGE);
    return;
  }
  const channel = request.channelId ? await findChannel(guild, request.channelId) : null;
  if (!channel) {
    await say(ctx, 'I could not find that channel. Mention it or give its ID.');
    return;
  }
  if (!isTextChannel(channel)) {
    await say(ctx, 'The starboard channel needs to be a text or announcement channel.');
    return;
  }
  if (request.thresholdInvalid) {
    await say(ctx, THRESHOLD_HINT);
    return;
  }

  const patch: Record<string, unknown> = { channelId: channel.id };
  if (request.emoji !== null) patch.emoji = request.emoji;
  if (request.threshold !== null) patch.threshold = request.threshold;
  const saved = await saveGuildConfig(ctx, services, 'starboard', patch);
  if (!saved) return;

  const warnings: string[] = [];
  const missing = missingPermissions(channel, guild.members.me);
  if (missing.length > 0) {
    warnings.push(
      `I do not have **${missing.join('**, **')}** in <#${channel.id}>, so I cannot post there yet.`,
    );
  }
  const customId = parseStarboardEmoji(saved.emoji).id;
  if (customId !== null && !guild.emojis.cache.has(customId)) {
    warnings.push(
      `I cannot find the custom emoji ${saved.emoji} in this server. It may belong to another server, and members cannot react with it.`,
    );
  }
  await say(
    ctx,
    [
      `The starboard is now **on**: a message with **${saved.threshold}** ${saved.emoji} is posted in <#${channel.id}>.`,
      ...warnings,
      EDIT_HINT,
    ].join('\n'),
  );
}

async function turnOff(ctx: CommandContext, services: BotServices): Promise<void> {
  const current = await services.guildConfigService.get(ctx.guildId!, 'starboard');
  if (!current.channelId) {
    await say(ctx, 'The starboard is already **off**.');
    return;
  }
  if (!(await saveGuildConfig(ctx, services, 'starboard', { channelId: null }))) return;
  await say(
    ctx,
    `The starboard is now **off**. Copies already posted stay, and your other settings are kept. Turn it on again with \`/starboard action:setup channel:#starboard\`. ${EDIT_HINT}`,
  );
}

async function setSelfStar(
  ctx: CommandContext,
  services: BotServices,
  request: StarboardRequest,
): Promise<void> {
  if (!request.toggleGiven) {
    const { allowSelfStar } = await services.guildConfigService.get(ctx.guildId!, 'starboard');
    await say(
      ctx,
      `The author's own star counts: **${allowSelfStar ? 'on' : 'off'}**. Change it with \`/starboard action:selfstar enabled:true\`.`,
    );
    return;
  }
  if (request.toggle === null) {
    await say(ctx, `Say \`on\` or \`off\`, for example \`!starboard selfstar on\`. ${USAGE}`);
    return;
  }
  if (!(await saveGuildConfig(ctx, services, 'starboard', { allowSelfStar: request.toggle })))
    return;
  await say(
    ctx,
    `The author's own star now **${request.toggle ? 'counts' : 'does not count'}**. ${EDIT_HINT}`,
  );
}

async function toggleIgnore(
  ctx: CommandContext,
  services: BotServices,
  request: StarboardRequest,
): Promise<void> {
  const guild = ctx.guild!;
  if (!request.channelGiven) {
    await say(
      ctx,
      'Say which channel: `/starboard action:ignore channel:#spam` or `!starboard ignore #spam`.',
    );
    return;
  }
  if (!request.channelId) {
    await say(ctx, 'I could not find that channel. Mention it or give its ID.');
    return;
  }
  const channelId = request.channelId;
  const { ignoredChannelIds } = await services.guildConfigService.get(guild.id, 'starboard');

  const ignored = ignoredChannelIds.includes(channelId);
  if (!ignored) {
    if (!(await findChannel(guild, channelId))) {
      await say(ctx, 'I could not find that channel. Mention it or give its ID.');
      return;
    }
  }

  const next = ignored
    ? ignoredChannelIds.filter((id) => id !== channelId)
    : [...ignoredChannelIds, channelId];
  const saved = await saveGuildConfig(ctx, services, 'starboard', { ignoredChannelIds: next });
  if (!saved) return;
  await say(
    ctx,
    `Messages in <#${channelId}> ${ignored ? 'can reach the starboard again' : 'will never reach the starboard'}. Ignored channels: ${describeChannels(saved.ignoredChannelIds)}. ${EDIT_HINT}`,
  );
}

export function createStarboardCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'starboard',
      registrationScope: 'guild',
      category: CommandCategory.UTILITY,
      description:
        'Repost popular messages to a starboard: set it up, turn it off, pick the emoji and the stars needed',
      aliases: ['star-board', 'stars'],
      isGuildOnly: true,
      usage:
        '/starboard <setup|off|selfstar|ignore|settings> [channel] [emoji] [threshold] [enabled]',
      examples: [
        '/starboard action:setup channel:#starboard emoji:⭐ threshold:3',
        '/starboard action:off',
        '/starboard action:selfstar enabled:true',
        '/starboard action:ignore channel:#spam',
        '/starboard action:settings',
        '!starboard',
        '!starboard setup #starboard ⭐ 3',
        '!starboard off',
        '!starboard selfstar on',
        '!starboard ignore #spam',
        '!starboard settings',
      ],
      options: [
        {
          name: 'action',
          description: 'What to do (default: settings)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Setup (turn it on in a channel)', value: 'setup' },
            { name: 'Off (turn the starboard off)', value: 'off' },
            { name: 'Selfstar (count the author’s own star, on or off)', value: 'selfstar' },
            { name: 'Ignore (add or remove an ignored channel)', value: 'ignore' },
            { name: 'Settings (show the current settings)', value: 'settings' },
          ],
        },
        {
          name: 'channel',
          description: 'The starboard channel (setup) or the channel to ignore (ignore)',
          type: 'CHANNEL',
          required: false,
        },
        {
          name: 'emoji',
          description: 'The emoji members react with, such as ⭐ (setup; unset keeps the current)',
          type: 'STRING',
          required: false,
        },
        {
          name: 'threshold',
          description: `Stars a message needs, from 1 to ${MAX_STARBOARD_THRESHOLD} (setup; unset keeps the current)`,
          type: 'INTEGER',
          required: false,
          minValue: 1,
          maxValue: MAX_STARBOARD_THRESHOLD,
        },
        {
          name: 'enabled',
          description: 'Count the author’s own star: true or false (for selfstar)',
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
      if (!(STARBOARD_ACTIONS as readonly string[]).includes(action) || request.extra) {
        await say(ctx, USAGE);
        return;
      }
      if (!canManageServer(ctx.member)) {
        await say(ctx, NO_PERMISSION);
        return;
      }

      if (action === 'setup') await setup(ctx, services, request);
      else if (action === 'off') await turnOff(ctx, services);
      else if (action === 'selfstar') await setSelfStar(ctx, services, request);
      else if (action === 'ignore') await toggleIgnore(ctx, services, request);
      else await showSettings(ctx, services);
    },
  };
}
