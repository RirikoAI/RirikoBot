export interface RollDiceOptions {
  count?: number | undefined;
  sides?: number | undefined;
  rngFn?: (() => number) | undefined;
}

export interface RollDiceResult {
  rolls: number[];
  total: number;
  sides: number;
  count: number;
}

export interface DiceVsBotOptions {
  wager?: number | undefined;
  rngFn?: (() => number) | undefined;
}

export interface DiceVsBotResult {
  playerRoll: number;
  botRoll: number;
  outcome: 'WIN' | 'LOSE' | 'TIE';
  wager?: number | undefined;
}

/**
 * Rolls one or multiple dice with specified sides (default 1d6).
 */
export function rollDice(options?: RollDiceOptions): RollDiceResult {
  const count = Math.max(1, Math.min(10, options?.count ?? 1));
  const sides = Math.max(2, Math.min(100, options?.sides ?? 6));
  const rng = options?.rngFn ?? Math.random;

  const rolls: number[] = [];
  let total = 0;

  for (let i = 0; i < count; i++) {
    const val = Math.floor(rng() * sides) + 1;
    rolls.push(val);
    total += val;
  }

  return {
    rolls,
    total,
    sides,
    count,
  };
}

/**
 * Rolls 1d6 against Ririko bot for quick wagering.
 */
export function rollVsBot(options?: DiceVsBotOptions): DiceVsBotResult {
  const rng = options?.rngFn ?? Math.random;
  const playerRoll = Math.floor(rng() * 6) + 1;
  const botRoll = Math.floor(rng() * 6) + 1;

  let outcome: 'WIN' | 'LOSE' | 'TIE';
  if (playerRoll > botRoll) {
    outcome = 'WIN';
  } else if (playerRoll < botRoll) {
    outcome = 'LOSE';
  } else {
    outcome = 'TIE';
  }

  return {
    playerRoll,
    botRoll,
    outcome,
    wager: options?.wager,
  };
}
