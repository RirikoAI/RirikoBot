import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type GuildMember,
  type TextChannel,
  type User,
} from 'discord.js';
import { describeErrorForLog } from '@ririko/core';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import { TICKET_OPEN_BUTTON_ID, TICKET_REASON_MAX_LENGTH } from '@ririko/services';
import type { BotServices } from '../../services.js';
import { describeClosed } from './components.js';

export const TICKET_ACTIONS = ['panel', 'close', 'claim', 'add', 'remove'] as const;
export type TicketAction = (typeof TICKET_ACTIONS)[number];

/** Longest panel message kept; an embed description allows more, a panel needs far less. */
export const TICKET_PANEL_MESSAGE_MAX_LENGTH = 1000;

export const DEFAULT_PANEL_MESSAGE =
  'Need help? Press the button below and tell us what you need. A private channel opens for you and the staff.';

const USAGE =
  'Usage: `/ticket action:panel|close|claim|add|remove`. Examples: `!ticket panel #support Need help?`, `!ticket close spam`, `!ticket add @user`.';
const NOT_A_TICKET = 'This channel is not an open ticket.';
const DASHBOARD_HINT = 'Set them up on the **Tickets** page of the dashboard (Members section).';

/** What the person asked for, the same shape for a slash command and a prefix command. */
interface TicketRequest {
  action: string | null;
  channelId: string | null;
  message: string | null;
  reason: string | null;
  user: User | null;
  /** True when a user was named but could not be found. */
  userMissing: boolean;
}

const CHANNEL_ARG = /^(?:<#)?(\d{17,20})>?$/;
const USER_ARG = /^(?:<@!?)?(\d{17,20})>?$/;

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
    return {
      action: ctx.options.getString('action')?.toLowerCase() ?? null,
      channelId: channel?.id ?? null,
      message: nullIfEmpty(ctx.options.getString('message')),
      reason: nullIfEmpty(ctx.options.getString('reason')),
      user,
      userMissing: false,
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
  };

  if (action === 'panel') {
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
      description: 'Support tickets: post the panel, claim, close, and add or remove members',
      aliases: ['tickets'],
      isGuildOnly: true,
      usage: '/ticket <panel|close|claim|add|remove>',
      examples: [
        '/ticket action:panel channel:#support message:Need help?',
        '/ticket action:close reason:Solved',
        '/ticket action:claim',
        '/ticket action:add user:@member',
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
            { name: 'Panel (post the Open Ticket button)', value: 'panel' },
            { name: 'Close (close this ticket)', value: 'close' },
            { name: 'Claim (take this ticket)', value: 'claim' },
            { name: 'Add (let a member into this ticket)', value: 'add' },
            { name: 'Remove (take a member out of this ticket)', value: 'remove' },
          ],
        },
        {
          name: 'channel',
          description: 'Where to post the panel (default: this channel)',
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
