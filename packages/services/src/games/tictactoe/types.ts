export type TttCell = 'X' | 'O' | null;

export type TttBoard = [
  TttCell,
  TttCell,
  TttCell,
  TttCell,
  TttCell,
  TttCell,
  TttCell,
  TttCell,
  TttCell,
];

export type TttWinningLine = [number, number, number];

export interface TttMove {
  player: 'X' | 'O';
  cell: number;
  timestamp: number;
}

export interface TttMetadata {
  board: TttBoard;
  playerXId: string;
  playerOId: string;
  winningLine?: TttWinningLine | undefined;
  moveHistory: TttMove[];
}

export interface TttWinCheckResult {
  winner: 'X' | 'O' | 'TIE' | null;
  winningLine?: TttWinningLine | undefined;
}
