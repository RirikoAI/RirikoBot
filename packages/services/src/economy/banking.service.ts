import type { EconomyRepository } from '@ririko/database';
import type {
  BankingOperationResult,
  TransferParams,
  TransferResult,
  InterestResult,
} from './types.js';

export interface BankingServiceOptions {
  repository: EconomyRepository;
  baseCapacity?: number | undefined;
  capacityPerLevel?: number | undefined;
  defaultInterestRatePercent?: number | undefined;
  maxDailyInterestCap?: number | undefined;
}

/**
 * Banking Service implementing Sections 4 and 5.1 of docs/economy.md:
 * - Deposit and Withdrawal with capacity scaling and negative-balance guardrails.
 * - Dynamic capacity scaling: Base 10,000 + (Level * 2,500) + Expansions.
 * - Deadlock-free peer-to-peer /pay transfers with deterministic resource ordering.
 * - Compound daily bank interest yield with configurable rates and caps.
 * - Anti-abuse: frozen accounts blocked from all banking and transfer operations.
 */
export class BankingService {
  private readonly repository: EconomyRepository;
  private readonly baseCapacity: number;
  private readonly capacityPerLevel: number;
  private readonly defaultInterestRatePercent: number;
  private readonly maxDailyInterestCap: number;

  constructor(options: BankingServiceOptions) {
    this.repository = options.repository;
    this.baseCapacity = options.baseCapacity ?? 10000;
    this.capacityPerLevel = options.capacityPerLevel ?? 2500;
    this.defaultInterestRatePercent = options.defaultInterestRatePercent ?? 0.5; // 0.5% per day
    this.maxDailyInterestCap = options.maxDailyInterestCap ?? 5000;
  }

  /**
   * Calculates maximum bank capacity based on player level and purchased expansions.
   * Formula: baseCapacity + (level * capacityPerLevel) + expansions
   */
  public calculateBankCapacity(level: number, expansions = 0): number {
    const validLevel = Math.max(0, Math.floor(level));
    const validExpansions = Math.max(0, Math.floor(expansions));
    return this.baseCapacity + validLevel * this.capacityPerLevel + validExpansions;
  }

  /**
   * Synchronizes and updates the user's bank capacity based on their current level and expansions.
   */
  public async syncBankCapacity(userId: string, level: number, expansions = 0): Promise<number> {
    const targetCapacity = this.calculateBankCapacity(level, expansions);
    const balance = await this.repository.getOrCreateBalance(userId, targetCapacity);

    if (Number(balance.bankCapacity) !== targetCapacity) {
      await this.repository.setBankCapacity(userId, targetCapacity);
    }

    return targetCapacity;
  }

  /**
   * Deposits credits from wallet into bank up to maximum capacity.
   * Supports specific numeric amounts or 'all'.
   */
  public async deposit(
    userId: string,
    amount: number | 'all',
    guildId?: string | undefined,
  ): Promise<BankingOperationResult> {
    // 1. Account freeze verification
    if (await this.repository.isAccountFrozen(userId)) {
      return {
        success: false,
        reason: 'ACCOUNT_FROZEN',
        amount: 0,
      };
    }

    const balance = await this.repository.getOrCreateBalance(userId);
    const currentWallet = Number(balance.walletBalance);
    const currentBank = Number(balance.bankBalance);
    const bankCapacity = Number(balance.bankCapacity);

    let depositAmount: number;

    if (amount === 'all') {
      const availableCapacity = Math.max(0, bankCapacity - currentBank);
      if (availableCapacity <= 0) {
        return {
          success: false,
          reason: 'BANK_FULL',
          amount: 0,
          walletBalance: currentWallet,
          bankBalance: currentBank,
          bankCapacity,
        };
      }

      depositAmount = Math.min(currentWallet, availableCapacity);
      if (depositAmount <= 0) {
        return {
          success: false,
          reason: 'NO_WALLET_FUNDS',
          amount: 0,
          walletBalance: currentWallet,
          bankBalance: currentBank,
          bankCapacity,
        };
      }
    } else {
      if (!Number.isInteger(amount) || amount <= 0) {
        return {
          success: false,
          reason: 'INVALID_AMOUNT',
          amount: 0,
          walletBalance: currentWallet,
          bankBalance: currentBank,
          bankCapacity,
        };
      }

      if (currentWallet < amount) {
        return {
          success: false,
          reason: 'INSUFFICIENT_WALLET_FUNDS',
          amount,
          walletBalance: currentWallet,
          bankBalance: currentBank,
          bankCapacity,
        };
      }

      if (currentBank + amount > bankCapacity) {
        return {
          success: false,
          reason: 'EXCEEDS_BANK_CAPACITY',
          amount,
          walletBalance: currentWallet,
          bankBalance: currentBank,
          bankCapacity,
        };
      }

      depositAmount = amount;
    }

    const result = await this.repository.modifyBalance({
      userId,
      guildId,
      walletDelta: -depositAmount,
      bankDelta: depositAmount,
      type: 'DEPOSIT',
      source: 'BANK_DEPOSIT',
    });

    return {
      success: true,
      amount: depositAmount,
      walletBalance: result.balance.walletBalance,
      bankBalance: result.balance.bankBalance,
      bankCapacity: result.balance.bankCapacity,
      netWorth: result.balance.netWorth,
      transactionId: result.transaction.id,
    };
  }

  /**
   * Withdraws credits from bank into wallet.
   * Supports specific numeric amounts or 'all'.
   */
  public async withdraw(
    userId: string,
    amount: number | 'all',
    guildId?: string | undefined,
  ): Promise<BankingOperationResult> {
    // 1. Account freeze verification
    if (await this.repository.isAccountFrozen(userId)) {
      return {
        success: false,
        reason: 'ACCOUNT_FROZEN',
        amount: 0,
      };
    }

    const balance = await this.repository.getOrCreateBalance(userId);
    const currentWallet = Number(balance.walletBalance);
    const currentBank = Number(balance.bankBalance);
    const bankCapacity = Number(balance.bankCapacity);

    let withdrawAmount: number;

    if (amount === 'all') {
      withdrawAmount = currentBank;
      if (withdrawAmount <= 0) {
        return {
          success: false,
          reason: 'NO_BANK_FUNDS',
          amount: 0,
          walletBalance: currentWallet,
          bankBalance: currentBank,
          bankCapacity,
        };
      }
    } else {
      if (!Number.isInteger(amount) || amount <= 0) {
        return {
          success: false,
          reason: 'INVALID_AMOUNT',
          amount: 0,
          walletBalance: currentWallet,
          bankBalance: currentBank,
          bankCapacity,
        };
      }

      if (currentBank < amount) {
        return {
          success: false,
          reason: 'INSUFFICIENT_BANK_FUNDS',
          amount,
          walletBalance: currentWallet,
          bankBalance: currentBank,
          bankCapacity,
        };
      }

      withdrawAmount = amount;
    }

    const result = await this.repository.modifyBalance({
      userId,
      guildId,
      walletDelta: withdrawAmount,
      bankDelta: -withdrawAmount,
      type: 'WITHDRAW',
      source: 'BANK_WITHDRAW',
    });

    return {
      success: true,
      amount: withdrawAmount,
      walletBalance: result.balance.walletBalance,
      bankBalance: result.balance.bankBalance,
      bankCapacity: result.balance.bankCapacity,
      netWorth: result.balance.netWorth,
      transactionId: result.transaction.id,
    };
  }

  /**
   * Transfers currency peer-to-peer (/pay) with deterministic deadlock-free locking,
   * freeze checks, and double-entry transaction auditing.
   */
  public async transfer(params: TransferParams): Promise<TransferResult> {
    const { fromUserId, toUserId, amount, guildId, reason } = params;

    // 1. Self-transfer validation
    if (fromUserId === toUserId) {
      return {
        success: false,
        reason: 'CANNOT_TRANSFER_TO_SELF',
        fromUserId,
        toUserId,
        amount,
      };
    }

    // 2. Amount validation
    if (!Number.isInteger(amount) || amount <= 0) {
      return {
        success: false,
        reason: 'INVALID_AMOUNT',
        fromUserId,
        toUserId,
        amount,
      };
    }

    // 3. Account freeze validation for both parties
    if (await this.repository.isAccountFrozen(fromUserId)) {
      return {
        success: false,
        reason: 'SENDER_ACCOUNT_FROZEN',
        fromUserId,
        toUserId,
        amount,
      };
    }

    if (await this.repository.isAccountFrozen(toUserId)) {
      return {
        success: false,
        reason: 'RECIPIENT_ACCOUNT_FROZEN',
        fromUserId,
        toUserId,
        amount,
      };
    }

    // 4. Sender wallet balance verification
    const senderBalance = await this.repository.getOrCreateBalance(fromUserId);
    if (Number(senderBalance.walletBalance) < amount) {
      return {
        success: false,
        reason: 'INSUFFICIENT_FUNDS',
        fromUserId,
        toUserId,
        amount,
        fromWalletBalance: senderBalance.walletBalance,
      };
    }

    // 5. Execute atomic transfer with double-entry accounting
    const result = await this.repository.transferBalance({
      fromUserId,
      toUserId,
      amount,
      guildId,
      source: 'PEER_TRANSFER',
      metadata: reason ? { reason } : undefined,
    });

    return {
      success: true,
      fromUserId,
      toUserId,
      amount,
      fromWalletBalance: result.fromBalance.walletBalance,
      toWalletBalance: result.toBalance.walletBalance,
      debitTransactionId: result.debitTransaction.id,
      creditTransactionId: result.creditTransaction.id,
    };
  }

  /**
   * Computes daily bank interest yield for a given bank balance.
   */
  public calculateDailyInterest(
    bankBalance: number,
    ratePercent?: number | undefined,
    maxCap?: number | undefined,
  ): number {
    const rate = ratePercent ?? this.defaultInterestRatePercent;
    const cap = maxCap ?? this.maxDailyInterestCap;

    if (bankBalance <= 0 || rate <= 0) {
      return 0;
    }

    const calculated = Math.floor(bankBalance * (rate / 100));
    return Math.min(calculated, cap);
  }

  /**
   * Applies daily interest yield to a user's bank balance, constrained by bank capacity.
   */
  public async applyDailyInterest(
    userId: string,
    options?: {
      ratePercent?: number | undefined;
      maxCap?: number | undefined;
      guildId?: string | undefined;
    },
  ): Promise<InterestResult> {
    if (await this.repository.isAccountFrozen(userId)) {
      return {
        success: false,
        reason: 'ACCOUNT_FROZEN',
        userId,
        bankBalanceBefore: 0,
        interestAwarded: 0,
        bankBalanceAfter: 0,
      };
    }

    const balance = await this.repository.getOrCreateBalance(userId);
    const bankBalance = Number(balance.bankBalance);
    const bankCapacity = Number(balance.bankCapacity);

    if (bankBalance <= 0) {
      return {
        success: false,
        reason: 'NO_BANK_FUNDS',
        userId,
        bankBalanceBefore: 0,
        interestAwarded: 0,
        bankBalanceAfter: 0,
      };
    }

    if (bankBalance >= bankCapacity) {
      return {
        success: false,
        reason: 'BANK_FULL',
        userId,
        bankBalanceBefore: bankBalance,
        interestAwarded: 0,
        bankBalanceAfter: bankBalance,
      };
    }

    const interest = this.calculateDailyInterest(
      bankBalance,
      options?.ratePercent,
      options?.maxCap,
    );

    // Bound interest to remaining capacity
    const effectiveInterest = Math.min(interest, bankCapacity - bankBalance);

    if (effectiveInterest <= 0) {
      return {
        success: false,
        reason: 'ZERO_INTEREST_AWARDED',
        userId,
        bankBalanceBefore: bankBalance,
        interestAwarded: 0,
        bankBalanceAfter: bankBalance,
      };
    }

    const result = await this.repository.modifyBalance({
      userId,
      guildId: options?.guildId,
      bankDelta: effectiveInterest,
      type: 'INTEREST',
      source: 'BANK_INTEREST',
      metadata: {
        ratePercent: options?.ratePercent ?? this.defaultInterestRatePercent,
        initialBalance: bankBalance,
      },
    });

    return {
      success: true,
      userId,
      bankBalanceBefore: bankBalance,
      interestAwarded: effectiveInterest,
      bankBalanceAfter: Number(result.balance.bankBalance),
      transactionId: result.transaction.id,
    };
  }
}
