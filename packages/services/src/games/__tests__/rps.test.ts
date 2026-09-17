import { describe, it, expect, beforeEach } from 'vitest';
import { MiniGameSessionManager } from '../session-manager.js';
import { RpsEngine } from '../rps/engine.js';
import type { Player } from '../types.js';

describe('RpsEngine & Secret Selection (TASK-0921)', () => {
  let sessionManager: MiniGameSessionManager;
  let engine: RpsEngine;

  const player1: Player = { id: 'alice-1', username: 'Alice' };
  const player2: Player = { id: 'bob-2', username: 'Bob' };
  const aiPlayer: Player = { id: 'ririko-ai', username: 'Ririko', isAi: true };

  beforeEach(() => {
    sessionManager = new MiniGameSessionManager();
    engine = new RpsEngine(sessionManager);
  });

  describe('Outcome Evaluation Matrix', () => {
    it('evaluates winning moves correctly for Player 1', () => {
      expect(engine.evaluateOutcome('ROCK', 'SCISSORS')).toBe('PLAYER1_WIN');
      expect(engine.evaluateOutcome('SCISSORS', 'PAPER')).toBe('PLAYER1_WIN');
      expect(engine.evaluateOutcome('PAPER', 'ROCK')).toBe('PLAYER1_WIN');
    });

    it('evaluates winning moves correctly for Player 2', () => {
      expect(engine.evaluateOutcome('SCISSORS', 'ROCK')).toBe('PLAYER2_WIN');
      expect(engine.evaluateOutcome('PAPER', 'SCISSORS')).toBe('PLAYER2_WIN');
      expect(engine.evaluateOutcome('ROCK', 'PAPER')).toBe('PLAYER2_WIN');
    });

    it('evaluates ties correctly', () => {
      expect(engine.evaluateOutcome('ROCK', 'ROCK')).toBe('TIE');
      expect(engine.evaluateOutcome('PAPER', 'PAPER')).toBe('TIE');
      expect(engine.evaluateOutcome('SCISSORS', 'SCISSORS')).toBe('TIE');
    });
  });

  describe('PvP Secret Choice & Reveal Lifecycle', () => {
    it('keeps submissions masked until both players submit', () => {
      const session = engine.createGame({
        guildId: 'guild-1',
        channelId: 'channel-1',
        player1,
        player2,
      });

      // Player 1 submits ROCK
      const sub1 = engine.submitChoice(session.id, player1.id, 'ROCK');
      expect(sub1.bothSubmitted).toBe(false);
      expect(sub1.session.metadata.revealed).toBe(false);
      expect(sub1.session.state).toBe('IN_PROGRESS');

      // Player 2 submits SCISSORS -> Both submitted, revealed!
      const sub2 = engine.submitChoice(session.id, player2.id, 'SCISSORS');
      expect(sub2.bothSubmitted).toBe(true);
      expect(sub2.session.metadata.revealed).toBe(true);
      expect(sub2.session.state).toBe('COMPLETED');
      expect(sub2.session.winnerId).toBe(player1.id);
      expect(sub2.outcome).toBe('PLAYER1_WIN');
    });

    it('detects a tie when both players choose identical choices', () => {
      const session = engine.createGame({
        guildId: 'guild-1',
        channelId: 'channel-1',
        player1,
        player2,
      });

      engine.submitChoice(session.id, player1.id, 'PAPER');
      const res = engine.submitChoice(session.id, player2.id, 'PAPER');

      expect(res.bothSubmitted).toBe(true);
      expect(res.session.state).toBe('TIED');
      expect(res.session.winnerId).toBeNull();
      expect(res.outcome).toBe('TIE');
    });

    it('rejects duplicate submissions from the same player', () => {
      const session = engine.createGame({
        guildId: 'guild-1',
        channelId: 'channel-1',
        player1,
        player2,
      });

      engine.submitChoice(session.id, player1.id, 'ROCK');
      expect(() => engine.submitChoice(session.id, player1.id, 'PAPER')).toThrow(
        /already submitted/,
      );
    });

    it('rejects submissions from non-participants', () => {
      const session = engine.createGame({
        guildId: 'guild-1',
        channelId: 'channel-1',
        player1,
        player2,
      });

      expect(() => engine.submitChoice(session.id, 'intruder-id', 'ROCK')).toThrow(
        /not a participant/,
      );
    });
  });

  describe('PvE (vs AI)', () => {
    it('pre-generates deterministic AI move and immediately reveals on player submission', () => {
      // Mock RNG that returns 0.9 (which maps to 'SCISSORS')
      const mockRng = () => 0.9;
      const deterministicEngine = new RpsEngine(sessionManager, { rngFn: mockRng });

      const session = deterministicEngine.createGame({
        guildId: 'guild-1',
        channelId: 'channel-1',
        player1,
        player2: aiPlayer,
        rngFn: mockRng,
      });

      // Alice submits ROCK
      const result = deterministicEngine.submitChoice(session.id, player1.id, 'ROCK');
      expect(result.bothSubmitted).toBe(true);
      expect(result.session.metadata.revealed).toBe(true);
      expect(result.session.metadata.submissions['alice-1']).toBe('ROCK');
      expect(result.session.metadata.submissions['ririko-ai']).toBe('SCISSORS');
      expect(result.session.state).toBe('COMPLETED');
      expect(result.session.winnerId).toBe('alice-1');
    });
  });

  describe('Timeout & Forfeiture', () => {
    it('awards win to submitter if the opponent timed out', () => {
      const session = engine.createGame({
        guildId: 'guild-1',
        channelId: 'channel-1',
        player1,
        player2,
      });

      // Alice submitted ROCK
      engine.submitChoice(session.id, player1.id, 'ROCK');

      // Bob timed out
      const timedOutSession = engine.forfeitOnTimeout(session.id, player2.id);
      expect(timedOutSession.state).toBe('TIMEOUT');
      expect(timedOutSession.winnerId).toBe(player1.id);
    });

    it('ends with no winner if timed out player was the only one or neither submitted', () => {
      const session = engine.createGame({
        guildId: 'guild-1',
        channelId: 'channel-1',
        player1,
        player2,
      });

      // Neither submitted
      const timedOutSession = engine.forfeitOnTimeout(session.id, player1.id);
      expect(timedOutSession.state).toBe('TIMEOUT');
      expect(timedOutSession.winnerId).toBeNull();
    });
  });
});
