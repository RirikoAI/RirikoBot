import { z } from 'zod';
import type { SafeTool, CoinFlipResult, ToolExecutionContext } from '../types.js';

export const CoinFlipArgsSchema = z.object({
  call: z.enum(['heads', 'tails']).optional(),
});

export type CoinFlipArgs = z.infer<typeof CoinFlipArgsSchema>;

export class CoinFlipTool implements SafeTool<CoinFlipArgs, CoinFlipResult> {
  readonly definition = {
    name: 'games.coinflip',
    description: 'Flips a two-sided coin (heads or tails) and optionally checks if the user predicted correctly.',
    parameters: {
      type: 'object',
      properties: {
        call: {
          type: 'string',
          enum: ['heads', 'tails'],
          description: 'Optional guess by the user: "heads" or "tails".',
        },
      },
    },
  };

  readonly schema = CoinFlipArgsSchema;
  readonly moduleName = 'games';

  private readonly rng: () => number;

  constructor(rng?: () => number) {
    this.rng = rng ?? Math.random;
  }

  async execute(args: CoinFlipArgs, _context: ToolExecutionContext): Promise<CoinFlipResult> {
    const isHeads = this.rng() < 0.5;
    const result: 'heads' | 'tails' = isHeads ? 'heads' : 'tails';

    if (args.call) {
      const won = args.call.toLowerCase() === result;
      return {
        result,
        won,
        message: won
          ? `The coin landed on ${result}! You guessed correctly!`
          : `The coin landed on ${result}! Better luck next time!`,
      };
    }

    return {
      result,
      message: `The coin landed on ${result}!`,
    };
  }
}
