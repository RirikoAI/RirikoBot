import type { MiniGameSessionManager } from '../session-manager.js';
import type { GameSession, Player } from '../types.js';
import type { TttBoard, TttMetadata } from './types.js';
import { checkWinner, getBestMove } from './minimax.js';

export interface CreateTttOptions {
  guildId: string;
  channelId: string;
  player1: Player;
  player2: Player;
  wagerAmount?: number | undefined;
  startingMark?: 'X' | 'O' | undefined;
}

export interface TttMoveResult {
  session: GameSession<TttMetadata>;
  aiMove?: { cell: number } | undefined;
}

export class TicTacToeEngine {
  constructor(private readonly sessionManager: MiniGameSessionManager) {}

  /**
   * Initializes a new Tic-Tac-Toe game session.
   */
  public createGame(options: CreateTttOptions): GameSession<TttMetadata> {
    const emptyBoard: TttBoard = [
      null, null, null,
      null, null, null,
      null, null, null,
    ];

    const playerXId = options.player1.id;
    const playerOId = options.player2.id;
    const startingPlayerId = options.startingMark === 'O' ? playerOId : playerXId;

    const metadata: TttMetadata = {
      board: emptyBoard,
      playerXId,
      playerOId,
      moveHistory: [],
    };

    const session = this.sessionManager.createSession<TttMetadata>({
      type: 'TICTACTOE',
      guildId: options.guildId,
      channelId: options.channelId,
      players: [options.player1, options.player2],
      currentTurnPlayerId: startingPlayerId,
      wagerAmount: options.wagerAmount,
      metadata,
    });

    // If AI starts as X, execute AI move immediately
    if (options.player1.isAi && session.currentTurnPlayerId === options.player1.id) {
      const bestMove = getBestMove(metadata.board, 'X');
      metadata.board[bestMove] = 'X';
      metadata.moveHistory.push({ player: 'X', cell: bestMove, timestamp: Date.now() });
      session.currentTurnPlayerId = playerOId;
      this.sessionManager.touchSession(session.id);
    }

    return session;
  }

  /**
   * Executes a player move and, if playing against AI, computes and applies the AI countermove.
   */
  public makeMove(
    sessionId: string,
    playerId: string,
    cellIndex: number,
  ): TttMoveResult {
    const session = this.sessionManager.getSession<TttMetadata>(sessionId);
    if (!session) {
      throw new Error(`Tic-Tac-Toe session ${sessionId} not found`);
    }

    if (session.state !== 'IN_PROGRESS') {
      throw new Error(`Game session is not in progress (current state: ${session.state})`);
    }

    if (session.currentTurnPlayerId !== playerId) {
      throw new Error(`It is not player ${playerId}'s turn`);
    }

    if (cellIndex < 0 || cellIndex > 8 || !Number.isInteger(cellIndex)) {
      throw new Error(`Invalid cell index: ${cellIndex}. Must be integer between 0 and 8.`);
    }

    const { metadata } = session;
    if (metadata.board[cellIndex] !== null) {
      throw new Error(`Cell ${cellIndex} is already occupied by ${metadata.board[cellIndex]}`);
    }

    const playerMark: 'X' | 'O' = playerId === metadata.playerXId ? 'X' : 'O';
    const opponentId = playerId === metadata.playerXId ? metadata.playerOId : metadata.playerXId;
    const opponentPlayer = session.players.find((p) => p.id === opponentId);

    // 1. Apply player move
    metadata.board[cellIndex] = playerMark;
    metadata.moveHistory.push({
      player: playerMark,
      cell: cellIndex,
      timestamp: Date.now(),
    });

    // 2. Check for win or tie after player move
    const resultAfterPlayer = checkWinner(metadata.board);

    if (resultAfterPlayer.winner === playerMark) {
      metadata.winningLine = resultAfterPlayer.winningLine;
      this.sessionManager.endSession(
        session.id,
        'COMPLETED',
        playerId,
        `Player ${playerMark} (${playerId}) won the game!`,
      );
      return { session };
    }

    if (resultAfterPlayer.winner === 'TIE') {
      this.sessionManager.endSession(
        session.id,
        'TIED',
        null,
        'The game ended in a tie!',
      );
      return { session };
    }

    // 3. Game continues: switch turn to opponent
    session.currentTurnPlayerId = opponentId;
    this.sessionManager.touchSession(session.id);

    // 4. If opponent is AI, execute unbeatable Minimax move
    let aiMove: { cell: number } | undefined;

    if (opponentPlayer?.isAi) {
      const aiMark: 'X' | 'O' = playerMark === 'X' ? 'O' : 'X';
      const bestAiMove = getBestMove(metadata.board, aiMark);

      metadata.board[bestAiMove] = aiMark;
      metadata.moveHistory.push({
        player: aiMark,
        cell: bestAiMove,
        timestamp: Date.now(),
      });
      aiMove = { cell: bestAiMove };

      const resultAfterAi = checkWinner(metadata.board);

      if (resultAfterAi.winner === aiMark) {
        metadata.winningLine = resultAfterAi.winningLine;
        this.sessionManager.endSession(
          session.id,
          'COMPLETED',
          opponentId,
          `AI (${aiMark}) won the game!`,
        );
      } else if (resultAfterAi.winner === 'TIE') {
        this.sessionManager.endSession(
          session.id,
          'TIED',
          null,
          'The game ended in a tie!',
        );
      } else {
        // Turn returns to player
        session.currentTurnPlayerId = playerId;
        this.sessionManager.touchSession(session.id);
      }
    }

    return { session, aiMove };
  }

  /**
   * Forfeits the game on behalf of a player or due to timeout.
   */
  public forfeitGame(
    sessionId: string,
    forfeitingPlayerId: string,
    reason: 'TIMEOUT' | 'FORFEIT' = 'FORFEIT',
  ): GameSession<TttMetadata> {
    const session = this.sessionManager.getSession<TttMetadata>(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const winner = session.players.find((p) => p.id !== forfeitingPlayerId);
    const finalState = reason === 'TIMEOUT' ? 'TIMEOUT' : 'COMPLETED';

    return this.sessionManager.endSession(
      sessionId,
      finalState,
      winner?.id ?? null,
      reason === 'TIMEOUT'
        ? `Player ${forfeitingPlayerId} timed out. ${winner?.username ?? 'Opponent'} wins!`
        : `Player ${forfeitingPlayerId} forfeited. ${winner?.username ?? 'Opponent'} wins!`,
    );
  }
}
