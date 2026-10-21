import {
  AttachmentBuilder,
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type OverwriteResolvable,
  type TextChannel,
  type User,
} from 'discord.js';
import type {
  GuildSettingsRepository,
  Ticket,
  TicketRepository,
  TicketSettings,
} from '@ririko/database';
import { buildTranscriptEmbed, buildWelcomeMessage } from './messages.js';
import {
  fetchTranscriptMessages,
  formatTranscript,
  ticketChannelName,
  transcriptFileName,
} from './transcript.js';
import type { TicketClaimed, TicketClosed, TicketMemberChanged, TicketOpened } from './types.js';

/** Longest subject kept. The modal in TASK-1984 asks for less. */
export const TICKET_SUBJECT_MAX_LENGTH = 200;
/** Longest close reason kept. */
export const TICKET_REASON_MAX_LENGTH = 500;

/** What a member of a ticket may do in its channel. */
const MEMBER_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
];

const NOT_A_TICKET = 'This channel is not an open ticket.';
const STAFF_ONLY = 'Only the staff can do that.';

export interface TicketServiceOptions {
  /** The clock, so tests are deterministic. */
  now?: () => Date;
}

/** The text of an error for the console. Never the message content of a ticket. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cleanText(text: string | null | undefined, max: number): string | null {
  const trimmed = text?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * Support tickets (STORY-198): open, claim, add and remove members, close with a plain-text
 * transcript. It talks to Discord objects and the repository only; commands and buttons
 * (TASK-1984) turn the returned outcomes into replies. Transcript text and message content
 * are never stored or logged.
 */
export class TicketService {
  private readonly now: () => Date;
  /** Ticket ids being closed right now, so two presses of Close do not post two transcripts. */
  private readonly closing = new Set<string>();

  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly guildSettingsRepo: GuildSettingsRepository,
    options: TicketServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  // ==========================================
  // Open
  // ==========================================

  /** Opens a ticket for `member`: a private channel under the category, recorded and greeted. */
  async open(member: GuildMember, subject: string | null): Promise<TicketOpened> {
    const guild = member.guild;
    const settings = await this.ticketRepo.getSettings(guild.id);
    if (!settings?.isEnabled) {
      return { ok: false, message: 'Tickets are not turned on in this server.' };
    }
    if (!settings.categoryId) {
      return {
        ok: false,
        message: 'Tickets have no category yet. A server admin must pick one in the dashboard.',
      };
    }

    const category = await guild.channels.fetch(settings.categoryId).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) {
      return {
        ok: false,
        message: 'The ticket category no longer exists. A server admin must pick a new one.',
      };
    }

    const me = await this.getBotMember(guild);
    const missing = this.missingCategoryPermissions(category, me);
    if (missing.length > 0) {
      return {
        ok: false,
        message: `Ririko needs ${missing.join(', ')} in the ticket category to open tickets.`,
      };
    }

    const open = await this.ticketRepo.countOpenForUser(guild.id, member.id);
    if (open >= settings.maxOpenPerUser) {
      return {
        ok: false,
        message:
          settings.maxOpenPerUser === 1
            ? 'You already have an open ticket. Close it before opening another.'
            : `You already have ${open} open tickets, the most this server allows.`,
      };
    }

    const staffRoleIds = settings.staffRoleIds.filter((id) => guild.roles.cache.has(id));
    const overwrites: OverwriteResolvable[] = [
      { id: guild.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
      { id: member.id, type: OverwriteType.Member, allow: MEMBER_ALLOW },
      { id: guild.client.user.id, type: OverwriteType.Member, allow: MEMBER_ALLOW },
      ...staffRoleIds.map((id) => ({ id, type: OverwriteType.Role, allow: MEMBER_ALLOW })),
    ];

    // The number is only known once the ticket is recorded, so the channel gets the number the
    // server will hand out next and is renamed in the rare case that another ticket took it.
    const predicted = settings.nextNumber;
    let channel: TextChannel;
    try {
      channel = (await guild.channels.create({
        name: ticketChannelName(predicted),
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: overwrites,
        reason: `Support ticket opened by ${member.user.tag}`,
      })) as TextChannel;
    } catch (error) {
      console.error(
        `[TicketService] Could not create a ticket channel in ${guild.id}:`,
        errorText(error),
      );
      return {
        ok: false,
        message:
          'Discord refused to create the ticket channel. The category may be full, or Ririko may lack permissions.',
      };
    }

    let ticket: Ticket;
    try {
      ticket = await this.ticketRepo.openTicket({
        guildId: guild.id,
        channelId: channel.id,
        openerId: member.id,
        subject: cleanText(subject, TICKET_SUBJECT_MAX_LENGTH),
      });
    } catch (error) {
      console.error(`[TicketService] Could not record a ticket in ${guild.id}:`, errorText(error));
      await channel.delete('Ticket could not be recorded').catch((deleteError: unknown) => {
        console.error(
          `[TicketService] Could not remove channel ${channel.id} after a failed ticket:`,
          errorText(deleteError),
        );
      });
      return {
        ok: false,
        message: 'The ticket could not be saved, so nothing was created. Please try again.',
      };
    }

    if (ticket.number !== predicted) {
      await channel.setName(ticketChannelName(ticket.number)).catch((renameError: unknown) => {
        console.error(
          `[TicketService] Could not rename channel ${channel.id}:`,
          errorText(renameError),
        );
      });
    }

    let welcomePosted = true;
    try {
      await channel.send(
        buildWelcomeMessage({
          number: ticket.number,
          openerId: member.id,
          subject: ticket.subject,
          staffRoleIds,
          welcomeMessage: settings.welcomeMessage,
        }),
      );
    } catch (error) {
      welcomePosted = false;
      console.error(
        `[TicketService] Could not post the welcome message in ${channel.id}:`,
        errorText(error),
      );
    }

    return { ok: true, ticket, channel, welcomePosted };
  }

  // ==========================================
  // Claim, add, remove
  // ==========================================

  /** A staff member takes the ticket. */
  async claim(member: GuildMember, channel: TextChannel): Promise<TicketClaimed> {
    const found = await this.loadOpenTicket(channel);
    if (!found.ok) return found;
    const { ticket, settings } = found;

    if (!this.isStaff(member, settings)) return { ok: false, message: STAFF_ONLY };
    if (ticket.claimedBy) {
      return {
        ok: false,
        message:
          ticket.claimedBy === member.id
            ? 'You have already claimed this ticket.'
            : `This ticket is already claimed by <@${ticket.claimedBy}>.`,
      };
    }

    const claimed = await this.ticketRepo.setClaimedBy(ticket.id, member.id);
    if (!claimed) return { ok: false, message: NOT_A_TICKET };

    await channel
      .send({
        content: `<@${member.id}> is handling this ticket.`,
        allowedMentions: { parse: [] },
      })
      .catch((error: unknown) => {
        console.error(
          `[TicketService] Could not announce a claim in ${channel.id}:`,
          errorText(error),
        );
      });
    return { ok: true, ticket: claimed };
  }

  /** A staff member lets `user` into the ticket. */
  async add(member: GuildMember, channel: TextChannel, user: User): Promise<TicketMemberChanged> {
    const found = await this.loadOpenTicket(channel);
    if (!found.ok) return found;
    const { ticket, settings } = found;

    if (!this.isStaff(member, settings)) return { ok: false, message: STAFF_ONLY };
    if (user.id === ticket.openerId) {
      return { ok: false, message: 'The person who opened the ticket is already in it.' };
    }

    try {
      await channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        ReadMessageHistory: true,
      });
    } catch (error) {
      console.error(`[TicketService] Could not add a member to ${channel.id}:`, errorText(error));
      return { ok: false, message: 'Discord refused to add that member to the ticket.' };
    }
    return { ok: true, ticket };
  }

  /** A staff member takes `user` out of the ticket. The opener (and Ririko) cannot be removed. */
  async remove(
    member: GuildMember,
    channel: TextChannel,
    user: User,
  ): Promise<TicketMemberChanged> {
    const found = await this.loadOpenTicket(channel);
    if (!found.ok) return found;
    const { ticket, settings } = found;

    if (!this.isStaff(member, settings)) return { ok: false, message: STAFF_ONLY };
    if (user.id === ticket.openerId) {
      return { ok: false, message: 'The person who opened the ticket cannot be removed.' };
    }
    if (user.id === channel.client.user.id) {
      return { ok: false, message: 'Ririko cannot be removed from a ticket.' };
    }

    try {
      await channel.permissionOverwrites.delete(user.id);
    } catch (error) {
      console.error(
        `[TicketService] Could not remove a member from ${channel.id}:`,
        errorText(error),
      );
      return { ok: false, message: 'Discord refused to remove that member from the ticket.' };
    }
    return { ok: true, ticket };
  }

  // ==========================================
  // Close
  // ==========================================

  /**
   * Closes a ticket: posts its transcript, then marks it closed and deletes the channel. The
   * opener and the staff may close. When the transcript cannot be posted the ticket stays open.
   */
  async close(
    member: GuildMember,
    channel: TextChannel,
    reason: string | null,
  ): Promise<TicketClosed> {
    const found = await this.loadOpenTicket(channel);
    if (!found.ok) return found;
    const { ticket, settings } = found;

    if (member.id !== ticket.openerId && !this.isStaff(member, settings)) {
      return {
        ok: false,
        message: 'Only the person who opened the ticket and the staff can close it.',
      };
    }
    if (this.closing.has(ticket.id)) {
      return { ok: false, message: 'This ticket is already being closed.' };
    }

    this.closing.add(ticket.id);
    try {
      return await this.finishClose(member, channel, ticket, reason, settings);
    } finally {
      this.closing.delete(ticket.id);
    }
  }

  private async finishClose(
    member: GuildMember,
    channel: TextChannel,
    ticket: Ticket,
    reason: string | null,
    settings: TicketSettings | null,
  ): Promise<TicketClosed> {
    const guild = member.guild;
    const closedAt = this.now();
    const cleanReason = cleanText(reason, TICKET_REASON_MAX_LENGTH);

    const destinationId = await this.transcriptDestinationId(guild, settings);
    if (destinationId) {
      const posted = await this.postTranscript(
        guild,
        channel,
        ticket,
        member,
        cleanReason,
        closedAt,
        destinationId,
      );
      if (!posted.ok) return posted;
    }

    const closed = await this.ticketRepo.close(ticket.id, {
      closedBy: member.id,
      reason: cleanReason,
      closedAt,
    });
    if (!closed) return { ok: false, message: NOT_A_TICKET };

    let channelDeleted = true;
    try {
      await channel.delete(`Ticket closed by ${member.user.tag}`);
    } catch (error) {
      channelDeleted = false;
      console.error(`[TicketService] Could not delete channel ${channel.id}:`, errorText(error));
    }
    return { ok: true, ticket, transcriptChannelId: destinationId, channelDeleted };
  }

  /** The channel that receives transcripts: the ticket setting, else the log channel, else none. */
  private async transcriptDestinationId(
    guild: Guild,
    settings: TicketSettings | null,
  ): Promise<string | null> {
    if (settings?.transcriptChannelId) return settings.transcriptChannelId;
    const guildSettings = await this.guildSettingsRepo.findById(guild.id).catch(() => null);
    return guildSettings?.logChannelId ?? null;
  }

  /** Builds the transcript and posts it with an embed. A failure here keeps the ticket open. */
  private async postTranscript(
    guild: Guild,
    channel: TextChannel,
    ticket: Ticket,
    closer: GuildMember,
    reason: string | null,
    closedAt: Date,
    destinationId: string,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const stayOpen = (why: string) => ({
      ok: false as const,
      message: `${why} The ticket stays open; close it again once that is fixed.`,
    });

    const destination = await guild.channels.fetch(destinationId).catch(() => null);
    if (!destination || !destination.isTextBased()) {
      return stayOpen('The transcript channel no longer exists or is not a text channel.');
    }
    const me = await this.getBotMember(guild);
    const sendPermissions = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
    ];
    if (me && !destination.permissionsFor(me)?.has(sendPermissions)) {
      return stayOpen('Ririko cannot send messages, embeds and files in the transcript channel.');
    }

    try {
      const { messages, truncated } = await fetchTranscriptMessages(channel);
      const text = formatTranscript(
        {
          guildName: guild.name,
          guildId: guild.id,
          number: ticket.number,
          subject: ticket.subject,
          opener: await this.describeUser(guild, ticket.openerId),
          claimedBy: ticket.claimedBy ? await this.describeUser(guild, ticket.claimedBy) : null,
          closedBy: `${closer.user.tag} (${closer.id})`,
          reason,
          openedAt: ticket.createdAt,
          closedAt,
        },
        messages,
        truncated,
      );
      const file = new AttachmentBuilder(Buffer.from(text, 'utf8'), {
        name: transcriptFileName(ticket.number),
      });
      const embed = buildTranscriptEmbed({
        number: ticket.number,
        openerId: ticket.openerId,
        subject: ticket.subject,
        claimedBy: ticket.claimedBy,
        closedBy: closer.id,
        reason,
        openedAt: ticket.createdAt,
        closedAt,
        messageCount: messages.length,
        truncated,
      });
      await destination.send({
        embeds: [embed],
        files: [file],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error(
        `[TicketService] Could not post the transcript of ticket ${ticket.id}:`,
        errorText(error),
      );
      return stayOpen('The transcript could not be posted.');
    }
    return { ok: true };
  }

  // ==========================================
  // Channel deleted by hand
  // ==========================================

  /**
   * A ticket channel was deleted outside the service (channelDelete gateway event). The ticket is
   * closed with no closer and no transcript. Returns true when an open ticket was closed.
   */
  async handleChannelDeleted(channelId: string): Promise<boolean> {
    const ticket = await this.ticketRepo.findByChannelId(channelId);
    if (!ticket || ticket.status !== 'open') return false;
    return this.ticketRepo.close(ticket.id, {
      closedBy: null,
      reason: 'Channel deleted',
      closedAt: this.now(),
    });
  }

  // ==========================================
  // Helpers
  // ==========================================

  /** Staff: holds a staff role, or has Manage Channels or Administrator. */
  private isStaff(member: GuildMember, settings: TicketSettings | null): boolean {
    if (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageChannels)
    ) {
      return true;
    }
    return (settings?.staffRoleIds ?? []).some((id) => member.roles.cache.has(id));
  }

  private async loadOpenTicket(
    channel: TextChannel,
  ): Promise<
    { ok: true; ticket: Ticket; settings: TicketSettings | null } | { ok: false; message: string }
  > {
    const ticket = await this.ticketRepo.findByChannelId(channel.id);
    if (!ticket || ticket.status !== 'open') return { ok: false, message: NOT_A_TICKET };
    const settings = await this.ticketRepo.getSettings(ticket.guildId);
    return { ok: true, ticket, settings };
  }

  private async getBotMember(guild: Guild): Promise<GuildMember | null> {
    return guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  }

  private missingCategoryPermissions(
    category: { permissionsFor(member: GuildMember): Readonly<{ has(p: bigint): boolean }> | null },
    me: GuildMember | null,
  ): string[] {
    if (!me) return ['Manage Channels', 'View Channel', 'Send Messages'];
    const granted = category.permissionsFor(me);
    const checks: Array<[bigint, string]> = [
      [PermissionFlagsBits.ManageChannels, 'Manage Channels'],
      [PermissionFlagsBits.ViewChannel, 'View Channel'],
      [PermissionFlagsBits.SendMessages, 'Send Messages'],
    ];
    return checks.filter(([flag]) => !granted?.has(flag)).map(([, name]) => name);
  }

  /** `tag (id)` for the transcript header. The user may have left, so only the ID is certain. */
  private async describeUser(guild: Guild, userId: string): Promise<string> {
    const user = await guild.client.users.fetch(userId).catch(() => null);
    return user ? `${user.tag} (${userId})` : `unknown user (${userId})`;
  }
}
