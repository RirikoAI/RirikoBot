import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { DiscordService } from '#discord/discord.service';
import { VoiceChannel } from '#database/entities/voice-channel.entity';
import { Not } from 'typeorm';
import { ChannelType, VoiceState } from 'discord.js';
import { DiscordGuild, DiscordVoiceChannel } from '#command/command.types';
import { DatabaseService } from '#database/database.service';

/**
 * Auto voice channel service.
 * @description This service is responsible for managing auto voice channels.
 * @category Service
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export class AvcService {
  constructor(
    @Inject(forwardRef(() => DiscordService))
    readonly discord: DiscordService,
    @Inject(DatabaseService)
    readonly db: DatabaseService,
  ) {}

  /**
   * Main method to check the voice state and act accordingly.
   * @param oldState The previous voice state.
   * @param newState The new voice state.
   */
  async check(oldState: VoiceState, newState: VoiceState) {
    const guild = newState.guild;

    await this.cleanVoiceChannels(guild); // Clean up voice channels first.

    if (newState?.channel?.id) {
      const voiceChannel = await this.findVoiceChannel(newState.channel.id);

      if (voiceChannel && voiceChannel.parentId === '0') {
        // Create a child voice channel if it doesn't have a parent.
        this.createChildVoiceChannel(guild, voiceChannel, newState);
      }
    }
  }

  /**
   * Finds a voice channel by its ID.
   * @param channelId The ID of the channel.
   * @returns The voice channel from the database or null.
   */
  private async findVoiceChannel(
    channelId: string,
  ): Promise<VoiceChannel | null> {
    return this.db.voiceChannelRepository.findOne({
      where: { id: channelId },
    });
  }

  /**
   * Creates a new child voice channel for a user.
   * @param guild The guild where the channel is created.
   * @param voiceChannel The parent voice channel.
   * @param newState The new voice state of the user.
   */
  private async createChildVoiceChannel(
    guild: DiscordGuild,
    voiceChannel: VoiceChannel,
    newState: VoiceState,
  ) {
    const newChannel = await this.createDiscordVoiceChannel(guild, newState);

    await this.setChannelPermissions(newChannel, newState);
    await this.saveVoiceChannelToDatabase(newChannel, voiceChannel, guild);

    // Move the user to the new channel
    await this.moveUserToChannel(newState, newChannel);
  }

  /**
   * Creates a new voice channel on Discord.
   * @param guild The guild where the channel is created.
   * @param newState The voice state of the user.
   * @returns The created voice channel.
   */
  private async createDiscordVoiceChannel(
    guild: DiscordGuild,
    newState: VoiceState,
  ) {
    return guild.channels.create({
      type: ChannelType.GuildVoice,
      name: `${newState.member.user.username}'s Channel`,
      position: newState.channel.position + 1,
      parent: newState.channel.parent,
    });
  }

  /**
   * Sets the permissions for the new voice channel.
   * Now copies the "Join to Create" channel's permissions.
   * @param channel The new voice channel.
   * @param newState The new voice state of the user.
   */
  private async setChannelPermissions(
    channel: DiscordVoiceChannel,
    newState: VoiceState,
  ) {
    const parentChannel = newState.channel; // This is the Join to Create channel

    // Clone parent permission overwrites
    const parentOverwrites = parentChannel.permissionOverwrites.cache.map(
      (overwrite) => ({
        id: overwrite.id,
        allow: overwrite.allow,
        deny: overwrite.deny,
        type: overwrite.type,
      }),
    );

    // Apply parent permissions
    await channel.permissionOverwrites.set(parentOverwrites);

    // Then add or override specific user and guild permissions
    await channel.permissionOverwrites.edit(newState.member.id, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      ManageChannels: true,
    });
  }

  /**
   * Saves the newly created voice channel to the database.
   * @param channel The newly created voice channel.
   * @param voiceChannel The parent voice channel from the database.
   * @param guild The guild where the voice channel belongs.
   */
  private async saveVoiceChannelToDatabase(
    channel: DiscordVoiceChannel,
    voiceChannel: VoiceChannel,
    guild: DiscordGuild,
  ) {
    await this.db.voiceChannelRepository.insert({
      id: channel.id,
      name: channel.name,
      parentId: voiceChannel.id,
      guild: { id: guild.id },
    });
  }

  /**
   * Moves the user to the newly created voice channel.
   * @param newState The new voice state of the user.
   * @param newChannel The new voice channel the user will be moved to.
   */
  private async moveUserToChannel(
    newState: VoiceState,
    newChannel: DiscordVoiceChannel,
  ) {
    await newState.member.voice.setChannel(newChannel);
  }

  /**
   * Cleans up voice channels in the guild.
   * This method checks for missing or empty voice channels and removes them from the database.
   * @param guild The guild where the cleanup will be done.
   */
  private async cleanVoiceChannels(guild: DiscordGuild) {
    const voiceChannels = await this.db.voiceChannelRepository.find({
      where: { guild: { id: guild.id } },
    });

    // Clean up channels that no longer exist
    for (const voiceChannel of voiceChannels) {
      if (!guild.channels.cache.has(voiceChannel.id)) {
        await this.removeVoiceChannelFromDatabase(voiceChannel);
      } else {
        await this.updateChannelNameIfNeeded(guild, voiceChannel);
      }
    }

    // Clean up empty child channels
    await this.removeEmptyChildChannels(guild);
  }

  /**
   * Removes a voice channel from the database.
   * @param voiceChannel The voice channel to be removed.
   */
  private async removeVoiceChannelFromDatabase(voiceChannel: VoiceChannel) {
    await this.db.voiceChannelRepository.remove(voiceChannel);
  }

  /**
   * Updates the name of a voice channel if it has changed.
   * @param guild The guild where the channel belongs.
   * @param voiceChannel The voice channel to check and update.
   */
  private async updateChannelNameIfNeeded(
    guild: DiscordGuild,
    voiceChannel: VoiceChannel,
  ) {
    const channel = guild.channels.cache.get(voiceChannel.id);
    if (channel && channel.name !== voiceChannel.name) {
      await this.updateVoiceChannelName(voiceChannel, channel.name);
    }
  }

  /**
   * Removes empty child voice channels from the database and Discord.
   * @param guild The guild to clean up.
   */
  private async removeEmptyChildChannels(guild: DiscordGuild) {
    const voiceChannels = await this.db.voiceChannelRepository.find({
      where: {
        parentId: Not('0'),
        guild: { id: guild.id },
      },
    });

    for (const voiceChannel of voiceChannels) {
      const channel: any = guild.channels.cache.get(voiceChannel.id);
      if (channel && channel.members.size === 0) {
        await this.db.voiceChannelRepository.remove(voiceChannel);
        await channel.delete();
      }
    }
  }

  /**
   * Updates the name of a voice channel in the database.
   * @param voiceChannel The voice channel to update.
   * @param name The new name for the channel.
   */
  private async updateVoiceChannelName(
    voiceChannel: VoiceChannel,
    name: string,
  ) {
    voiceChannel.name = name;
    await this.db.voiceChannelRepository.save(voiceChannel);
  }
}
