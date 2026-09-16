import { z } from 'zod';
import type { SafeTool, ToolExecutionContext } from '../types.js';

export const EconomyBalanceArgsSchema = z.object({
  targetUserId: z.string().optional(),
});

export type EconomyBalanceArgs = z.infer<typeof EconomyBalanceArgsSchema>;

export interface EconomyBalanceResult {
  targetUserId: string;
  wallet: number;
  bank: number;
  netWorth: number;
  message: string;
}

export class EconomyBalanceTool implements SafeTool<EconomyBalanceArgs, EconomyBalanceResult> {
  readonly definition = {
    name: 'economy.check_balance',
    description: 'Checks the wallet and bank balance for the interacting user or a mentioned user.',
    parameters: {
      type: 'object',
      properties: {
        targetUserId: {
          type: 'string',
          description: 'Optional target Discord user ID. Defaults to the calling user.',
        },
      },
    },
  };

  readonly schema = EconomyBalanceArgsSchema;
  readonly moduleName = 'economy';

  async execute(args: EconomyBalanceArgs, context: ToolExecutionContext): Promise<EconomyBalanceResult> {
    const targetUserId = args.targetUserId || context.userId;

    return {
      targetUserId,
      wallet: 0,
      bank: 0,
      netWorth: 0,
      message: `Balance lookup prepared for user ${targetUserId}.`,
    };
  }
}
