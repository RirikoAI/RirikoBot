import { EventEmitter } from 'node:events';
import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
  type VoiceConnection,
} from '@discordjs/voice';
import type {
  DisconnectReason,
  JoinVoiceOptions,
  VoiceLifecycleEvents,
  VoiceLifecycleOptions,
} from './types.js';
import type { GuildQueue } from '../queue/guild-queue.js';

export interface ResolvedVoiceLifecycleOptions {
  guildId: string;
  idleTimeoutMs: number;
  maxReconnectAttempts: number;
  initialReconnectBackoffMs: number;
  autoLeaveEmpty: boolean;
  autoLeaveEnd: boolean;
}

const DEFAULT_OPTIONS: ResolvedVoiceLifecycleOptions = {
  guildId: '',
  idleTimeoutMs: 180_000, // 3 minutes
  maxReconnectAttempts: 5,
  initialReconnectBackoffMs: 1_500,
  autoLeaveEmpty: true,
  autoLeaveEnd: true,
};

export class VoiceLifecycleManager extends EventEmitter {
  readonly guildId: string;
  readonly options: ResolvedVoiceLifecycleOptions;

  private connection: VoiceConnection | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private idleReason: 'EMPTY_QUEUE' | 'EMPTY_CHANNEL' | null = null;
  private reconnectAttempts = 0;
  private isReconnecting = false;
  private boundQueue: GuildQueue | null = null;

  constructor(options: VoiceLifecycleOptions) {
    super();
    this.guildId = options.guildId;
    this.options = {
      guildId: options.guildId,
      idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_OPTIONS.idleTimeoutMs,
      maxReconnectAttempts: options.maxReconnectAttempts ?? DEFAULT_OPTIONS.maxReconnectAttempts,
      initialReconnectBackoffMs:
        options.initialReconnectBackoffMs ?? DEFAULT_OPTIONS.initialReconnectBackoffMs,
      autoLeaveEmpty: options.autoLeaveEmpty ?? DEFAULT_OPTIONS.autoLeaveEmpty,
      autoLeaveEnd: options.autoLeaveEnd ?? DEFAULT_OPTIONS.autoLeaveEnd,
    };
  }

  get isConnected(): boolean {
    return (
      this.connection !== null &&
      this.connection.state.status !== VoiceConnectionStatus.Destroyed &&
      this.connection.state.status !== VoiceConnectionStatus.Disconnected
    );
  }

  get isIdleTimerActive(): boolean {
    return this.idleTimer !== null;
  }

  get currentIdleReason(): 'EMPTY_QUEUE' | 'EMPTY_CHANNEL' | null {
    return this.idleReason;
  }

  getConnection(): VoiceConnection | null {
    return this.connection;
  }

  /**
   * Joins a voice channel and configures connection lifecycle events and automatic recovery.
   */
  async join(joinOptions: JoinVoiceOptions): Promise<VoiceConnection> {
    const existing = getVoiceConnection(this.guildId);
    if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
      this.connection = existing;
      this.setupConnectionListeners(existing);
      return existing;
    }

    const connection = joinVoiceChannel({
      channelId: joinOptions.channelId,
      guildId: this.guildId,
      adapterCreator: joinOptions.adapterCreator,
      selfDeaf: joinOptions.selfDeaf ?? true,
      selfMute: joinOptions.selfMute ?? false,
    });

    this.connection = connection;
    this.setupConnectionListeners(connection);

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
      this.reconnectAttempts = 0;
      this.emit('connected', connection);
      return connection;
    } catch (error) {
      connection.destroy();
      this.connection = null;
      throw error;
    }
  }

  /**
   * Directly assigns an existing voice connection (useful for unit testing or injection).
   */
  setConnection(connection: VoiceConnection | null): void {
    this.connection = connection;
    if (connection) {
      this.setupConnectionListeners(connection);
    }
  }

  /**
   * Binds a GuildQueue to the voice lifecycle so idle timeouts trigger on queue end
   * and are automatically cancelled when a new track starts.
   */
  bindQueue(queue: GuildQueue): void {
    this.boundQueue = queue;

    queue.on('trackStart', () => {
      if (this.idleReason === 'EMPTY_QUEUE') {
        this.cancelIdleTimer('Track started playback');
      }
    });

    queue.on('queueEnd', () => {
      if (this.options.autoLeaveEnd) {
        this.startIdleTimer('EMPTY_QUEUE');
      }
    });
  }

  /**
   * Starts the 3-minute idle auto-disconnect timer.
   */
  startIdleTimer(reason: 'EMPTY_QUEUE' | 'EMPTY_CHANNEL'): void {
    if (this.idleTimer && this.idleReason === reason) {
      return; // Already running with same reason
    }

    this.cancelIdleTimer('Overwriting or resetting timer');
    this.idleReason = reason;

    this.idleTimer = setTimeout(() => {
      this.handleIdleTimeout();
    }, this.options.idleTimeoutMs);

    this.emit('idleTimerStarted', reason, this.options.idleTimeoutMs);
  }

  /**
   * Cancels any active idle countdown timer.
   */
  cancelIdleTimer(reason = 'Action performed'): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
      const previousReason = this.idleReason;
      this.idleReason = null;
      this.emit('idleTimerCancelled', `${reason} (was: ${previousReason ?? 'none'})`);
    }
  }

  /**
   * Invoked when channel membership updates to detect empty voice channels.
   */
  onMemberCountChanged(nonBotMemberCount: number): void {
    if (!this.options.autoLeaveEmpty) return;

    if (nonBotMemberCount <= 0) {
      this.startIdleTimer('EMPTY_CHANNEL');
    } else if (this.idleReason === 'EMPTY_CHANNEL') {
      this.cancelIdleTimer('Non-bot member joined voice channel');
    }
  }

  /**
   * Gracefully disconnects and destroys the voice connection.
   */
  disconnect(reason: DisconnectReason = 'MANUAL'): void {
    this.cancelIdleTimer('Voice connection disconnected');

    if (this.connection) {
      try {
        if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
          this.connection.destroy();
        }
      } catch {
        // Ignore errors during destroy
      }
      this.connection = null;
    }

    if (this.boundQueue) {
      this.boundQueue.destroy();
    }

    this.emit('disconnected', reason);
  }

  // --- Internal Connection Handlers ---

  private setupConnectionListeners(connection: VoiceConnection): void {
    connection.on('stateChange', async (oldState, newState) => {
      if (newState.status === VoiceConnectionStatus.Ready) {
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.emit('connected', connection);
      } else if (newState.status === VoiceConnectionStatus.Disconnected) {
        if (this.isReconnecting) return;

        // Try fast recovery first
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
          // Seems to be reconnecting to a new channel
        } catch {
          // Cannot fast recover; execute backoff retry loop
          await this.attemptReconnection(connection);
        }
      } else if (newState.status === VoiceConnectionStatus.Destroyed) {
        this.connection = null;
        this.cancelIdleTimer('Voice connection destroyed');
        this.emit('disconnected', 'MANUAL');
      }
    });

    connection.on('error', (err) => {
      this.emit('error', err);
    });
  }

  private async attemptReconnection(connection: VoiceConnection): Promise<void> {
    this.isReconnecting = true;

    while (this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delayMs = Math.round(
        this.options.initialReconnectBackoffMs * Math.pow(1.5, this.reconnectAttempts - 1),
      );

      this.emit('reconnecting', this.reconnectAttempts, this.options.maxReconnectAttempts, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      try {
        if (connection.state.status === VoiceConnectionStatus.Destroyed) {
          break;
        }

        connection.rejoin();
        await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        return;
      } catch {
        // Continue to next backoff attempt
      }
    }

    // Reconnection failed
    this.isReconnecting = false;
    this.emit('autoDisconnect', 'RECONNECT_FAILED');
    this.disconnect('RECONNECT_FAILED');
  }

  private handleIdleTimeout(): void {
    const reason = this.idleReason ?? 'EMPTY_QUEUE';
    this.idleTimer = null;
    this.idleReason = null;

    this.emit('autoDisconnect', reason);
    this.disconnect(reason);
  }

  // Typed EventEmitter overrides
  override on<E extends keyof VoiceLifecycleEvents>(
    event: E,
    listener: VoiceLifecycleEvents[E],
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override once<E extends keyof VoiceLifecycleEvents>(
    event: E,
    listener: VoiceLifecycleEvents[E],
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  override emit<E extends keyof VoiceLifecycleEvents>(
    event: E,
    ...args: Parameters<VoiceLifecycleEvents[E]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
