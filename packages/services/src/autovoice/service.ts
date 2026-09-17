import {
  ChannelType,
  type VoiceState,
  type Guild,
  type VoiceChannel,
} from 'discord.js';
import type { AutoVoiceRepository, AutoVoiceConfig } from '@ririko/database';
import type { ActiveVoiceChannel, AutoVoiceServiceOptions } from './types.js';

export class AutoVoiceService {
  private activeChannels = new Map<string, ActiveVoiceChannel>();
  private creationLocks = new Set<string>();

  constructor(
    private readonly autoVoiceRepo: AutoVoiceRepository,
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
        const items = typeof cache.map === 'function' ? cache.map((o: any) => o) : Array.from(cache.values());
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
        createOptions.bitrate = config.bitrate;
      }

      createdChannel = (await guild.channels.create(createOptions)) as VoiceChannel;

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
          await createdChannel.delete();
        } catch {
          // Ignore deletion error
        }
      }
    } finally {
      this.creationLocks.delete(lockKey);
    }
  }

  /**
   * Handles user leaving a channel: deletes dynamic channel if now empty.
   */
  private async handleUserLeftChannel(state: VoiceState): Promise<void> {
    const channelId = state.channelId;
    if (!channelId) return;

    const channel = state.channel as VoiceChannel | null;
    if (!channel) return;

    // Check if channel is tracked as active
    const active = this.activeChannels.get(channelId);
    if (active) {
      const remainingCount = channel.members?.size ?? 0;
      if (remainingCount === 0) {
        this.activeChannels.delete(channelId);
        try {
          await channel.delete();
        } catch (err) {
          console.error('[AutoVoiceService] Failed to delete empty dynamic voice channel:', err);
        }
      }
      return;
    }

    // Untracked orphan check (e.g. left behind after reboot before empty)
    if (channel.members?.size === 0 && state.guild) {
      const configs: AutoVoiceConfig[] = await this.autoVoiceRepo.listByGuildId(state.guild.id);
      const isConfigParent = configs.some((c: AutoVoiceConfig) => c.parentChannelId === channelId);
      if (!isConfigParent) {
        // Channel is empty and not a configured parent channel
        const matchesCategory = configs.some(
          (c: AutoVoiceConfig) => channel.parent && channel.parent.id === state.guild.channels.cache.get(c.parentChannelId)?.parentId,
        );
        if (matchesCategory) {
          try {
            await channel.delete();
          } catch {
            // Non-fatal
          }
        }
      }
    }
  }

  /**
   * Scans guild for empty orphaned dynamic channels left behind after a bot restart.
   */
  async cleanupOrphans(guild: Guild): Promise<number> {
    let deletedCount = 0;
    try {
      const configs: AutoVoiceConfig[] = await this.autoVoiceRepo.listByGuildId(guild.id);
      if (configs.length === 0) return 0;

      const parentIds = new Set(configs.map((c: AutoVoiceConfig) => c.parentChannelId));
      const parentCategories = new Set(
        configs
          .map((c: AutoVoiceConfig) => guild.channels.cache.get(c.parentChannelId)?.parentId)
          .filter(Boolean) as string[],
      );

      // Check all guild voice channels
      for (const [, channel] of guild.channels.cache) {
        if (channel.type !== ChannelType.GuildVoice) continue;
        if (parentIds.has(channel.id)) continue; // Never delete Join to Create parent

        const isTrackedChild = this.activeChannels.has(channel.id);
        const isInParentCategory = channel.parentId && parentCategories.has(channel.parentId);

        if ((isTrackedChild || isInParentCategory) && channel.members.size === 0) {
          this.activeChannels.delete(channel.id);
          try {
            await channel.delete();
            deletedCount++;
          } catch (err) {
            console.error(`[AutoVoiceService] Failed to prune orphan channel ${channel.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('[AutoVoiceService] Error during orphan cleanup:', err);
    }
    return deletedCount;
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
