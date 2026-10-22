import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type TextChannel,
  type User,
} from 'discord.js';
import { describeErrorForLog } from '@ririko/core';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import { TICKET_OPEN_BUTTON_ID, TICKET_REASON_MAX_LENGTH } from '@ririko/services';
import type { BotServices } from '../../services.js';
import { canManageServer, saveGuildConfig } from '../shared/guild-config-command.js';
import { describeClosed } from './components.js';

export const TICKET_ACTIONS = [
  'panel',
  'close',
  'claim',
  'add',
  'remove',
  'setup',
  'enable',
  'disable',
  'staff',
  'settings',
] as const;
export type TicketAction = (typeof TICKET_ACTIONS)[number];

/** The actions that change or show the server's ticket settings; they need Manage Server. */
const SETTINGS_ACTIONS: readonly string[] = ['setup', 'enable', 'disable', 'staff', 'settings'];

/** Longest panel message kept; an embed description allows more, a panel needs far less. */
export const TICKET_PANEL_MESSAGE_MAX_LENGTH = 1000;

export const DEFAULT_PANEL_MESSAGE =
  'Need help? Press the button below and tell us what you need. A private channel opens for you and the staff.';

const USAGE =
  'Usage: `/ticket action:setup|enable|disable|staff|settings|panel|close|claim|add|remove`. Examples: `!ticket setup Tickets @Support #transcripts`, `!ticket panel #support Need help?`, `!ticket close spam`, `!ticket add @user`.';
const SETUP_USAGE =
  'Say which category the tickets go under: `/ticket action:setup category:Tickets` or `!ticket setup Tickets @Support #transcripts`.';
const NOT_A_TICKET = 'This channel is not an open ticket.';
const DASHBOARD_HINT = 'Set them up on the **Tickets** page of the dashboard (Members section).';
const EDIT_HINT = 'You can also change this on the **Tickets** page of the dashboard.';
const PANEL_HINT = 'Post the panel with `/ticket action:panel`.';
const NO_SETTINGS_PERMISSION =
  'You need the Manage Server or Administrator permission to change the ticket settings.';

/** What the person asked for, the same shape for a slash command and a prefix command. */
interface TicketRequest {
  action: string | null;
  channelId: string | null;
  message: string | null;
  reason: string | null;
  user: User | null;
  /** True when a user was named but could not be found. */
  userMissing: boolean;
  /** The category a slash `setup` carried; the channel itself, checked later. */
  category: unknown;
  /** The category a prefix `setup` carried: an ID, a mention or an exact name. */
  categoryRef: string | null;
  /** The role of `setup` or `staff`: a mention, an ID or (for `staff`) an exact name. */
  roleRef: string | null;
}

const CHANNEL_ARG = /^(?:<#)?(\d{17,20})>?$/;
const USER_ARG = /^(?:<@!?)?(\d{17,20})>?$/;
const ROLE_ARG = /^(?:<@&)?(\d{17,20})>?$/;
/** A token that is a mention or an ID, which ends a category name in `!ticket setup`. */
const REFERENCE_ARG = /^(?:<[#@]&?!?\d{17,20}>|\d{17,20})$/;

function nullIfEmpty(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Reads the action and its options. A slash command carries typed options. A prefix command is
 * `!ticket <action> ...`, and its arguments differ per action (`panel` takes a channel and a
 * message, `close` takes a reason), so they are read here instead of by option position.
 */
async function readRequest(ctx: CommandContext): Promise<TicketRequest> {
  if (ctx.source === 'slash') {
    const channel = await ctx.options.getChannel('channel');
    const user = await ctx.options.getUser('user');
    const action = ctx.options.getString('action')?.toLowerCase() ?? null;
    const category = action === 'setup' ? await ctx.options.getChannel('category') : null;
    const options = ctx.raw && 'options' in ctx.raw ? ctx.raw.options : null;
    const role =
      (action === 'setup' || action === 'staff') && options && 'getRole' in options
        ? (options.getRole('role') as { id: string } | null)
        : null;
    return {
      action,
      channelId: channel?.id ?? null,
      message: nullIfEmpty(ctx.options.getString('message')),
      reason: nullIfEmpty(ctx.options.getString('reason')),
      user,
      userMissing: false,
      category,
      categoryRef: null,
      roleRef: role?.id ?? null,
    };
  }

  const args = [...ctx.options.getRawArgs()];
  const action = args.shift()?.toLowerCase() ?? null;
  const request: TicketRequest = {
    action,
    channelId: null,
    message: null,
    reason: null,
    user: null,
    userMissing: false,
    category: null,
    categoryRef: null,
    roleRef: null,
  };

  if (action === 'setup') {
    // `<category> [@role] [#channel]`: the category is an ID, a mention or a name that may have spaces.
    const first = args[0];
    const nameTokens: string[] = [];
    if (first && CHANNEL_ARG.test(first)) {
      request.categoryRef = first;
      args.shift();
    } else {
      while (args.length > 0 && !REFERENCE_ARG.test(args[0]!)) nameTokens.push(args.shift()!);
      request.categoryRef = nullIfEmpty(nameTokens.join(' '));
    }
    for (const token of args) {
      if (token.startsWith('<@&')) request.roleRef ??= token;
      else if (token.startsWith('<#')) request.channelId ??= CHANNEL_ARG.exec(token)?.[1] ?? null;
      else if (REFERENCE_ARG.test(token)) {
        if (request.roleRef === null) request.roleRef = token;
        else request.channelId ??= token;
      }
    }
  } else if (action === 'staff') {
    request.roleRef = nullIfEmpty(args.join(' '));
  } else if (action === 'panel') {
    const channelMatch = args[0]?.match(CHANNEL_ARG);
    if (channelMatch) {
      request.channelId = channelMatch[1] ?? null;
      args.shift();
    }
    request.message = nullIfEmpty(args.join(' '));
  } else if (action === 'close') {
    request.reason = nullIfEmpty(args.join(' '));
  } else if (action === 'add' || action === 'remove') {
    const userId = args[0]?.match(USER_ARG)?.[1];
    if (userId) {
      request.user = await ctx.client.users.fetch(userId).catch(() => null);
    }
    request.userMissing = request.user === null;
  }
  return request;
}

function isManager(member: GuildMember): boolean {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

function isTextChannel(channel: unknown): channel is TextChannel {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    'type' in channel &&
    (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
  );
}

/** Ephemeral for slash commands; a prefix command has no private replies and ignores the flag. */
async function say(ctx: CommandContext, content: string, ephemeral = true): Promise<void> {
  await ctx.reply({ content, ephemeral, allowedMentions: { parse: [] } });
}

/** A channel by ID from the cache, else from Discord; null when it cannot be found. */
async function findChannel(guild: Guild, id: string) {
  return guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null));
}

/** A category channel by ID, mention or exact name (any case); null when none matches. */
async function findCategory(guild: Guild, request: TicketRequest) {
  if (request.category) return request.category as { id: string; type: ChannelType; name?: string };
  const ref = request.categoryRef;
  if (!ref) return null;
  const id = CHANNEL_ARG.exec(ref)?.[1];
  if (id) return findChannel(guild, id);
  const name = ref.toLowerCase();
  return (
    [...guild.channels.cache.values()].find(
      (channel) =>
        channel.type === ChannelType.GuildCategory && channel.name.toLowerCase() === name,
    ) ?? null
  );
}

/** A role by mention, ID or exact name (any case); null when none matches. */
function findRole(guild: Guild, ref: string) {
  const id = ROLE_ARG.exec(ref)?.[1];
  if (id) return guild.roles.cache.get(id) ?? null;
  const name = ref.toLowerCase();
  return [...guild.roles.cache.values()].find((role) => role.name.toLowerCase() === name) ?? null;
}

function describeStaffRoles(ids: readonly string[]): string {
  return ids.length > 0 ? ids.map((id) => `<@&${id}>`).join(' ') : 'none';
}

function describeTranscript(id: string | null): string {
  return id ? `<#${id}>` : 'the log channel (if one is set)';
}

/** `setup`, `enable`, `disable`, `staff` and `settings`: the same fields as the dashboard page. */
async function configureTickets(
  ctx: CommandContext,
  services: BotServices,
  member: GuildMember,
  action: string,
  request: TicketRequest,
): Promise<void> {
  if (!canManageServer(member)) {
    await say(ctx, NO_SETTINGS_PERMISSION);
    return;
  }
  const guild = ctx.guild!;
  const current = await services.guildConfigService.get(guild.id, 'tickets');

  if (action === 'settings') {
    await say(
      ctx,
      [
        '**Ticket settings**',
        `Tickets: ${current.enabled ? 'on' : 'off'}`,
        `Category: ${current.categoryId ? `<#${current.categoryId}>` : 'none'}`,
        `Staff roles: ${describeStaffRoles(current.staffRoleIds)}`,
        `Transcripts: ${describeTranscript(current.transcriptChannelId)}`,
        `Open tickets per member: ${current.maxOpenPerUser}`,
        EDIT_HINT,
      ].join('\n'),
    );
    return;
  }

  if (action === 'disable') {
    if (!(await saveGuildConfig(ctx, services, 'tickets', { enabled: false }))) return;
    await say(ctx, `Tickets are now **off**. Members cannot open new tickets. ${EDIT_HINT}`);
    return;
  }

  if (action === 'enable') {
    if (!current.categoryId) {
      await say(
        ctx,
        'Tickets have no category yet. Run `/ticket action:setup category:Tickets` first.',
      );
      return;
    }
    if (!(await saveGuildConfig(ctx, services, 'tickets', { enabled: true }))) return;
    await say(
      ctx,
      `Tickets are now **on**, under <#${current.categoryId}>. ${PANEL_HINT} ${EDIT_HINT}`,
    );
    return;
  }

  if (action === 'staff') {
    if (!request.roleRef) {
      await say(
        ctx,
        'Say which role: `/ticket action:staff role:@Support` or `!ticket staff @Support`.',
      );
      return;
    }
    const role = findRole(guild, request.roleRef);
    if (!role) {
      await say(ctx, 'I could not find that role. Mention it or type its exact name.');
      return;
    }
    const has = current.staffRoleIds.includes(role.id);
    const staffRoleIds = has
      ? current.staffRoleIds.filter((id) => id !== role.id)
      : [...current.staffRoleIds, role.id];
    const saved = await saveGuildConfig(ctx, services, 'tickets', { staffRoleIds });
    if (!saved) return;
    await say(
      ctx,
      `<@&${role.id}> is ${has ? 'no longer' : 'now'} a ticket staff role. Staff roles: ${describeStaffRoles(saved.staffRoleIds)}. ${EDIT_HINT}`,
    );
    return;
  }

  // setup
  if (!request.category && !request.categoryRef) {
    await say(ctx, SETUP_USAGE);
    return;
  }
  const category = await findCategory(guild, request);
  if (!category) {
    await say(
      ctx,
      'I could not find that category. Give its ID, mention it or type its exact name.',
    );
    return;
  }
  if (category.type !== ChannelType.GuildCategory) {
    await say(ctx, 'That is not a category. Pick a category channel, the folder tickets go under.');
    return;
  }

  const patch: Record<string, unknown> = { enabled: true, categoryId: category.id };
  if (request.roleRef) {
    const role = findRole(guild, request.roleRef);
    if (!role) {
      await say(ctx, 'I could not find that role. Mention it or give its ID.');
      return;
    }
    patch.staffRoleIds = current.staffRoleIds.includes(role.id)
      ? current.staffRoleIds
      : [...current.staffRoleIds, role.id];
  }
  if (request.channelId) {
    const transcript = await findChannel(guild, request.channelId);
    if (!isTextChannel(transcript)) {
      await say(ctx, 'The transcript channel needs to be a text channel.');
      return;
    }
    patch.transcriptChannelId = transcript.id;
  }

  const saved = await saveGuildConfig(ctx, services, 'tickets', patch);
  if (!saved) return;

  const me = guild.members.me;
  const channelForPermissions = category as { permissionsFor?: (m: GuildMember) => unknown };
  const granted = me
    ? (channelForPermissions.permissionsFor?.(me) as
        { has(flag: bigint): boolean } | null | undefined)
    : undefined;
  const warning =
    me && !granted?.has(PermissionFlagsBits.ManageChannels)
      ? ' I do not have **Manage Channels** in that category, so I cannot open tickets there yet.'
      : '';
  await say(
    ctx,
    [
      `Tickets are now **on**, under <#${saved.categoryId}>. Staff roles: ${describeStaffRoles(saved.staffRoleIds)}. Transcripts: ${describeTranscript(saved.transcriptChannelId)}.${warning}`,
      `${PANEL_HINT} ${EDIT_HINT}`,
    ].join('\n'),
  );
}

async function postPanel(
  ctx: CommandContext,
  services: BotServices,
  member: GuildMember,
  request: TicketRequest,
): Promise<void> {
  const guild = ctx.guild!;
  if (!isManager(member)) {
    await say(ctx, 'You need the Manage Server or Administrator permission to post a panel.');
    return;
  }

  const settings = await services.ticketRepo.getSettings(guild.id);
  if (!settings?.isEnabled) {
    await say(ctx, `Tickets are not turned on in this server. ${DASHBOARD_HINT}`);
    return;
  }
  if (!settings.categoryId) {
    await say(ctx, `Tickets have no category yet. ${DASHBOARD_HINT}`);
    return;
  }

  let target: unknown = ctx.channel;
  if (request.channelId) {
    target =
      guild.channels.cache.get(request.channelId) ??
      (await guild.channels.fetch(request.channelId).catch(() => null));
  }
  if (!isTextChannel(target)) {
    await say(ctx, 'The panel needs a text channel.');
    return;
  }

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('Support tickets')
    .setDescription(
      (request.message ?? DEFAULT_PANEL_MESSAGE).slice(0, TICKET_PANEL_MESSAGE_MAX_LENGTH),
    );
  const button = new ButtonBuilder()
    .setCustomId(TICKET_OPEN_BUTTON_ID)
    .setLabel('Open Ticket')
    .setEmoji('🎫')
    .setStyle(ButtonStyle.Primary);

  try {
    await target.send({
      embeds: [embed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
    });
  } catch (error) {
    console.error(
      `[Tickets] Could not post a panel in ${target.id}: ${describeErrorForLog(error)}`,
    );
    await say(
      ctx,
      `I could not post in <#${target.id}>. Check that I can view it, send messages and embed links there.`,
    );
    return;
  }
  await say(ctx, `The ticket panel is posted in <#${target.id}>.`);
}

async function closeTicket(
  ctx: CommandContext,
  services: BotServices,
  member: GuildMember,
  channel: TextChannel,
  reason: string | null,
): Promise<void> {
  // The transcript can take a while, and the ticket channel (and so the reply) may be gone after.
  await ctx.deferReply({ ephemeral: true });
  const result = await services.ticketService.close(
    member,
    channel,
    reason?.slice(0, TICKET_REASON_MAX_LENGTH) ?? null,
  );
  try {
    await say(ctx, result.ok ? describeClosed(result) : result.message);
  } catch (error) {
    console.error(`[Tickets] Could not answer a close command: ${describeErrorForLog(error)}`);
  }
}

export function createTicketCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'ticket',
      registrationScope: 'guild',
      category: CommandCategory.UTILITY,
      description:
        'Support tickets: set them up, post the panel, claim, close, and add or remove members',
      aliases: ['tickets'],
      isGuildOnly: true,
      usage: '/ticket <setup|enable|disable|staff|settings|panel|close|claim|add|remove>',
      examples: [
        '/ticket action:setup category:Tickets role:@Support channel:#transcripts',
        '/ticket action:settings',
        '/ticket action:panel channel:#support message:Need help?',
        '/ticket action:close reason:Solved',
        '/ticket action:claim',
        '/ticket action:add user:@member',
        '!ticket setup Tickets @Support #transcripts',
        '!ticket staff @Support',
        '!ticket enable',
        '!ticket disable',
        '!ticket settings',
        '!ticket panel #support Need help?',
        '!ticket close spam',
        '!ticket claim',
        '!ticket add @user',
        '!ticket remove @user',
      ],
      options: [
        {
          name: 'action',
          description: 'What to do',
          type: 'STRING',
          required: true,
          choices: [
            { name: 'Setup (turn tickets on with a category)', value: 'setup' },
            { name: 'Enable (turn tickets on)', value: 'enable' },
            { name: 'Disable (turn tickets off)', value: 'disable' },
            { name: 'Staff (add or remove a staff role)', value: 'staff' },
            { name: 'Settings (show the ticket settings)', value: 'settings' },
            { name: 'Panel (post the Open Ticket button)', value: 'panel' },
            { name: 'Close (close this ticket)', value: 'close' },
            { name: 'Claim (take this ticket)', value: 'claim' },
            { name: 'Add (let a member into this ticket)', value: 'add' },
            { name: 'Remove (take a member out of this ticket)', value: 'remove' },
          ],
        },
        {
          name: 'channel',
          description:
            'Where to post the panel (default: this channel), or the transcript channel for setup',
          type: 'CHANNEL',
          required: false,
        },
        {
          name: 'message',
          description: 'The text on the panel',
          type: 'STRING',
          required: false,
          maxLength: TICKET_PANEL_MESSAGE_MAX_LENGTH,
        },
        {
          name: 'reason',
          description: 'Why the ticket is closed',
          type: 'STRING',
          required: false,
          maxLength: TICKET_REASON_MAX_LENGTH,
        },
        {
          name: 'user',
          description: 'The member to add or remove',
          type: 'USER',
          required: false,
        },
        {
          name: 'category',
          description: 'The category that ticket channels are created under (for setup)',
          type: 'CHANNEL',
          required: false,
        },
        {
          name: 'role',
          description:
            'The staff role to add, or remove if it is already staff (for setup and staff)',
          type: 'ROLE',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const member = ctx.member;
      if (!ctx.guild || !member) {
        await say(ctx, 'This command can only be used within a server.');
        return;
      }

      const request = await readRequest(ctx);
      const action = request.action as TicketAction | null;
      if (!action || !TICKET_ACTIONS.includes(action)) {
        await say(ctx, USAGE);
        return;
      }

      if (SETTINGS_ACTIONS.includes(action)) {
        await configureTickets(ctx, services, member, action, request);
        return;
      }

      if (action === 'panel') {
        await postPanel(ctx, services, member, request);
        return;
      }

      // Every other action works inside a ticket channel.
      const channel = ctx.channel;
      if (!channel || channel.type !== ChannelType.GuildText) {
        await say(ctx, NOT_A_TICKET);
        return;
      }

      if (action === 'close') {
        await closeTicket(ctx, services, member, channel, request.reason);
        return;
      }

      if (action === 'claim') {
        const result = await services.ticketService.claim(member, channel);
        await say(ctx, result.ok ? 'You claimed this ticket.' : result.message);
        return;
      }

      if (!request.user) {
        await say(
          ctx,
          request.userMissing
            ? 'I could not find that member. Mention them or give their ID.'
            : `Say who to ${action}: \`/ticket action:${action} user:@member\`.`,
        );
        return;
      }
      const result =
        action === 'add'
          ? await services.ticketService.add(member, channel, request.user)
          : await services.ticketService.remove(member, channel, request.user);
      if (!result.ok) {
        await say(ctx, result.message);
        return;
      }
      await say(
        ctx,
        action === 'add'
          ? `Added <@${request.user.id}> to this ticket.`
          : `Removed <@${request.user.id}> from this ticket.`,
        false,
      );
    },
  };
}
