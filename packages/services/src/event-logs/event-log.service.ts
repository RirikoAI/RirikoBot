import {
  AttachmentBuilder,
  type DMChannel,
  type EmbedBuilder,
  type Guild,
  type GuildBan,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
  type NonThreadGuildBasedChannel,
  type PartialGuildMember,
  type PartialMessage,
  type Role,
  type SendableChannels,
  type VoiceState,
} from 'discord.js';
import {
  buildBanEmbed,
  buildBulkDeleteEmbed,
  buildChannelCreatedEmbed,
  buildChannelDeletedEmbed,
  buildChannelRenamedEmbed,
  buildMemberJoinedEmbed,
  buildMemberLeftEmbed,
  buildMessageDeletedEmbed,
  buildMessageEditedEmbed,
  buildNicknameEmbed,
  buildRoleCreatedEmbed,
  buildRoleDeletedEmbed,
  buildRoleRenamedEmbed,
  buildRolesEmbed,
  buildTimeoutEmbed,
  buildUnbanEmbed,
  buildVoiceEmbed,
  formatBulkDeleteFile,
  type VoiceChange,
} from './embeds.js';
import type { EventLogCategory, EventLogConfig, EventLogServiceOptions } from './types.js';

type AnyMessage = Message | PartialMessage;
type AnyGuildMember = GuildMember | PartialGuildMember;
type AnyChannel = DMChannel | NonThreadGuildBasedChannel;

/** Where an event goes: the server's settings and the channel the category posts to. */
interface Target {
  config: EventLogConfig;
  channel: SendableChannels;
  guildId: string;
}

interface Payload {
  embeds: EmbedBuilder[];
  files?: AttachmentBuilder[];
}

/** The text of an error for the console. Never the content of a logged message. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A channel's parent when it is a thread, so a thread follows the channel it belongs to. */
function threadParentId(
  channel: { isThread(): boolean; parentId?: string | null } | null | undefined,
): string | null {
  return channel?.isThread() ? (channel.parentId ?? null) : null;
}

/**
 * Posts one embed per server event (messages, members, the server and voice) to the channel an
 * admin chose for that category (STORY-199). The gateway listener only forwards discord.js
 * objects here; this class decides whether the event is logged, builds the embed and sends it.
 *
 * Settings are cached per server; the bot drops a server on `guild:configChanged` for the
 * `eventlogs` module and the TTL is only a safety net. Nothing here throws to the gateway: a
 * failed read skips the event and a failed send is logged with IDs only.
 */
export class EventLogService {
  private readonly repo: EventLogServiceOptions['repo'];
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, { config: EventLogConfig | null; cachedAt: number }>();

  constructor(options: EventLogServiceOptions) {
    this.repo = options.repo;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  /** Drops a server's cached settings (or every server's) so the next event reads them again. */
  invalidate(guildId?: string): void {
    if (guildId) this.cache.delete(guildId);
    else this.cache.clear();
  }

  // ==========================================
  // Message log
  // ==========================================

  async messageEdited(oldMessage: AnyMessage, newMessage: AnyMessage): Promise<void> {
    await this.guard('messageEdited', async () => {
      const guild = newMessage.guild;
      if (!guild || !this.contentChanged(oldMessage, newMessage)) return;
      const target = await this.target(guild, 'message');
      if (!target) return;
      const author = newMessage.author ?? oldMessage.author;
      if (!this.messageAllowed(target, newMessage.channelId, newMessage.channel, author?.bot)) {
        return;
      }
      await this.send(target, {
        embeds: [buildMessageEditedEmbed(oldMessage, newMessage, this.at())],
      });
    });
  }

  async messageDeleted(message: AnyMessage): Promise<void> {
    await this.guard('messageDeleted', async () => {
      const guild = message.guild;
      if (!guild) return;
      const target = await this.target(guild, 'message');
      if (!target) return;
      if (!this.messageAllowed(target, message.channelId, message.channel, message.author?.bot)) {
        return;
      }
      await this.send(target, { embeds: [buildMessageDeletedEmbed(message, this.at())] });
    });
  }

  async messagesBulkDeleted(
    messages: ReadonlyMap<string, AnyMessage>,
    channel: GuildTextBasedChannel,
  ): Promise<void> {
    await this.guard('messagesBulkDeleted', async () => {
      const target = await this.target(channel.guild, 'message');
      if (!target) return;
      if (!this.messageAllowed(target, channel.id, channel, false)) return;

      const deleted = [...messages.values()].filter(
        (message) => !(target.config.ignoreBots && message.author?.bot),
      );
      if (deleted.length === 0) return;
      const cached = deleted.filter((message): message is Message => !message.partial);

      const fileName = cached.length > 0 ? `bulk-delete-${channel.id}.txt` : null;
      const embed = buildBulkDeleteEmbed(
        { channelId: channel.id, count: deleted.length, cachedCount: cached.length, fileName },
        this.at(),
      );
      const payload: Payload = { embeds: [embed] };
      if (fileName) {
        const text = formatBulkDeleteFile(channel, cached);
        payload.files = [new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: fileName })];
      }
      await this.send(target, payload);
    });
  }

  // ==========================================
  // Member log
  // ==========================================

  async memberJoined(member: GuildMember): Promise<void> {
    await this.memberEvent('memberJoined', member.guild, () => [
      buildMemberJoinedEmbed(member, this.at()),
    ]);
  }

  async memberLeft(member: AnyGuildMember): Promise<void> {
    await this.memberEvent('memberLeft', member.guild, () => [
      buildMemberLeftEmbed(member, this.at()),
    ]);
  }

  /** A nickname change, roles added or removed, and a timeout set or lifted: one embed each. */
  async memberUpdated(oldMember: AnyGuildMember, newMember: GuildMember): Promise<void> {
    if (oldMember.partial) return;
    await this.memberEvent('memberUpdated', newMember.guild, () => {
      const at = this.at();
      const embeds: EmbedBuilder[] = [];

      if (oldMember.nickname !== newMember.nickname) {
        embeds.push(buildNicknameEmbed(oldMember, newMember, at));
      }

      const before = new Set(oldMember.roles.cache.keys());
      const after = new Set(newMember.roles.cache.keys());
      const added = [...after].filter((id) => !before.has(id) && id !== newMember.guild.id);
      const removed = [...before].filter((id) => !after.has(id) && id !== newMember.guild.id);
      if (added.length > 0 || removed.length > 0) {
        embeds.push(buildRolesEmbed(newMember, added, removed, at));
      }

      const now = this.now();
      const oldUntil = oldMember.communicationDisabledUntilTimestamp;
      const newUntil = newMember.communicationDisabledUntilTimestamp;
      if (newUntil !== null && newUntil > now && newUntil !== oldUntil) {
        embeds.push(buildTimeoutEmbed(newMember, newUntil, at));
      } else if ((newUntil === null || newUntil <= now) && oldUntil !== null && oldUntil > now) {
        embeds.push(buildTimeoutEmbed(newMember, null, at));
      }
      return embeds;
    });
  }

  async memberBanned(ban: GuildBan): Promise<void> {
    await this.memberEvent('memberBanned', ban.guild, () => [buildBanEmbed(ban, this.at())]);
  }

  async memberUnbanned(ban: GuildBan): Promise<void> {
    await this.memberEvent('memberUnbanned', ban.guild, () => [buildUnbanEmbed(ban, this.at())]);
  }

  // ==========================================
  // Server log
  // ==========================================

  async channelCreated(channel: AnyChannel): Promise<void> {
    if (channel.isDMBased()) return;
    await this.serverEvent('channelCreated', channel.guild, () => [
      buildChannelCreatedEmbed(channel, this.at()),
    ]);
  }

  async channelDeleted(channel: AnyChannel): Promise<void> {
    if (channel.isDMBased()) return;
    await this.serverEvent('channelDeleted', channel.guild, () => [
      buildChannelDeletedEmbed(channel, this.at()),
    ]);
  }

  /** Only a rename is logged. */
  async channelUpdated(oldChannel: AnyChannel, newChannel: AnyChannel): Promise<void> {
    if (oldChannel.isDMBased() || newChannel.isDMBased()) return;
    if (oldChannel.name === newChannel.name) return;
    await this.serverEvent('channelUpdated', newChannel.guild, () => [
      buildChannelRenamedEmbed(oldChannel, newChannel, this.at()),
    ]);
  }

  async roleCreated(role: Role): Promise<void> {
    await this.serverEvent('roleCreated', role.guild, () => [
      buildRoleCreatedEmbed(role, this.at()),
    ]);
  }

  async roleDeleted(role: Role): Promise<void> {
    await this.serverEvent('roleDeleted', role.guild, () => [
      buildRoleDeletedEmbed(role, this.at()),
    ]);
  }

  /** Only a rename is logged. */
  async roleUpdated(oldRole: Role, newRole: Role): Promise<void> {
    if (oldRole.name === newRole.name) return;
    await this.serverEvent('roleUpdated', newRole.guild, () => [
      buildRoleRenamedEmbed(oldRole, newRole, this.at()),
    ]);
  }

  // ==========================================
  // Voice log
  // ==========================================

  /** Joining, leaving and moving. Mute, deafen, stream and camera changes are ignored. */
  async voiceStateChanged(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const change = this.voiceChange(oldState.channelId, newState.channelId);
    const member = newState.member ?? oldState.member;
    if (!change || !member) return;
    await this.guard('voiceStateChanged', async () => {
      const target = await this.target(newState.guild, 'voice');
      if (!target) return;
      if (target.config.ignoreBots && member.user.bot) return;
      await this.send(target, { embeds: [buildVoiceEmbed(member, change, this.at())] });
    });
  }

  // ==========================================
  // Shared steps
  // ==========================================

  private at(): Date {
    return new Date(this.now());
  }

  private voiceChange(from: string | null, to: string | null): VoiceChange | null {
    if (from === to) return null;
    if (from === null && to !== null) return { kind: 'join', channelId: to };
    if (from !== null && to === null) return { kind: 'leave', channelId: from };
    return { kind: 'move', fromChannelId: from as string, toChannelId: to as string };
  }

  /** Runs one event handler so that nothing it does can throw into the gateway. */
  private async guard(event: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      console.error(`[EventLogService] ${event} failed:`, errorText(error));
    }
  }

  private async memberEvent(
    event: string,
    guild: Guild,
    build: () => EmbedBuilder[],
  ): Promise<void> {
    await this.guard(event, async () => {
      const target = await this.target(guild, 'member');
      if (!target) return;
      const embeds = build();
      if (embeds.length > 0) await this.send(target, { embeds });
    });
  }

  private async serverEvent(
    event: string,
    guild: Guild,
    build: () => EmbedBuilder[],
  ): Promise<void> {
    await this.guard(event, async () => {
      const target = await this.target(guild, 'server');
      if (target) await this.send(target, { embeds: build() });
    });
  }

  /**
   * An edit is logged when its text changed. An embed or link preview update has the same text.
   * When the old text is not cached, a real edit is told apart by the edit time Discord sets.
   */
  private contentChanged(oldMessage: AnyMessage, newMessage: AnyMessage): boolean {
    if (newMessage.content === null) return false;
    if (oldMessage.content === null) return newMessage.editedTimestamp !== null;
    return oldMessage.content !== newMessage.content;
  }

  /** The message rules: not in the log channel, not in an ignored channel, not from a bot. */
  private messageAllowed(
    target: Target,
    channelId: string,
    channel: { isThread(): boolean; parentId?: string | null } | null | undefined,
    isBot: boolean | undefined,
  ): boolean {
    const { config } = target;
    if (channelId === target.channel.id) return false;
    if (config.ignoredChannelIds.has(channelId)) return false;
    const parentId = threadParentId(channel);
    if (parentId !== null && config.ignoredChannelIds.has(parentId)) return false;
    return !(config.ignoreBots && isBot);
  }

  /** The server's settings, cached. A read error is logged and the event is skipped. */
  private async getConfig(guildId: string): Promise<EventLogConfig | null> {
    const now = this.now();
    const cached = this.cache.get(guildId);
    if (cached && now - cached.cachedAt < this.cacheTtlMs) return cached.config;

    let config: EventLogConfig | null;
    try {
      const row = await this.repo.get(guildId);
      config = row
        ? {
            messageChannelId: row.messageChannelId,
            memberChannelId: row.memberChannelId,
            serverChannelId: row.serverChannelId,
            voiceChannelId: row.voiceChannelId,
            ignoredChannelIds: new Set(row.ignoredChannelIds),
            ignoreBots: row.ignoreBots,
          }
        : null;
    } catch (error) {
      console.error(
        `[EventLogService] Could not read the settings of guild ${guildId}:`,
        errorText(error),
      );
      return null;
    }
    this.cache.set(guildId, { config, cachedAt: now });
    return config;
  }

  /** The category's channel, or null when the category is off or the channel is gone. */
  private async target(guild: Guild, category: EventLogCategory): Promise<Target | null> {
    const config = await this.getConfig(guild.id);
    if (!config) return null;
    const channelId = config[`${category}ChannelId`];
    if (!channelId) return null;
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isSendable()) return null;
    return { config, channel, guildId: guild.id };
  }

  /** Best-effort: a missing permission or a deleted channel is logged with IDs only. */
  private async send(target: Target, payload: Payload): Promise<void> {
    try {
      await target.channel.send({ ...payload, allowedMentions: { parse: [] } });
    } catch (error) {
      console.error(
        `[EventLogService] Could not post to channel ${target.channel.id} in guild ${target.guildId}:`,
        errorText(error),
      );
    }
  }
}
