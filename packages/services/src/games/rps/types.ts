export type RpsChoice = 'ROCK' | 'PAPER' | 'SCISSORS';

export type RpsOutcome = 'PLAYER1_WIN' | 'PLAYER2_WIN' | 'TIE';

export interface RpsMetadata {
  player1Id: string;
  player2Id: string;
  submissions: Record<string, RpsChoice>;
  revealed: boolean;
  outcome?: RpsOutcome | undefined;
}
