export type HighLowGuess = 'higher' | 'lower';
export type HighLowOutcome = 'WIN' | 'LOSE' | 'TIE';

export interface HighLowInitialResult {
  currentNumber: number;
}

export interface HighLowEvaluateOptions {
  currentNumber: number;
  guess: HighLowGuess;
  wager?: number | undefined;
  rngFn?: (() => number) | undefined;
}

export interface HighLowEvaluateResult {
  currentNumber: number;
  nextNumber: number;
  guess: HighLowGuess;
  outcome: HighLowOutcome;
  wager?: number | undefined;
}

/**
 * Generates an initial random number between 1 and 100 for HighLow.
 */
export function generateHighLowInitial(rngFn?: () => number): HighLowInitialResult {
  const rng = rngFn ?? Math.random;
  const currentNumber = Math.floor(rng() * 100) + 1;
  return { currentNumber };
}

/**
 * Evaluates whether the next random number satisfies the player's guess.
 */
export function evaluateHighLow(options: HighLowEvaluateOptions): HighLowEvaluateResult {
  const rng = options.rngFn ?? Math.random;
  const nextNumber = Math.floor(rng() * 100) + 1;

  let outcome: HighLowOutcome;
  if (nextNumber === options.currentNumber) {
    outcome = 'TIE';
  } else if (
    (options.guess === 'higher' && nextNumber > options.currentNumber) ||
    (options.guess === 'lower' && nextNumber < options.currentNumber)
  ) {
    outcome = 'WIN';
  } else {
    outcome = 'LOSE';
  }

  return {
    currentNumber: options.currentNumber,
    nextNumber,
    guess: options.guess,
    outcome,
    wager: options.wager,
  };
}
