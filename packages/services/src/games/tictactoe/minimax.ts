import type { TttBoard, TttWinningLine, TttWinCheckResult } from './types.js';

export const WINNING_LINES: readonly TttWinningLine[] = [
  // Rows
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  // Columns
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  // Diagonals
  [0, 4, 8],
  [2, 4, 6],
] as const;

/**
 * Checks whether the current board has a winner, a tie, or is still in progress.
 */
export function checkWinner(board: TttBoard): TttWinCheckResult {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    const mark = board[a];
    if (mark !== null && mark !== undefined && mark === board[b] && mark === board[c]) {
      return { winner: mark, winningLine: line };
    }
  }

  if (board.every((cell) => cell !== null)) {
    return { winner: 'TIE' };
  }

  return { winner: null };
}

/**
 * Returns an array of indices corresponding to empty cells on the board (0..8).
 */
export function getAvailableMoves(board: TttBoard): number[] {
  const moves: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      moves.push(i);
    }
  }
  return moves;
}

/**
 * Minimax recursive decision tree evaluation with alpha-beta pruning.
 * Guarantees an unbeatable AI play:
 * - Maximizes AI score (+10 - depth for faster win)
 * - Minimizes opponent score (depth - 10 to delay defeat)
 * - Returns 0 for ties
 */
export function minimax(
  board: TttBoard,
  depth: number,
  isMaximizing: boolean,
  aiMark: 'X' | 'O',
  humanMark: 'X' | 'O',
  alpha = -Infinity,
  beta = Infinity,
): { score: number; move?: number } {
  const result = checkWinner(board);
  if (result.winner === aiMark) {
    return { score: 10 - depth };
  }
  if (result.winner === humanMark) {
    return { score: depth - 10 };
  }
  if (result.winner === 'TIE') {
    return { score: 0 };
  }

  const availableMoves = getAvailableMoves(board);

  if (isMaximizing) {
    let maxScore = -Infinity;
    let bestMove = availableMoves[0] ?? 0;

    for (const move of availableMoves) {
      board[move] = aiMark;
      const evalResult = minimax(board, depth + 1, false, aiMark, humanMark, alpha, beta);
      board[move] = null;

      if (evalResult.score > maxScore) {
        maxScore = evalResult.score;
        bestMove = move;
      }
      alpha = Math.max(alpha, evalResult.score);
      if (beta <= alpha) {
        break; // Alpha-beta cutoff
      }
    }

    return { score: maxScore, move: bestMove };
  } else {
    let minScore = Infinity;
    let bestMove = availableMoves[0] ?? 0;

    for (const move of availableMoves) {
      board[move] = humanMark;
      const evalResult = minimax(board, depth + 1, true, aiMark, humanMark, alpha, beta);
      board[move] = null;

      if (evalResult.score < minScore) {
        minScore = evalResult.score;
        bestMove = move;
      }
      beta = Math.min(beta, evalResult.score);
      if (beta <= alpha) {
        break; // Alpha-beta cutoff
      }
    }

    return { score: minScore, move: bestMove };
  }
}

/**
 * Computes the optimal unbeatable move for the AI.
 */
export function getBestMove(board: TttBoard, aiMark: 'X' | 'O'): number {
  const humanMark: 'X' | 'O' = aiMark === 'X' ? 'O' : 'X';
  const availableMoves = getAvailableMoves(board);
  if (availableMoves.length === 0) {
    throw new Error('No available moves on board');
  }

  // Fast-path opening: taking center on empty board is mathematically optimal
  if (availableMoves.length === 9) {
    return 4;
  }

  const result = minimax(board, 0, true, aiMark, humanMark);
  if (result.move === undefined || !availableMoves.includes(result.move)) {
    return availableMoves[0]!;
  }

  return result.move;
}
