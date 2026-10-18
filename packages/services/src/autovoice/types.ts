import type { VoiceChannel, StageChannel } from 'discord.js';

export interface ActiveVoiceChannel {
  channelId: string;
  guildId: string;
  parentChannelId: string;
  ownerId: string;
  createdAt: Date;
  isLocked: boolean;
}

export interface AutoVoiceServiceOptions {
  activeSweepIntervalMs?: number;
}

export type VoiceBasedChannelLike = VoiceChannel | StageChannel;
