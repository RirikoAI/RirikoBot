import { EventEmitter } from 'node:events';
import { Events, Status, type Client } from 'discord.js';
import type {
  GatewayMetrics,
  GatewayState,
  GatewayStateChangeEvent,
  ShardMetrics,
} from './types.js';
import { GatewayError } from '../errors/index.js';

export interface GatewayManagerOptions {
  autoReconnect?: boolean | undefined;
  maxReconnectAttempts?: number | undefined;
  initialBackoffMs?: number | undefined;
  maxBackoffMs?: number | undefined;
}

/**
 * Manages Discord Gateway connection lifecycle, reconnection state machine,
 * heartbeats, and shard health telemetry.
 */
export class GatewayManager extends EventEmitter {
  private _state: GatewayState = 'DISCONNECTED';
  private _reconnectAttempts = 0;
  private _reconnectTimer?: NodeJS.Timeout | undefined;
  private _token?: string | undefined;

  constructor(
    public readonly client: Client,
    private readonly options: GatewayManagerOptions = {},
  ) {
    super();
    this.setupListeners();
  }

  public get state(): GatewayState {
    return this._state;
  }

  public get reconnectAttempts(): number {
    return this._reconnectAttempts;
  }

  private setState(to: GatewayState, reason?: string) {
    if (this._state === to) return;
    const from = this._state;
    this._state = to;

    const event: GatewayStateChangeEvent = {
      from,
      to,
      timestamp: new Date(),
      reason,
    };

    this.emit('stateChange', event);
  }

  private setupListeners() {
    const onReady = () => {
      if (this._state === 'READY') return;
      this._reconnectAttempts = 0;
      this.setState('READY', 'Gateway connection ready');
    };
    this.client.on(Events.ClientReady, onReady);
    this.client.on('ready', onReady);

    this.client.on('shardDisconnect', (_closeEvent, shardId) => {
      if (this._state !== 'DESTROYED') {
        this.setState('RECONNECTING', `Shard ${shardId} disconnected`);
        this.scheduleReconnect();
      }
    });

    this.client.on('shardReconnecting', (shardId) => {
      if (this._state !== 'DESTROYED') {
        this.setState('RECONNECTING', `Shard ${shardId} reconnecting`);
      }
    });

    this.client.on('shardResume', (_shardId, _replayedEvents) => {
      this.setState('READY', 'Shard session resumed');
    });

    this.client.on('shardError', (error, shardId) => {
      this.emit(
        'error',
        new GatewayError(`Shard ${shardId} error: ${error.message}`, { cause: error }),
      );
    });
  }

  /**
   * Connects the client to the Discord gateway with the provided token.
   */
  public async connect(token: string): Promise<void> {
    if (this._state === 'READY' || this._state === 'CONNECTING') {
      return;
    }

    this._token = token;
    this.setState('CONNECTING', 'Initiating gateway login');

    try {
      await this.client.login(token);
    } catch (error) {
      this.setState('DISCONNECTED', error instanceof Error ? error.message : String(error));
      throw new GatewayError('Failed to connect to Discord Gateway', {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  /**
   * Schedules reconnection with exponential backoff.
   */
  private scheduleReconnect() {
    if (this.options.autoReconnect === false) return;
    if (this._state === 'DESTROYED') return;

    const maxAttempts = this.options.maxReconnectAttempts ?? 5;
    if (this._reconnectAttempts >= maxAttempts) {
      this.setState('DISCONNECTED', 'Max reconnect attempts exceeded');
      this.emit('error', new GatewayError(`Failed to reconnect after ${maxAttempts} attempts`));
      return;
    }

    const initialBackoff = this.options.initialBackoffMs ?? 1000;
    const maxBackoff = this.options.maxBackoffMs ?? 30000;
    const delay = Math.min(initialBackoff * Math.pow(2, this._reconnectAttempts), maxBackoff);
    this._reconnectAttempts++;

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
    }

    this._reconnectTimer = setTimeout(async () => {
      if (this._state === 'DESTROYED' || !this._token) return;
      try {
        await this.connect(this._token);
      } catch {
        // Next retry scheduled via shardDisconnect or listener
      }
    }, delay);
  }

  /**
   * Returns runtime telemetry metrics for gateway connection, latency, and shard health.
   */
  public getMetrics(): GatewayMetrics {
    const shards: ShardMetrics[] = [];

    if (this.client.ws.shards.size > 0) {
      for (const [id, shard] of this.client.ws.shards) {
        shards.push({
          id,
          status: Status[shard.status] ?? String(shard.status),
          ping: shard.ping,
        });
      }
    }

    const rawPing = this.client.ws.ping;
    const ping = Number.isNaN(rawPing) ? -1 : rawPing;

    return {
      state: this._state,
      ping,
      uptime: this.client.uptime,
      guildCount: this.client.guilds.cache.size,
      userCount: this.client.users.cache.size,
      shardCount: this.client.ws.shards.size,
      shards,
    };
  }

  /**
   * Gracefully shuts down the gateway connection and unbinds listeners.
   */
  public async destroy(): Promise<void> {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = undefined;
    }

    this.setState('DESTROYED', 'Client destroyed');
    await this.client.destroy();
    this.removeAllListeners();
  }
}
