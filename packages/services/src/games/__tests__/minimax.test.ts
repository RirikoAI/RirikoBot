import { describe, it, expect } from 'vitest';
import {
  checkWinner,
  getAvailableMoves,
  getBestMove,
} from '../tictactoe/minimax.js';
import type { TttBoard } from '../tictactoe/types.js';

describe('Minimax Algorithm & Tic-Tac-Toe Decision Tree (TASK-0921)', () => {
  it('identifies winning rows, columns, diagonals and ties accurately', () => {
    // Row win
    const rowWinBoard: TttBoard = [
      'X', 'X', 'X',
      'O', 'O', null,
      null, null, null,
    ];
    const rowResult = checkWinner(rowWinBoard);
    expect(rowResult.winner).toBe('X');
    expect(rowResult.winningLine).toEqual([0, 1, 2]);

    // Column win
    const colWinBoard: TttBoard = [
      'O', 'X', null,
      'O', 'X', null,
      'O', null, null,
    ];
    const colResult = checkWinner(colWinBoard);
    expect(colResult.winner).toBe('O');
    expect(colResult.winningLine).toEqual([0, 3, 6]);

    // Diagonal win
    const diagWinBoard: TttBoard = [
      'X', 'O', null,
      'O', 'X', null,
      null, null, 'X',
    ];
    const diagResult = checkWinner(diagWinBoard);
    expect(diagResult.winner).toBe('X');
    expect(diagResult.winningLine).toEqual([0, 4, 8]);

    // Tie board
    const tieBoard: TttBoard = [
      'X', 'O', 'X',
      'X', 'O', 'O',
      'O', 'X', 'X',
    ];
    const tieResult = checkWinner(tieBoard);
    expect(tieResult.winner).toBe('TIE');
    expect(tieResult.winningLine).toBeUndefined();

    // In-progress board
    const inProgressBoard: TttBoard = [
      'X', null, null,
      null, 'O', null,
      null, null, null,
    ];
    const inProgressResult = checkWinner(inProgressBoard);
    expect(inProgressResult.winner).toBeNull();
  });

  it('correctly returns available open cells on board', () => {
    const board: TttBoard = [
      'X', null, 'O',
      null, 'X', null,
      'O', null, null,
    ];
    expect(getAvailableMoves(board)).toEqual([1, 3, 5, 7, 8]);
  });

  it('chooses the immediate winning move when one is available', () => {
    // Board where AI ('O') can win at cell 2
    const board: TttBoard = [
      'O', 'O', null,
      'X', 'X', null,
      null, null, null,
    ];
    const bestMove = getBestMove(board, 'O');
    expect(bestMove).toBe(2);
  });

  it('blocks the opponent from winning on the immediate next move', () => {
    // Board where human ('X') threatens to win at cell 2
    const board: TttBoard = [
      'X', 'X', null,
      'O', null, null,
      null, null, null,
    ];
    const bestMove = getBestMove(board, 'O');
    expect(bestMove).toBe(2);
  });

  it('blocks diagonal winning threats', () => {
    // Human ('X') threatens at cell 8
    const board: TttBoard = [
      'X', null, null,
      null, 'X', null,
      'O', null, null,
    ];
    const bestMove = getBestMove(board, 'O');
    expect(bestMove).toBe(8);
  });

  it('selects center cell 4 on an empty board', () => {
    const emptyBoard: TttBoard = [
      null, null, null,
      null, null, null,
      null, null, null,
    ];
    expect(getBestMove(emptyBoard, 'X')).toBe(4);
  });

  it('never loses when playing Minimax AI against Minimax AI (always ties)', () => {
    const board: TttBoard = [
      null, null, null,
      null, null, null,
      null, null, null,
    ];

    let currentTurn: 'X' | 'O' = 'X';
    let moveCount = 0;

    while (checkWinner(board).winner === null && moveCount < 9) {
      const move = getBestMove(board, currentTurn);
      board[move] = currentTurn;
      currentTurn = currentTurn === 'X' ? 'O' : 'X';
      moveCount++;
    }

    const finalResult = checkWinner(board);
    expect(finalResult.winner).toBe('TIE');
  });

  it('never loses against random pseudo-human moves (AI either wins or ties)', () => {
    // Simple deterministic pseudo-random generator
    let seed = 42;
    function deterministicRng(): number {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    const GAMES_TO_TEST = 30;

    for (let g = 0; g < GAMES_TO_TEST; g++) {
      const board: TttBoard = [
        null, null, null,
        null, null, null,
        null, null, null,
      ];

      const aiMark: 'X' | 'O' = g % 2 === 0 ? 'X' : 'O';
      const humanMark: 'X' | 'O' = aiMark === 'X' ? 'O' : 'X';
      let currentTurn: 'X' | 'O' = 'X';

      while (checkWinner(board).winner === null) {
        if (currentTurn === aiMark) {
          const move = getBestMove(board, aiMark);
          board[move] = aiMark;
        } else {
          // Suboptimal random human player
          const openMoves = getAvailableMoves(board);
          if (openMoves.length === 0) break;
          const randomIdx = Math.floor(deterministicRng() * openMoves.length);
          board[openMoves[randomIdx]!] = humanMark;
        }
        currentTurn = currentTurn === 'X' ? 'O' : 'X';
      }

      const outcome = checkWinner(board);
      // AI must NEVER lose to any player
      expect(outcome.winner).not.toBe(humanMark);
      expect(['X', 'O', 'TIE']).toContain(outcome.winner);
    }
  });
});
