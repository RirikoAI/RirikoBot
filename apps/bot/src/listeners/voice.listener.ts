import type { Client, VoiceState } from 'discord.js';
import type { VoiceParticipant } from '@ririko/services';
import type { BotServices } from '../services.js';

/**
 * Gateway Voice State Update Listener:
 * Coordinates with VoiceSessionAccumulator to track voice channel quorum,
 * mute/deafen states, and AFK channels to safely accrue voice economy/XP.
 */
export function registerVoiceListener(client: Client, services: BotServices): void {
  client.on('voiceStateUpdate', (oldState: VoiceState, newState: VoiceState) => {
    const userId = newState.id;
    const guildId = newState.guild.id;
    const currentChannelId = newState.channelId;
    const previousChannelId = oldState.channelId ?? undefined;

    // Check if guild has a designated AFK channel
    if (newState.guild.afkChannelId) {
      services.voiceAccumulator.setAfkChannel(newState.guild.afkChannelId, true);
    }

    if (!currentChannelId) {
      // User left voice entirely
      services.voiceAccumulator.onVoiceStateUpdate(null, previousChannelId);
      return;
    }

    // User joined or updated their voice state in a channel
    const participant: VoiceParticipant = {
      userId,
      guildId,
      channelId: currentChannelId,
      isBot: newState.member?.user.bot ?? false,
      isSelfMuted: newState.selfMute ?? false,
      isSelfDeafened: newState.selfDeaf ?? false,
      isServerMuted: newState.serverMute ?? false,
      isServerDeafened: newState.serverDeaf ?? false,
      joinedAt: Date.now(),
    };

    services.voiceAccumulator.onVoiceStateUpdate(participant, previousChannelId);
  });
}
