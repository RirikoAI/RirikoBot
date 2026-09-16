import type { VoiceConnection, DiscordGatewayAdapterCreator } from '@discordjs/voice';
export type { VoiceConnection, DiscordGatewayAdapterCreator };

export type DisconnectReason =
  | 'EMPTY_QUEUE'
  | 'EMPTY_CHANNEL'
  | 'MANUAL'
  | 'ERROR'
  | 'RECONNECT_FAILED';

export interface VoiceLifecycleOptions {
  guildId: string;
  idleTimeoutMs?: number | undefined; // default 180,000 ms (3 minutes)
  maxReconnectAttempts?: number | undefined; // default 5
  initialReconnectBackoffMs?: number | undefined; // default 1,500 ms
  autoLeaveEmpty?: boolean | undefined; // default true
  autoLeaveEnd?: boolean | undefined; // default true
}

export interface VoiceLifecycleEvents {
  connected: (connection: VoiceConnection) => void;
  disconnected: (reason: DisconnectReason) => void;
  reconnecting: (attempt: number, maxAttempts: number, delayMs: number) => void;
  idleTimerStarted: (reason: 'EMPTY_QUEUE' | 'EMPTY_CHANNEL', timeoutMs: number) => void;
  idleTimerCancelled: (reason: string) => void;
  autoDisconnect: (reason: DisconnectReason) => void;
  error: (error: Error) => void;
}

export interface JoinVoiceOptions {
  channelId: string;
  adapterCreator: DiscordGatewayAdapterCreator;
  selfDeaf?: boolean | undefined;
  selfMute?: boolean | undefined;
}
