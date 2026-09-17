export type CoinSide = 'heads' | 'tails';

export interface CoinFlipOptions {
  guess?: CoinSide | undefined;
  wager?: number | undefined;
  rngFn?: (() => number) | undefined;
}

export interface CoinFlipResult {
  side: CoinSide;
  guess?: CoinSide | undefined;
  won?: boolean | undefined;
  wager?: number | undefined;
}

/**
 * Flips a coin (Heads / Tails) with deterministic RNG support.
 */
export function flipCoin(options?: CoinFlipOptions): CoinFlipResult {
  const rng = options?.rngFn ?? Math.random;
  const side: CoinSide = rng() < 0.5 ? 'heads' : 'tails';

  if (options?.guess) {
    const won = options.guess.toLowerCase() === side;
    return {
      side,
      guess: options.guess,
      won,
      wager: options.wager,
    };
  }

  return {
    side,
    wager: options?.wager,
  };
}
