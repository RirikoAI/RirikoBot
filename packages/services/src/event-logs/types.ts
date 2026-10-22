import type { EventLogSettingsRepository } from '@ririko/database';

/** The four log categories. Each posts to its own channel and is off while that channel is unset. */
export type EventLogCategory = 'message' | 'member' | 'server' | 'voice';

/** A server's event log settings, as the service uses them. */
export interface EventLogConfig {
  messageChannelId: string | null;
  memberChannelId: string | null;
  serverChannelId: string | null;
  voiceChannelId: string | null;
  /** Message events in these channels (and in threads of them) are not logged. */
  ignoredChannelIds: ReadonlySet<string>;
  ignoreBots: boolean;
}

export interface EventLogServiceOptions {
  repo: Pick<EventLogSettingsRepository, 'get'>;
  /** How long a server's settings are cached. Defaults to 5 minutes. */
  cacheTtlMs?: number;
  /** The clock in milliseconds, so tests are deterministic. */
  now?: () => number;
}
