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

export type EconomyBalanceResolver = (
  userId: string,
) => Promise<{ wallet: number; bank: number; netWorth: number } | null>;

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

  constructor(private readonly balanceResolver?: EconomyBalanceResolver) {}

  async execute(args: EconomyBalanceArgs, context: ToolExecutionContext): Promise<EconomyBalanceResult> {
    const targetUserId = args.targetUserId || context.userId;

    let balance: { wallet: number; bank: number; netWorth: number } | null = null;
    if (context.getBalance) {
      balance = await context.getBalance(targetUserId).catch(() => null);
    } else if (this.balanceResolver) {
      balance = await this.balanceResolver(targetUserId).catch(() => null);
    }

    if (balance) {
      return {
        targetUserId,
        wallet: balance.wallet,
        bank: balance.bank,
        netWorth: balance.netWorth,
        message: `User ${targetUserId} has ${balance.wallet.toLocaleString()} credits in wallet and ${balance.bank.toLocaleString()} credits in bank. Total net worth is ${balance.netWorth.toLocaleString()} credits.`,
      };
    }

    return {
      targetUserId,
      wallet: 0,
      bank: 0,
      netWorth: 0,
      message: `User ${targetUserId} currently has 0 credits in wallet and 0 credits in bank.`,
    };
  }
}
