import type { MiniGameSessionManager } from '../session-manager.js';
import type { GameSession, Player } from '../types.js';
import type { RpsChoice, RpsMetadata, RpsOutcome } from './types.js';

export const RPS_CHOICES: readonly RpsChoice[] = ['ROCK', 'PAPER', 'SCISSORS'] as const;

export interface CreateRpsOptions {
  guildId: string;
  channelId: string;
  player1: Player;
  player2: Player;
  wagerAmount?: number | undefined;
  rngFn?: (() => number) | undefined;
}

export interface RpsSubmitResult {
  session: GameSession<RpsMetadata>;
  bothSubmitted: boolean;
  outcome?: RpsOutcome | undefined;
}

export class RpsEngine {
  private readonly rngFn: () => number;

  constructor(
    private readonly sessionManager: MiniGameSessionManager,
    options?: { rngFn?: () => number },
  ) {
    this.rngFn = options?.rngFn ?? Math.random;
  }

  /**
   * Pure outcome evaluator comparing choice1 (player 1) against choice2 (player 2).
   */
  public evaluateOutcome(choice1: RpsChoice, choice2: RpsChoice): RpsOutcome {
    if (choice1 === choice2) {
      return 'TIE';
    }

    if (
      (choice1 === 'ROCK' && choice2 === 'SCISSORS') ||
      (choice1 === 'SCISSORS' && choice2 === 'PAPER') ||
      (choice1 === 'PAPER' && choice2 === 'ROCK')
    ) {
      return 'PLAYER1_WIN';
    }

    return 'PLAYER2_WIN';
  }

  /**
   * Picks a random RPS choice (deterministic if custom rngFn provided).
   */
  public getRandomChoice(customRng?: () => number): RpsChoice {
    const fn = customRng ?? this.rngFn;
    const index = Math.floor(fn() * RPS_CHOICES.length);
    return RPS_CHOICES[index] ?? 'ROCK';
  }

  /**
   * Initializes a new Rock-Paper-Scissors game session.
   * If an opponent is AI, the AI's choice is generated and stored secretly right away.
   */
  public createGame(options: CreateRpsOptions): GameSession<RpsMetadata> {
    const player1Id = options.player1.id;
    const player2Id = options.player2.id;
    const submissions: Record<string, RpsChoice> = {};

    // If opponent is AI, pre-generate secret AI choice
    if (options.player2.isAi) {
      submissions[player2Id] = this.getRandomChoice(options.rngFn);
    }

    const metadata: RpsMetadata = {
      player1Id,
      player2Id,
      submissions,
      revealed: false,
    };

    return this.sessionManager.createSession<RpsMetadata>({
      type: 'RPS',
      guildId: options.guildId,
      channelId: options.channelId,
      players: [options.player1, options.player2],
      wagerAmount: options.wagerAmount,
      metadata,
    });
  }

  /**
   * Submits a player's secret choice.
   * Choices remain hidden until both players submit.
   */
  public submitChoice(sessionId: string, playerId: string, choice: RpsChoice): RpsSubmitResult {
    const session = this.sessionManager.getSession<RpsMetadata>(sessionId);
    if (!session) {
      throw new Error(`RPS session ${sessionId} not found`);
    }

    if (session.state !== 'IN_PROGRESS') {
      throw new Error(`Game session is not in progress (current state: ${session.state})`);
    }

    const isParticipant = session.players.some((p) => p.id === playerId);
    if (!isParticipant) {
      throw new Error(`Player ${playerId} is not a participant in this game`);
    }

    const { metadata } = session;
    if (metadata.submissions[playerId]) {
      throw new Error(`Player ${playerId} has already submitted a choice`);
    }

    if (!RPS_CHOICES.includes(choice)) {
      throw new Error(`Invalid RPS choice: ${choice}`);
    }

    // 1. Record secret submission
    metadata.submissions[playerId] = choice;
    this.sessionManager.touchSession(sessionId);

    // 2. Check if both players have submitted
    const p1Choice = metadata.submissions[metadata.player1Id];
    const p2Choice = metadata.submissions[metadata.player2Id];

    if (p1Choice && p2Choice) {
      metadata.revealed = true;
      const outcome = this.evaluateOutcome(p1Choice, p2Choice);
      metadata.outcome = outcome;

      if (outcome === 'TIE') {
        this.sessionManager.endSession(
          session.id,
          'TIED',
          null,
          `Both players chose ${p1Choice}! It's a tie!`,
        );
      } else {
        const winnerId = outcome === 'PLAYER1_WIN' ? metadata.player1Id : metadata.player2Id;
        const loserId = outcome === 'PLAYER1_WIN' ? metadata.player2Id : metadata.player1Id;
        const winnerChoice = outcome === 'PLAYER1_WIN' ? p1Choice : p2Choice;
        const loserChoice = outcome === 'PLAYER1_WIN' ? p2Choice : p1Choice;

        this.sessionManager.endSession(
          session.id,
          'COMPLETED',
          winnerId,
          `${winnerChoice} beats ${loserChoice}! <@${winnerId}> wins against <@${loserId}>!`,
        );
      }

      return {
        session,
        bothSubmitted: true,
        outcome,
      };
    }

    return {
      session,
      bothSubmitted: false,
    };
  }

  /**
   * Forfeits game due to timeout. If one player submitted, the submitter wins.
   */
  public forfeitOnTimeout(sessionId: string, timedOutPlayerId: string): GameSession<RpsMetadata> {
    const session = this.sessionManager.getSession<RpsMetadata>(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const otherPlayer = session.players.find((p) => p.id !== timedOutPlayerId);
    const otherPlayerChoice = otherPlayer
      ? session.metadata.submissions[otherPlayer.id]
      : undefined;

    if (otherPlayer && otherPlayerChoice) {
      // The other player submitted in time, so they win by opponent timeout
      return this.sessionManager.endSession(
        sessionId,
        'TIMEOUT',
        otherPlayer.id,
        `<@${timedOutPlayerId}> timed out without choosing. <@${otherPlayer.id}> wins by forfeiture!`,
      );
    }

    // Neither submitted or both timed out
    return this.sessionManager.endSession(
      sessionId,
      'TIMEOUT',
      null,
      'Game timed out before both players made their choices.',
    );
  }
}
