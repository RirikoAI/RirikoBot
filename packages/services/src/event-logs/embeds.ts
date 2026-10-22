import {
  ChannelType,
  EmbedBuilder,
  type GuildBan,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
  type NonThreadGuildBasedChannel,
  type PartialGuildMember,
  type PartialMessage,
  type Role,
} from 'discord.js';
import { formatUtc } from '../tickets/transcript.js';

/** Longest value of an embed field. */
export const FIELD_MAX = 1024;

export const EVENT_LOG_COLORS = {
  /** Something was created, someone joined or a restriction was lifted. */
  green: 0x57f287,
  /** Something was deleted or someone left. */
  red: 0xed4245,
  /** Something changed. */
  amber: 0xf1c40f,
} as const;

/** Cuts `text` to `max` characters, ending with an ellipsis when it was longer. */
export function cut(text: string, max: number = FIELD_MAX): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A field value Discord accepts: never empty and never longer than a field allows. */
function fieldValue(text: string | null | undefined, empty = 'None'): string {
  return text && text.length > 0 ? cut(text) : empty;
}

interface UserLike {
  id: string;
  tag?: string | null;
}

/** `@mention tag (ID)`. The tag is left out when it is not known (a partial user). */
export function userLine(user: UserLike): string {
  return user.tag ? `<@${user.id}> ${user.tag} (${user.id})` : `<@${user.id}> (${user.id})`;
}

function channelLine(id: string): string {
  return `<#${id}> (${id})`;
}

function unixSeconds(timestamp: number): number {
  return Math.floor(timestamp / 1000);
}

/** A date Discord shows in the reader's own time zone, with the time that has passed. */
function discordTime(timestamp: number): string {
  const seconds = unixSeconds(timestamp);
  return `<t:${seconds}:F> (<t:${seconds}:R>)`;
}

function base(title: string, color: number, at: Date): EmbedBuilder {
  return new EmbedBuilder().setTitle(title).setColor(color).setTimestamp(at);
}

type AnyMessage = Message | PartialMessage;

function contentOf(message: AnyMessage): string {
  return fieldValue(message.content, 'Content unknown');
}

function attachmentNames(message: AnyMessage): string[] {
  return [...message.attachments.values()].map((attachment) => attachment.name);
}

// ==========================================
// Messages
// ==========================================

export function buildMessageEditedEmbed(
  oldMessage: AnyMessage,
  newMessage: AnyMessage,
  at: Date,
): EmbedBuilder {
  const author = newMessage.author ?? oldMessage.author;
  return base('Message edited', EVENT_LOG_COLORS.amber, at)
    .addFields(
      { name: 'Author', value: author ? userLine(author) : 'Unknown', inline: true },
      { name: 'Channel', value: channelLine(newMessage.channelId), inline: true },
      { name: 'Before', value: contentOf(oldMessage) },
      { name: 'After', value: contentOf(newMessage) },
      { name: 'Message', value: `[Jump to message](${newMessage.url})` },
    )
    .setFooter({ text: `Message ID: ${newMessage.id}` });
}

export function buildMessageDeletedEmbed(message: AnyMessage, at: Date): EmbedBuilder {
  const names = attachmentNames(message);
  const embed = base('Message deleted', EVENT_LOG_COLORS.red, at).addFields(
    { name: 'Author', value: message.author ? userLine(message.author) : 'Unknown', inline: true },
    { name: 'Channel', value: channelLine(message.channelId), inline: true },
    {
      name: 'Content',
      value:
        message.content === null
          ? 'Content unknown'
          : fieldValue(message.content, 'No text (attachments only)'),
    },
  );
  if (names.length > 0)
    embed.addFields({ name: 'Attachments', value: fieldValue(names.join(', ')) });
  return embed.setFooter({ text: `Message ID: ${message.id}` });
}

export interface BulkDeleteSummary {
  channelId: string;
  /** Messages deleted. */
  count: number;
  /** How many of them had cached content, which is what the file holds. */
  cachedCount: number;
  /** The attached file, or null when no content was cached. */
  fileName: string | null;
}

export function buildBulkDeleteEmbed(summary: BulkDeleteSummary, at: Date): EmbedBuilder {
  return base('Messages bulk deleted', EVENT_LOG_COLORS.red, at).addFields(
    { name: 'Channel', value: channelLine(summary.channelId), inline: true },
    { name: 'Messages deleted', value: String(summary.count), inline: true },
    {
      name: 'Content',
      value: summary.fileName
        ? `${summary.cachedCount} message(s) had cached content. See the attached file \`${summary.fileName}\`.`
        : 'No message content was cached.',
    },
  );
}

/**
 * The text file of a bulk delete: the cached messages, oldest first. The text only lives in the
 * file that is posted; it is never stored or logged.
 */
export function formatBulkDeleteFile(
  channel: GuildTextBasedChannel,
  messages: readonly Message[],
): string {
  const sorted = [...messages].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const rule = '='.repeat(60);
  const lines = [
    rule,
    `Server:   ${channel.guild.name} (${channel.guild.id})`,
    `Channel:  #${channel.name} (${channel.id})`,
    `Messages: ${sorted.length}`,
    rule,
    '',
  ];
  for (const message of sorted) {
    const author = message.author
      ? `${message.author.tag} (${message.author.id})`
      : 'Unknown author';
    lines.push(`[${formatUtc(new Date(message.createdTimestamp))}] ${author}`);
    for (const line of message.content.split(/\r?\n/)) {
      if (line.length > 0) lines.push(`  ${line}`);
    }
    for (const name of attachmentNames(message)) lines.push(`  [attachment] ${name}`);
  }
  return `${lines.join('\n')}\n`;
}

// ==========================================
// Members
// ==========================================

export function buildMemberJoinedEmbed(member: GuildMember, at: Date): EmbedBuilder {
  return base('Member joined', EVENT_LOG_COLORS.green, at)
    .addFields(
      { name: 'Member', value: userLine(member.user), inline: true },
      { name: 'Account created', value: discordTime(member.user.createdTimestamp) },
      { name: 'Member count', value: String(member.guild.memberCount), inline: true },
    )
    .setFooter({ text: `User ID: ${member.id}` });
}

export function buildMemberLeftEmbed(
  member: GuildMember | PartialGuildMember,
  at: Date,
): EmbedBuilder {
  const embed = base('Member left', EVENT_LOG_COLORS.red, at).addFields({
    name: 'Member',
    value: userLine(member.user),
    inline: true,
  });
  if (member.joinedTimestamp) {
    embed.addFields({ name: 'Joined', value: discordTime(member.joinedTimestamp) });
  }
  const roles = [...member.roles.cache.keys()].filter((id) => id !== member.guild.id);
  if (roles.length > 0) {
    embed.addFields({ name: 'Roles', value: fieldValue(roles.map((id) => `<@&${id}>`).join(' ')) });
  }
  return embed.setFooter({ text: `User ID: ${member.id}` });
}

export function buildNicknameEmbed(
  oldMember: PartialGuildMember | GuildMember,
  newMember: GuildMember,
  at: Date,
): EmbedBuilder {
  return base('Nickname changed', EVENT_LOG_COLORS.amber, at)
    .addFields(
      { name: 'Member', value: userLine(newMember.user) },
      { name: 'Before', value: fieldValue(oldMember.nickname), inline: true },
      { name: 'After', value: fieldValue(newMember.nickname), inline: true },
    )
    .setFooter({ text: `User ID: ${newMember.id}` });
}

export function buildRolesEmbed(
  member: GuildMember,
  added: readonly string[],
  removed: readonly string[],
  at: Date,
): EmbedBuilder {
  const color =
    removed.length === 0
      ? EVENT_LOG_COLORS.green
      : added.length === 0
        ? EVENT_LOG_COLORS.red
        : EVENT_LOG_COLORS.amber;
  const embed = base('Member roles changed', color, at).addFields({
    name: 'Member',
    value: userLine(member.user),
  });
  if (added.length > 0) {
    embed.addFields({
      name: 'Roles added',
      value: fieldValue(added.map((id) => `<@&${id}>`).join(' ')),
    });
  }
  if (removed.length > 0) {
    embed.addFields({
      name: 'Roles removed',
      value: fieldValue(removed.map((id) => `<@&${id}>`).join(' ')),
    });
  }
  return embed.setFooter({ text: `User ID: ${member.id}` });
}

/** A timeout that was set (`until` is its end) or lifted (`until` is null). */
export function buildTimeoutEmbed(
  member: GuildMember,
  until: number | null,
  at: Date,
): EmbedBuilder {
  const embed =
    until === null
      ? base('Timeout lifted', EVENT_LOG_COLORS.green, at)
      : base('Member timed out', EVENT_LOG_COLORS.amber, at);
  embed.addFields({ name: 'Member', value: userLine(member.user) });
  if (until !== null) embed.addFields({ name: 'Until', value: discordTime(until) });
  return embed.setFooter({ text: `User ID: ${member.id}` });
}

function banEmbed(title: string, color: number, ban: GuildBan, at: Date): EmbedBuilder {
  return base(title, color, at)
    .addFields(
      { name: 'User', value: userLine(ban.user) },
      { name: 'Reason', value: fieldValue(ban.reason, 'No reason given') },
    )
    .setFooter({ text: `User ID: ${ban.user.id}` });
}

export function buildBanEmbed(ban: GuildBan, at: Date): EmbedBuilder {
  return banEmbed('Member banned', EVENT_LOG_COLORS.red, ban, at);
}

export function buildUnbanEmbed(ban: GuildBan, at: Date): EmbedBuilder {
  return banEmbed('Member unbanned', EVENT_LOG_COLORS.green, ban, at);
}

// ==========================================
// Channels and roles
// ==========================================

function channelKind(channel: NonThreadGuildBasedChannel): string {
  return ChannelType[channel.type] ?? 'Unknown';
}

export function buildChannelCreatedEmbed(
  channel: NonThreadGuildBasedChannel,
  at: Date,
): EmbedBuilder {
  const embed = base('Channel created', EVENT_LOG_COLORS.green, at).addFields(
    { name: 'Channel', value: channelLine(channel.id), inline: true },
    { name: 'Type', value: channelKind(channel), inline: true },
  );
  if (channel.parentId) {
    embed.addFields({ name: 'Category', value: channelLine(channel.parentId), inline: true });
  }
  return embed.setFooter({ text: `Channel ID: ${channel.id}` });
}

/** A deleted channel has no mention to show, so its name is used. */
export function buildChannelDeletedEmbed(
  channel: NonThreadGuildBasedChannel,
  at: Date,
): EmbedBuilder {
  return base('Channel deleted', EVENT_LOG_COLORS.red, at)
    .addFields(
      { name: 'Channel', value: fieldValue(`#${channel.name} (${channel.id})`), inline: true },
      { name: 'Type', value: channelKind(channel), inline: true },
    )
    .setFooter({ text: `Channel ID: ${channel.id}` });
}

export function buildChannelRenamedEmbed(
  oldChannel: NonThreadGuildBasedChannel,
  newChannel: NonThreadGuildBasedChannel,
  at: Date,
): EmbedBuilder {
  return base('Channel renamed', EVENT_LOG_COLORS.amber, at)
    .addFields(
      { name: 'Channel', value: channelLine(newChannel.id) },
      { name: 'Before', value: fieldValue(oldChannel.name), inline: true },
      { name: 'After', value: fieldValue(newChannel.name), inline: true },
    )
    .setFooter({ text: `Channel ID: ${newChannel.id}` });
}

export function buildRoleCreatedEmbed(role: Role, at: Date): EmbedBuilder {
  return base('Role created', EVENT_LOG_COLORS.green, at)
    .addFields(
      { name: 'Role', value: `<@&${role.id}> (${role.id})`, inline: true },
      { name: 'Colour', value: role.hexColor, inline: true },
    )
    .setFooter({ text: `Role ID: ${role.id}` });
}

export function buildRoleDeletedEmbed(role: Role, at: Date): EmbedBuilder {
  return base('Role deleted', EVENT_LOG_COLORS.red, at)
    .addFields({ name: 'Role', value: fieldValue(`${role.name} (${role.id})`) })
    .setFooter({ text: `Role ID: ${role.id}` });
}

export function buildRoleRenamedEmbed(oldRole: Role, newRole: Role, at: Date): EmbedBuilder {
  return base('Role renamed', EVENT_LOG_COLORS.amber, at)
    .addFields(
      { name: 'Role', value: `<@&${newRole.id}> (${newRole.id})` },
      { name: 'Before', value: fieldValue(oldRole.name), inline: true },
      { name: 'After', value: fieldValue(newRole.name), inline: true },
    )
    .setFooter({ text: `Role ID: ${newRole.id}` });
}

// ==========================================
// Voice
// ==========================================

export type VoiceChange =
  | { kind: 'join'; channelId: string }
  | { kind: 'leave'; channelId: string }
  | { kind: 'move'; fromChannelId: string; toChannelId: string };

export function buildVoiceEmbed(member: GuildMember, change: VoiceChange, at: Date): EmbedBuilder {
  const who = { name: 'Member', value: userLine(member.user) };
  const footer = { text: `User ID: ${member.id}` };
  switch (change.kind) {
    case 'join':
      return base('Joined voice channel', EVENT_LOG_COLORS.green, at)
        .addFields(who, { name: 'Channel', value: channelLine(change.channelId) })
        .setFooter(footer);
    case 'leave':
      return base('Left voice channel', EVENT_LOG_COLORS.red, at)
        .addFields(who, { name: 'Channel', value: channelLine(change.channelId) })
        .setFooter(footer);
    case 'move':
      return base('Moved voice channel', EVENT_LOG_COLORS.amber, at)
        .addFields(
          who,
          { name: 'From', value: channelLine(change.fromChannelId), inline: true },
          { name: 'To', value: channelLine(change.toChannelId), inline: true },
        )
        .setFooter(footer);
  }
}
