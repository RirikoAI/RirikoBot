import { describe, it, expect } from 'vitest';
import { flipCoin } from '../quick-games/coin-flip.js';
import { rollDice, rollVsBot } from '../quick-games/dice.js';
import {
  generateHighLowInitial,
  evaluateHighLow,
} from '../quick-games/high-low.js';

describe('Quick Games Suite (TASK-0922)', () => {
  describe('Coin Flip', () => {
    it('returns deterministic heads when rng returns < 0.5', () => {
      const res = flipCoin({ rngFn: () => 0.2 });
      expect(res.side).toBe('heads');
    });

    it('returns deterministic tails when rng returns >= 0.5', () => {
      const res = flipCoin({ rngFn: () => 0.8 });
      expect(res.side).toBe('tails');
    });

    it('correctly evaluates win/lose based on player guess', () => {
      const winRes = flipCoin({ guess: 'heads', rngFn: () => 0.1 });
      expect(winRes.won).toBe(true);

      const loseRes = flipCoin({ guess: 'heads', rngFn: () => 0.9 });
      expect(loseRes.won).toBe(false);
    });
  });

  describe('Dice', () => {
    it('rolls single d6 with sum and roll list', () => {
      const res = rollDice({ rngFn: () => 0.5 }); // Math.floor(0.5 * 6) + 1 = 4
      expect(res.count).toBe(1);
      expect(res.sides).toBe(6);
      expect(res.rolls).toEqual([4]);
      expect(res.total).toBe(4);
    });

    it('rolls multiple dice within bounds', () => {
      let step = 0;
      const res = rollDice({
        count: 3,
        sides: 6,
        rngFn: () => {
          step++;
          return (step % 6) / 6;
        },
      });
      expect(res.rolls.length).toBe(3);
      expect(res.total).toBe(res.rolls.reduce((a, b) => a + b, 0));
    });

    it('evaluates rollVsBot outcomes correctly', () => {
      // Player: 0.9 -> 6, Bot: 0.1 -> 1
      let toggle = false;
      const winRes = rollVsBot({
        rngFn: () => {
          toggle = !toggle;
          return toggle ? 0.9 : 0.1;
        },
      });
      expect(winRes.outcome).toBe('WIN');

      // Tie
      const tieRes = rollVsBot({ rngFn: () => 0.5 });
      expect(tieRes.outcome).toBe('TIE');
    });
  });

  describe('HighLow', () => {
    it('generates initial number between 1 and 100', () => {
      const res = generateHighLowInitial(() => 0.49); // 50
      expect(res.currentNumber).toBe(50);
    });

    it('evaluates higher guess correctly', () => {
      const win = evaluateHighLow({
        currentNumber: 50,
        guess: 'higher',
        rngFn: () => 0.79, // 80
      });
      expect(win.outcome).toBe('WIN');
      expect(win.nextNumber).toBe(80);

      const lose = evaluateHighLow({
        currentNumber: 50,
        guess: 'higher',
        rngFn: () => 0.19, // 20
      });
      expect(lose.outcome).toBe('LOSE');
      expect(lose.nextNumber).toBe(20);
    });

    it('evaluates lower guess correctly', () => {
      const win = evaluateHighLow({
        currentNumber: 50,
        guess: 'lower',
        rngFn: () => 0.19, // 20
      });
      expect(win.outcome).toBe('WIN');

      const tie = evaluateHighLow({
        currentNumber: 50,
        guess: 'lower',
        rngFn: () => 0.49, // 50
      });
      expect(tie.outcome).toBe('TIE');
    });
  });
});
