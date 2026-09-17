export type GameType = 'TICTACTOE' | 'RPS' | 'HIGHLOW' | 'COINFLIP' | 'DICE';

export type GameState =
  | 'PENDING_OPPONENT'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'TIED'
  | 'TIMEOUT'
  | 'CANCELLED';

export interface Player {
  id: string;
  username: string;
  isAi?: boolean;
}

export interface WagerConfig {
  amount: number;
  escrowed: boolean;
}

export interface GameSession<TMetadata = Record<string, unknown>> {
  id: string;
  type: GameType;
  guildId: string;
  channelId: string;
  players: Player[];
  currentTurnPlayerId?: string | undefined;
  wager?: WagerConfig | undefined;
  state: GameState;
  winnerId?: string | null | undefined;
  resultSummary?: string | undefined;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  metadata: TMetadata;
}

export interface CreateSessionOptions<TMetadata = Record<string, unknown>> {
  id?: string | undefined;
  type: GameType;
  guildId: string;
  channelId: string;
  players: Player[];
  currentTurnPlayerId?: string | undefined;
  wagerAmount?: number | undefined;
  timeoutMs?: number | undefined;
  metadata: TMetadata;
}
