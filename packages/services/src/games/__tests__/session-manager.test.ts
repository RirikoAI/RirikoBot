import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiniGameSessionManager } from '../session-manager.js';
import type { Player } from '../types.js';

describe('MiniGameSessionManager (TASK-0921)', () => {
  let manager: MiniGameSessionManager;

  const player1: Player = { id: 'u1', username: 'UserOne' };
  const player2: Player = { id: 'u2', username: 'UserTwo' };
  const player3: Player = { id: 'u3', username: 'UserThree' };

  beforeEach(() => {
    manager = new MiniGameSessionManager({ defaultTimeoutMs: 5000 });
  });

  it('creates and retrieves active session by ID and by user/channel', () => {
    const session = manager.createSession({
      type: 'TICTACTOE',
      guildId: 'g1',
      channelId: 'c1',
      players: [player1, player2],
      metadata: { test: true },
    });

    expect(session.id).toBeDefined();
    expect(manager.getSession(session.id)).toBe(session);
    expect(manager.getActiveSessionForUser('u1', 'c1')).toBe(session);
    expect(manager.getActiveSessionForUser('u2', 'c1')).toBe(session);
    expect(manager.getActiveSessionForUser('u3', 'c1')).toBeUndefined();
  });

  it('blocks a player from starting a second active game in the same channel', () => {
    manager.createSession({
      type: 'TICTACTOE',
      guildId: 'g1',
      channelId: 'c1',
      players: [player1, player2],
      metadata: {},
    });

    // Attempting to create another session in c1 with player1 should throw
    expect(() =>
      manager.createSession({
        type: 'RPS',
        guildId: 'g1',
        channelId: 'c1',
        players: [player1, player3],
        metadata: {},
      }),
    ).toThrow(/already has an active game session/);

    // But creating in a different channel c2 is permitted
    expect(() =>
      manager.createSession({
        type: 'RPS',
        guildId: 'g1',
        channelId: 'c2',
        players: [player1, player3],
        metadata: {},
      }),
    ).not.toThrow();
  });

  it('allows players to start a new game after the previous game ends', () => {
    const session = manager.createSession({
      type: 'TICTACTOE',
      guildId: 'g1',
      channelId: 'c1',
      players: [player1, player2],
      metadata: {},
    });

    manager.endSession(session.id, 'COMPLETED', player1.id, 'UserOne won');

    expect(manager.isPlayerActiveInChannel('u1', 'c1')).toBe(false);

    expect(() =>
      manager.createSession({
        type: 'RPS',
        guildId: 'g1',
        channelId: 'c1',
        players: [player1, player2],
        metadata: {},
      }),
    ).not.toThrow();
  });

  it('identifies and triggers callbacks for timed-out sessions', async () => {
    const session = manager.createSession({
      type: 'TICTACTOE',
      guildId: 'g1',
      channelId: 'c1',
      players: [player1, player2],
      timeoutMs: 1000,
      metadata: {},
    });

    const listener = vi.fn();
    manager.onTimeout(listener);

    // Advance time beyond expiration
    const futureTime = session.expiresAt + 50;
    const timedOut = await manager.checkTimeouts(futureTime);

    expect(timedOut.length).toBe(1);
    expect(timedOut[0]?.id).toBe(session.id);
    expect(timedOut[0]?.state).toBe('TIMEOUT');
    expect(listener).toHaveBeenCalledWith(session);

    // Concurrency index should now be free
    expect(manager.isPlayerActiveInChannel('u1', 'c1')).toBe(false);
  });
});
