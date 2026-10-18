import { describe, it, expect, beforeEach } from 'vitest';
import { MiniGameSessionManager } from '../session-manager.js';
import { TicTacToeEngine } from '../tictactoe/engine.js';
import type { Player } from '../types.js';

describe('TicTacToeEngine (TASK-0921)', () => {
  let sessionManager: MiniGameSessionManager;
  let engine: TicTacToeEngine;

  const player1: Player = { id: 'user-1', username: 'Alice' };
  const player2: Player = { id: 'user-2', username: 'Bob' };
  const aiPlayer: Player = { id: 'ririko-ai', username: 'Ririko', isAi: true };

  beforeEach(() => {
    sessionManager = new MiniGameSessionManager();
    engine = new TicTacToeEngine(sessionManager);
  });

  it('initializes a PvP game with an empty board and correct starting turn', () => {
    const session = engine.createGame({
      guildId: 'guild-1',
      channelId: 'channel-1',
      player1,
      player2,
      wagerAmount: 50,
    });

    expect(session.state).toBe('IN_PROGRESS');
    expect(session.type).toBe('TICTACTOE');
    expect(session.currentTurnPlayerId).toBe(player1.id);
    expect(session.metadata.board).toEqual(Array(9).fill(null));
    expect(session.metadata.playerXId).toBe(player1.id);
    expect(session.metadata.playerOId).toBe(player2.id);
    expect(session.wager).toEqual({ amount: 50, escrowed: false });
  });

  it('alternates turns between players in PvP', () => {
    const session = engine.createGame({
      guildId: 'guild-1',
      channelId: 'channel-1',
      player1,
      player2,
    });

    // Player 1 plays X at cell 0
    const res1 = engine.makeMove(session.id, player1.id, 0);
    expect(res1.session.metadata.board[0]).toBe('X');
    expect(res1.session.currentTurnPlayerId).toBe(player2.id);

    // Player 2 plays O at cell 4
    const res2 = engine.makeMove(session.id, player2.id, 4);
    expect(res2.session.metadata.board[4]).toBe('O');
    expect(res2.session.currentTurnPlayerId).toBe(player1.id);
  });

  it('rejects moves if not the player turn, if cell occupied, or invalid index', () => {
    const session = engine.createGame({
      guildId: 'guild-1',
      channelId: 'channel-1',
      player1,
      player2,
    });

    // Player 2 attempts to move first (wrong turn)
    expect(() => engine.makeMove(session.id, player2.id, 0)).toThrow(/not player user-2's turn/);

    // Player 1 moves to 0
    engine.makeMove(session.id, player1.id, 0);

    // Player 2 attempts to move to cell 0 (occupied)
    expect(() => engine.makeMove(session.id, player2.id, 0)).toThrow(/already occupied/);

    // Player 2 attempts invalid index
    expect(() => engine.makeMove(session.id, player2.id, 9)).toThrow(/Invalid cell index/);
  });

  it('detects a PvP win and concludes the session', () => {
    const session = engine.createGame({
      guildId: 'guild-1',
      channelId: 'channel-1',
      player1,
      player2,
    });

    // Alice: 0, Bob: 3, Alice: 1, Bob: 4, Alice: 2 (Row 0 win)
    engine.makeMove(session.id, player1.id, 0);
    engine.makeMove(session.id, player2.id, 3);
    engine.makeMove(session.id, player1.id, 1);
    engine.makeMove(session.id, player2.id, 4);
    const winResult = engine.makeMove(session.id, player1.id, 2);

    expect(winResult.session.state).toBe('COMPLETED');
    expect(winResult.session.winnerId).toBe(player1.id);
    expect(winResult.session.metadata.winningLine).toEqual([0, 1, 2]);
  });

  it('automatically triggers Minimax AI move when playing against AI', () => {
    const session = engine.createGame({
      guildId: 'guild-1',
      channelId: 'channel-1',
      player1,
      player2: aiPlayer,
    });

    // Alice moves to corner 0
    const res = engine.makeMove(session.id, player1.id, 0);

    // AI countermove should have executed
    expect(res.aiMove).toBeDefined();
    expect(typeof res.aiMove?.cell).toBe('number');
    expect(res.session.metadata.board[res.aiMove!.cell]).toBe('O');

    // Turn should be back to Alice
    expect(res.session.currentTurnPlayerId).toBe(player1.id);
  });

  it('allows forfeiting a game or ending via timeout', () => {
    const session = engine.createGame({
      guildId: 'guild-1',
      channelId: 'channel-1',
      player1,
      player2,
    });

    const forfeited = engine.forfeitGame(session.id, player1.id, 'FORFEIT');
    expect(forfeited.state).toBe('COMPLETED');
    expect(forfeited.winnerId).toBe(player2.id);
  });
});
