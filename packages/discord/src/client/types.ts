import type { ClientOptions, Partials, PresenceData, SweeperOptions } from 'discord.js';

export type GatewayState = 'DISCONNECTED' | 'CONNECTING' | 'READY' | 'RECONNECTING' | 'DESTROYED';

export interface ShardMetrics {
  id: number;
  status: string;
  ping: number;
}

export interface GatewayMetrics {
  state: GatewayState;
  ping: number;
  uptime: number | null;
  guildCount: number;
  userCount: number;
  shardCount: number;
  shards: ShardMetrics[];
}

export interface DiscordClientConfig {
  /**
   * Discord bot token.
   */
  token?: string | undefined;

  /**
   * Gateway intents bitfield or array of intent flags.
   * Defaults to DEFAULT_GATEWAY_INTENTS.
   */
  intents?: ClientOptions['intents'] | undefined;

  /**
   * Gateway partial structures.
   * Defaults to DEFAULT_PARTIALS.
   */
  partials?: Partials[] | undefined;

  /**
   * Custom sweepers configuration for memory management.
   */
  sweepers?: SweeperOptions | undefined;

  /**
   * Custom default presence data.
   */
  presence?: PresenceData | undefined;

  /**
   * Allowed mentions configuration to prevent accidental mass pings.
   */
  allowedMentions?: ClientOptions['allowedMentions'] | undefined;

  /**
   * Total number of shards or specific shard IDs.
   */
  shards?: number | number[] | 'auto' | undefined;
  shardCount?: number | undefined;

  /**
   * Additional raw ClientOptions overrides.
   */
  clientOptions?: Partial<ClientOptions> | undefined;
}

export interface GatewayStateChangeEvent {
  from: GatewayState;
  to: GatewayState;
  timestamp: Date;
  reason?: string | undefined;
}
