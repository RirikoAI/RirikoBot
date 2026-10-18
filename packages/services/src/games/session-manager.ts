import { randomUUID } from 'node:crypto';
import type { GameSession, CreateSessionOptions, GameState } from './types.js';

export interface SessionManagerOptions {
  defaultTimeoutMs?: number;
}

export type SessionTimeoutListener = (session: GameSession<any>) => void | Promise<void>;

/**
 * In-memory thread-safe Session Manager for interactive mini-games.
 * Enforces 1 active game session per user per channel to prevent duplicate game spam.
 */
export class MiniGameSessionManager {
  private readonly sessions = new Map<string, GameSession<any>>();
  private readonly userChannelIndex = new Map<string, string>(); // `${userId}:${channelId}` -> sessionId
  private readonly defaultTimeoutMs: number;
  private readonly timeoutListeners: SessionTimeoutListener[] = [];

  constructor(options?: SessionManagerOptions) {
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? 60_000; // 60s default
  }

  private makeUserChannelKey(userId: string, channelId: string): string {
    return `${userId}:${channelId}`;
  }

  /**
   * Registers a listener callback invoked when a session times out.
   */
  public onTimeout(listener: SessionTimeoutListener): () => void {
    this.timeoutListeners.push(listener);
    return () => {
      const idx = this.timeoutListeners.indexOf(listener);
      if (idx !== -1) {
        this.timeoutListeners.splice(idx, 1);
      }
    };
  }

  /**
   * Checks if any human player in the proposed list is already in an active session in the given channel.
   */
  public isPlayerActiveInChannel(userId: string, channelId: string): boolean {
    const key = this.makeUserChannelKey(userId, channelId);
    const existingSessionId = this.userChannelIndex.get(key);
    if (!existingSessionId) return false;

    const session = this.sessions.get(existingSessionId);
    if (!session) {
      this.userChannelIndex.delete(key);
      return false;
    }

    return session.state === 'PENDING_OPPONENT' || session.state === 'IN_PROGRESS';
  }

  /**
   * Creates and registers a new mini-game session.
   * Throws if any non-AI player is already active in this channel.
   */
  public createSession<TMetadata = Record<string, unknown>>(
    options: CreateSessionOptions<TMetadata>,
  ): GameSession<TMetadata> {
    // Concurrency guard
    for (const player of options.players) {
      if (!player.isAi && this.isPlayerActiveInChannel(player.id, options.channelId)) {
        throw new Error(
          `Player ${player.username} (${player.id}) already has an active game session in channel ${options.channelId}`,
        );
      }
    }

    const now = Date.now();
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const id = options.id ?? randomUUID();

    const session: GameSession<TMetadata> = {
      id,
      type: options.type,
      guildId: options.guildId,
      channelId: options.channelId,
      players: [...options.players],
      currentTurnPlayerId: options.currentTurnPlayerId,
      wager:
        options.wagerAmount && options.wagerAmount > 0
          ? { amount: options.wagerAmount, escrowed: false }
          : undefined,
      state: options.players.length >= 2 ? 'IN_PROGRESS' : 'PENDING_OPPONENT',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + timeoutMs,
      metadata: options.metadata,
    };

    this.sessions.set(id, session);

    for (const player of session.players) {
      if (!player.isAi) {
        this.userChannelIndex.set(this.makeUserChannelKey(player.id, session.channelId), id);
      }
    }

    return session;
  }

  /**
   * Retrieves an active session by ID.
   */
  public getSession<TMetadata = Record<string, unknown>>(
    sessionId: string,
  ): GameSession<TMetadata> | undefined {
    return this.sessions.get(sessionId) as GameSession<TMetadata> | undefined;
  }

  /**
   * Retrieves the active session for a specific user in a channel.
   */
  public getActiveSessionForUser<TMetadata = Record<string, unknown>>(
    userId: string,
    channelId: string,
  ): GameSession<TMetadata> | undefined {
    const key = this.makeUserChannelKey(userId, channelId);
    const sessionId = this.userChannelIndex.get(key);
    if (!sessionId) return undefined;
    return this.getSession<TMetadata>(sessionId);
  }

  /**
   * Resets the expiration timer for a session (e.g. after a valid move is made).
   */
  public touchSession(sessionId: string, additionalMs?: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const now = Date.now();
    session.updatedAt = now;
    session.expiresAt = now + (additionalMs ?? this.defaultTimeoutMs);
  }

  /**
   * Updates an existing session state and metadata.
   */
  public updateSession<TMetadata = Record<string, unknown>>(
    sessionId: string,
    updates: Partial<GameSession<TMetadata>>,
  ): GameSession<TMetadata> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const now = Date.now();
    Object.assign(session, updates, { updatedAt: now });

    // If session transitions to an end state, unbind from userChannelIndex
    if (this.isTerminalState(session.state)) {
      this.clearUserIndex(session);
    }

    return session as GameSession<TMetadata>;
  }

  /**
   * Ends a session cleanly.
   */
  public endSession<TMetadata = Record<string, unknown>>(
    sessionId: string,
    finalState: GameState,
    winnerId?: string | null,
    resultSummary?: string,
  ): GameSession<TMetadata> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.state = finalState;
    session.winnerId = winnerId;
    session.resultSummary = resultSummary;
    session.updatedAt = Date.now();

    this.clearUserIndex(session);
    return session as GameSession<TMetadata>;
  }

  /**
   * Removes a session completely from memory.
   */
  public deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.clearUserIndex(session);
    return this.sessions.delete(sessionId);
  }

  /**
   * Scans all sessions and handles timeouts.
   * Returns an array of sessions that were timed out during this sweep.
   */
  public async checkTimeouts(now = Date.now()): Promise<GameSession<any>[]> {
    const timedOut: GameSession<any>[] = [];

    for (const session of this.sessions.values()) {
      if (!this.isTerminalState(session.state) && session.expiresAt <= now) {
        session.state = 'TIMEOUT';
        session.updatedAt = now;
        this.clearUserIndex(session);
        timedOut.push(session);

        for (const listener of this.timeoutListeners) {
          try {
            await listener(session);
          } catch {
            // Listener error isolation
          }
        }
      }
    }

    return timedOut;
  }

  private isTerminalState(state: GameState): boolean {
    return (
      state === 'COMPLETED' || state === 'TIED' || state === 'TIMEOUT' || state === 'CANCELLED'
    );
  }

  private clearUserIndex(session: GameSession<any>): void {
    for (const player of session.players) {
      if (!player.isAi) {
        const key = this.makeUserChannelKey(player.id, session.channelId);
        if (this.userChannelIndex.get(key) === session.id) {
          this.userChannelIndex.delete(key);
        }
      }
    }
  }

  /**
   * Returns total count of all tracked sessions.
   */
  public getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Clears all sessions (useful in tests).
   */
  public clear(): void {
    this.sessions.clear();
    this.userChannelIndex.clear();
  }
}
