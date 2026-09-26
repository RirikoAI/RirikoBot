import {
  ChannelType,
  RESTJSONErrorCodes,
  type VoiceState,
  type Guild,
  type VoiceChannel,
} from 'discord.js';
import type { AutoVoiceRepository, AutoVoiceChannelRepository } from '@ririko/database';
import type { ActiveVoiceChannel, AutoVoiceServiceOptions } from './types.js';

export class AutoVoiceService {
  private activeChannels = new Map<string, ActiveVoiceChannel>();
  private creationLocks = new Set<string>();

  constructor(
    private readonly autoVoiceRepo: AutoVoiceRepository,
    private readonly channelRepo: AutoVoiceChannelRepository,
    private readonly options: AutoVoiceServiceOptions = {},
  ) {}

  /**
   * Main entrypoint for the voiceStateUpdate Discord gateway listener.
   */
  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const guild = newState.guild ?? oldState.guild;
    if (!guild) return;

    // 1. Check if user left or switched away from an active dynamic channel
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      await this.handleUserLeftChannel(oldState);
    }

    // 2. Check if user joined a "Join to Create" parent channel
    if (newState.channelId && newState.channelId !== oldState.channelId) {
      await this.handleUserJoinedChannel(newState);
    }
  }

  /**
   * Handles user entering a channel: provisions dynamic channel if parent channel matches.
   */
  private async handleUserJoinedChannel(state: VoiceState): Promise<void> {
    const { guild, member, channel } = state;
    if (!guild || !member || !channel || !channel.id) return;

    // Check if channel is configured as a "Join to Create" parent
    const config = await this.autoVoiceRepo.findByParentChannelId(guild.id, channel.id);
    if (!config) return;

    // Prevent concurrent channel creations for the same user
    const lockKey = `${guild.id}:${member.id}`;
    if (this.creationLocks.has(lockKey)) return;
    this.creationLocks.add(lockKey);

    let createdChannel: VoiceChannel | null = null;
    try {
      const username = member.displayName || member.user.username;
      const template = config.channelNameTemplate || "{user}'s Room";
      const channelName = template.replace(/{user}/gi, username).slice(0, 100);

      // Clone parent channel permission overwrites safely
      let parentOverwrites: any[] = [];
      if (channel.permissionOverwrites?.cache) {
        const cache = channel.permissionOverwrites.cache as any;
        const items =
          typeof cache.map === 'function' ? cache.map((o: any) => o) : Array.from(cache.values());
        parentOverwrites = items.map((overwrite: any) => ({
          id: overwrite.id,
          allow: overwrite.allow,
          deny: overwrite.deny,
          type: overwrite.type,
        }));
      }

      // Create new voice channel on Discord
      const createOptions: any = {
        name: channelName,
        type: ChannelType.GuildVoice,
        position: (channel.position ?? 0) + 1,
        permissionOverwrites: parentOverwrites,
      };
      if (channel.parent) {
        createOptions.parent = channel.parent;
      }
      if (config.userLimit > 0) {
        createOptions.userLimit = config.userLimit;
      }
      if (config.bitrate > 0) {
        // A guild that lost boosts allows less than the saved bitrate; Discord rejects more.
        createOptions.bitrate = Math.min(config.bitrate, guild.maximumBitrate);
      }

      createdChannel = (await guild.channels.create(createOptions)) as VoiceChannel;

      // Record the channel as ours so only channels the service created are ever deleted
      await this.channelRepo.create({
        channelId: createdChannel.id,
        guildId: guild.id,
        parentChannelId: config.parentChannelId,
      });

      // Grant channel owner management permissions
      await createdChannel.permissionOverwrites.edit(member.id, {
        ViewChannel: true,
        Connect: true,
        Speak: true,
        ManageChannels: true,
        MoveMembers: true,
        MuteMembers: true,
        DeafenMembers: true,
      });

      // Move member into the new channel
      await member.voice.setChannel(createdChannel);

      // Track active channel state
      this.activeChannels.set(createdChannel.id, {
        channelId: createdChannel.id,
        guildId: guild.id,
        parentChannelId: config.parentChannelId,
        ownerId: member.id,
        createdAt: new Date(),
        isLocked: false,
      });
    } catch (error) {
      console.error('[AutoVoiceService] Failed to create dynamic voice channel:', error);
      // Clean up orphaned channel if user couldn't be moved or disconnected
      if (createdChannel) {
        try {
          await this.deleteCreatedChannel(createdChannel);
        } catch {
          // Ignore cleanup error; startup cleanup retries recorded channels
        }
      }
    } finally {
      this.creationLocks.delete(lockKey);
    }
  }

  /**
   * Handles user leaving a channel: deletes it if the service created it and it is now empty.
   */
  private async handleUserLeftChannel(state: VoiceState): Promise<void> {
    const channel = state.channel;
    if (!channel) return;
    if ((channel.members?.size ?? 0) > 0) return;

    // Only channels this service created are deleted, including ones created before a restart
    const isCreatedChannel =
      this.activeChannels.has(channel.id) || (await this.channelRepo.exists(channel.id));
    if (!isCreatedChannel) return;

    await this.deleteCreatedChannel(channel);
  }

  /**
   * Forgets a created channel that was deleted outside the service (channelDelete gateway event).
   */
  async handleChannelDelete(channelId: string): Promise<void> {
    await this.forgetChannel(channelId);
  }

  /**
   * Deletes empty channels the service created before a restart and forgets records of channels
   * that no longer exist. Channels the service did not create are never touched.
   */
  async cleanupOrphans(guild: Guild): Promise<number> {
    let deletedCount = 0;
    try {
      const records = await this.channelRepo.listByGuildId(guild.id);
      for (const record of records) {
        const channel = guild.channels.cache.get(record.channelId);
        if (!channel) {
          await this.forgetChannel(record.channelId);
          continue;
        }
        if (channel.type !== ChannelType.GuildVoice || channel.members.size > 0) continue;
        if (await this.deleteCreatedChannel(channel)) deletedCount++;
      }
    } catch (err) {
      console.error('[AutoVoiceService] Error during orphan cleanup:', err);
    }
    return deletedCount;
  }

  /**
   * Deletes a created channel on Discord and forgets it. A channel that is already gone is also
   * forgotten; on any other failure the record is kept so startup cleanup can retry.
   */
  private async deleteCreatedChannel(channel: {
    id: string;
    delete(): Promise<unknown>;
  }): Promise<boolean> {
    try {
      await channel.delete();
    } catch (err) {
      if ((err as { code?: unknown } | null)?.code !== RESTJSONErrorCodes.UnknownChannel) {
        console.error(
          `[AutoVoiceService] Failed to delete dynamic voice channel ${channel.id}:`,
          err,
        );
        return false;
      }
    }
    await this.forgetChannel(channel.id);
    return true;
  }

  private async forgetChannel(channelId: string): Promise<void> {
    this.activeChannels.delete(channelId);
    await this.channelRepo.delete(channelId);
  }

  // --- Channel Ownership & Controls ---

  getActiveChannel(channelId: string): ActiveVoiceChannel | undefined {
    return this.activeChannels.get(channelId);
  }

  isOwner(channelId: string, userId: string): boolean {
    const active = this.activeChannels.get(channelId);
    return active?.ownerId === userId;
  }

  transferOwnership(channelId: string, newOwnerId: string): boolean {
    const active = this.activeChannels.get(channelId);
    if (!active) return false;
    active.ownerId = newOwnerId;
    return true;
  }

  async setChannelName(channel: VoiceChannel, name: string): Promise<void> {
    await channel.setName(name.slice(0, 100));
  }

  async setUserLimit(channel: VoiceChannel, limit: number): Promise<void> {
    await channel.setUserLimit(Math.max(0, Math.min(99, limit)));
  }

  async setBitrate(channel: VoiceChannel, bitrate: number): Promise<void> {
    await channel.setBitrate(bitrate);
  }

  async lockChannel(channel: VoiceChannel, lock: boolean): Promise<void> {
    const active = this.activeChannels.get(channel.id);
    if (active) {
      active.isLocked = lock;
    }

    // Deny or neutral @everyone Connect permission
    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
      Connect: lock ? false : null,
    });
  }
}
