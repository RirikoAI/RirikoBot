import type { Client, VoiceState } from 'discord.js';
import type { VoiceParticipant } from '@ririko/services';
import type { BotServices } from '../services.js';

function toParticipant(state: VoiceState, channelId: string): VoiceParticipant {
  return {
    userId: state.id,
    guildId: state.guild.id,
    channelId,
    isBot: state.member?.user.bot ?? false,
    isSelfMuted: state.selfMute ?? false,
    isSelfDeafened: state.selfDeaf ?? false,
    isServerMuted: state.serverMute ?? false,
    isServerDeafened: state.serverDeaf ?? false,
    joinedAt: Date.now(),
  };
}

/**
 * Gateway Voice State Update Listener:
 * Coordinates with VoiceSessionAccumulator to track voice channel quorum,
 * mute/deafen states, and AFK channels to safely accrue voice economy/XP.
 */
export function registerVoiceListener(client: Client, services: BotServices): void {
  client.on('voiceStateUpdate', (oldState: VoiceState, newState: VoiceState) => {
    const currentChannelId = newState.channelId;
    const previousChannelId = oldState.channelId ?? undefined;

    // Check if guild has a designated AFK channel
    if (newState.guild.afkChannelId) {
      services.voiceAccumulator.setAfkChannel(newState.guild.afkChannelId, true);
    }

    if (!currentChannelId) {
      // Left voice entirely. Remove this member by ID: removing by channel would drop whoever
      // the accumulator finds first in that channel.
      services.voiceAccumulator.handleUserLeave(newState.id);
      return;
    }

    // User joined or updated their voice state in a channel
    services.voiceAccumulator.onVoiceStateUpdate(
      toParticipant(newState, currentChannelId),
      previousChannelId,
    );
  });
}

/**
 * Starts tracking everyone already in voice. Voice state updates only report changes, so
 * without this, members in voice when the bot (re)connects would earn nothing until they
 * moved or toggled mute. Call on every gateway READY.
 */
export function trackCurrentVoiceMembers(client: Client, services: BotServices): void {
  services.voiceAccumulator.reset();
  for (const guild of client.guilds.cache.values()) {
    if (guild.afkChannelId) services.voiceAccumulator.setAfkChannel(guild.afkChannelId, true);
    for (const state of guild.voiceStates.cache.values()) {
      if (state.channelId) {
        services.voiceAccumulator.onVoiceStateUpdate(toParticipant(state, state.channelId));
      }
    }
  }
}

/**
 * Reports to the music player how many members who are not bots share Ririko's voice
 * channel, so it can leave an empty channel when the guild's auto-leave setting is on.
 */
export function registerMusicVoiceListener(client: Client, services: BotServices): void {
  client.on('voiceStateUpdate', (oldState: VoiceState, newState: VoiceState) => {
    const guild = newState.guild;
    const botChannelId = guild.members.me?.voice.channelId;
    if (!botChannelId) return;
    if (oldState.channelId !== botChannelId && newState.channelId !== botChannelId) return;

    const channel = guild.channels.cache.get(botChannelId);
    if (!channel?.isVoiceBased()) return;
    const listeners = channel.members.filter((member) => !member.user.bot).size;

    services.musicRepo
      .getGuildSettings(guild.id)
      .then((settings) =>
        services.musicPlayer.handleChannelOccupancy(
          guild.id,
          listeners,
          settings?.autoLeaveEmpty ?? true,
        ),
      )
      .catch((err: unknown) => {
        console.error(`[Music] Could not check auto-leave for guild ${guild.id}:`, err);
      });
  });
}
