import { eq, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { PaginationOptions, PaginatedResult } from './types.js';
import type {
  EconomyBalance,
  NewEconomyBalance,
  EconomyTransaction,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { withTransaction } from '../transactions/index.js';
import { DatabaseError } from '@ririko/core';

export interface ModifyBalanceParams {
  userId: string;
  guildId?: string | undefined;
  walletDelta?: number | bigint | undefined;
  bankDelta?: number | bigint | undefined;
  type: string;
  source: string;
  currency?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface ModifyBalanceResult {
  balance: EconomyBalance;
  transaction: EconomyTransaction;
}

export interface TransferBalanceParams {
  fromUserId: string;
  toUserId: string;
  guildId?: string | undefined;
  amount: number | bigint;
  currency?: string | undefined;
  source?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface TransferBalanceResult {
  fromBalance: EconomyBalance;
  toBalance: EconomyBalance;
  debitTransaction: EconomyTransaction;
  creditTransaction: EconomyTransaction;
}

export class EconomyRepository extends BaseRepository<
  EconomyBalance,
  NewEconomyBalance,
  Partial<NewEconomyBalance>
> {
  async findById(userId: string, tx?: DatabaseClient): Promise<EconomyBalance | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.economyBalances)
        .where(eq(sqliteSchema.economyBalances.userId, userId));
      return (row as EconomyBalance) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.economyBalances)
        .where(eq(pgSchema.economyBalances.userId, userId));
      return (row as unknown as EconomyBalance) ?? null;
    }
  }

  async exists(userId: string, tx?: DatabaseClient): Promise<boolean> {
    const balance = await this.findById(userId, tx);
    return balance !== null;
  }

  async create(data: NewEconomyBalance, tx?: DatabaseClient): Promise<EconomyBalance> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.economyBalances)
        .values(data)
        .returning();
      if (!created) throw new DatabaseError(`Failed to create balance for user ${data.userId}`);
      return created as EconomyBalance;
    } else {
      const [created] = await client.db
        .insert(pgSchema.economyBalances)
        .values(data as unknown as typeof pgSchema.economyBalances.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError(`Failed to create balance for user ${data.userId}`);
      return created as unknown as EconomyBalance;
    }
  }

  async update(
    userId: string,
    data: Partial<NewEconomyBalance>,
    tx?: DatabaseClient,
  ): Promise<EconomyBalance> {
    const client = this.getClient(tx);
    const updateData = { ...data, updatedAt: new Date() };

    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.economyBalances)
        .set(updateData)
        .where(eq(sqliteSchema.economyBalances.userId, userId))
        .returning();
      if (!updated) throw new DatabaseError(`Balance for user ${userId} not found for update`);
      return updated as EconomyBalance;
    } else {
      const [updated] = await client.db
        .update(pgSchema.economyBalances)
        .set(updateData as unknown as Partial<typeof pgSchema.economyBalances.$inferInsert>)
        .where(eq(pgSchema.economyBalances.userId, userId))
        .returning();
      if (!updated) throw new DatabaseError(`Balance for user ${userId} not found for update`);
      return updated as unknown as EconomyBalance;
    }
  }

  async delete(userId: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.economyBalances)
        .where(eq(sqliteSchema.economyBalances.userId, userId))
        .returning({ userId: sqliteSchema.economyBalances.userId });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.economyBalances)
        .where(eq(pgSchema.economyBalances.userId, userId))
        .returning({ userId: pgSchema.economyBalances.userId });
      return deleted.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.economyBalances);
      return Number(res?.count ?? 0);
    } else {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.economyBalances);
      return Number(res?.count ?? 0);
    }
  }

  async getOrCreateBalance(
    userId: string,
    defaultBankCapacity: number | bigint = 10000,
    tx?: DatabaseClient,
  ): Promise<EconomyBalance> {
    const existing = await this.findById(userId, tx);
    if (existing) return existing;

    const capacityNum = Number(defaultBankCapacity);
    const capacityBig = BigInt(defaultBankCapacity);

    const client = this.getClient(tx);
    const now = new Date();

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.economyBalances)
        .values({
          userId,
          walletBalance: 0,
          bankBalance: 0,
          bankCapacity: capacityNum,
          netWorth: 0,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: sqliteSchema.economyBalances.userId,
          set: { updatedAt: now },
        })
        .returning();
      if (!created) throw new DatabaseError(`Failed to get or create balance for user ${userId}`);
      return created as EconomyBalance;
    } else {
      const [created] = await client.db
        .insert(pgSchema.economyBalances)
        .values({
          userId,
          walletBalance: 0n,
          bankBalance: 0n,
          bankCapacity: capacityBig,
          netWorth: 0n,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: pgSchema.economyBalances.userId,
          set: { updatedAt: now },
        })
        .returning();
      if (!created) throw new DatabaseError(`Failed to get or create balance for user ${userId}`);
      return created as unknown as EconomyBalance;
    }
  }

  /**
   * Modifies a user's wallet or bank balance atomically with negative-balance guardrails,
   * bank capacity validation, and an immutable double-entry ledger entry.
   */
  async modifyBalance(
    params: ModifyBalanceParams,
    tx?: DatabaseClient,
  ): Promise<ModifyBalanceResult> {
    const targetClient = this.getClient(tx);

    return withTransaction(targetClient, async (txClient) => {
      const current = await this.getOrCreateBalance(params.userId, 10000, txClient);

      const currentWallet = BigInt(current.walletBalance);
      const currentBank = BigInt(current.bankBalance);
      const bankCap = BigInt(current.bankCapacity);

      const walletDelta = BigInt(params.walletDelta ?? 0);
      const bankDelta = BigInt(params.bankDelta ?? 0);

      const newWallet = currentWallet + walletDelta;
      const newBank = currentBank + bankDelta;

      if (newWallet < 0n) {
        throw new DatabaseError(
          `Insufficient wallet balance: current ${currentWallet}, delta ${walletDelta}`,
        );
      }

      if (newBank < 0n) {
        throw new DatabaseError(
          `Insufficient bank balance: current ${currentBank}, delta ${bankDelta}`,
        );
      }

      if (bankDelta > 0n && newBank > bankCap) {
        throw new DatabaseError(
          `Bank capacity exceeded: capacity ${bankCap}, requested balance ${newBank}`,
        );
      }

      const balanceBefore = currentWallet + currentBank;
      const newNetWorth = newWallet + newBank;
      const amountChange =
        (walletDelta < 0n ? -walletDelta : walletDelta) + (bankDelta < 0n ? -bankDelta : bankDelta);
      const now = new Date();
      const txId = randomUUID();
      const currency = params.currency ?? 'CREDITS';

      let updatedBalance: EconomyBalance;
      let transactionRecord: EconomyTransaction;

      if (this.isSqlite(txClient)) {
        const [bal] = await txClient.db
          .update(sqliteSchema.economyBalances)
          .set({
            walletBalance: Number(newWallet),
            bankBalance: Number(newBank),
            netWorth: Number(newNetWorth),
            updatedAt: now,
          })
          .where(eq(sqliteSchema.economyBalances.userId, params.userId))
          .returning();

        const [entry] = await txClient.db
          .insert(sqliteSchema.economyTransactions)
          .values({
            id: txId,
            userId: params.userId,
            guildId: params.guildId ?? null,
            type: params.type,
            amount: Number(amountChange),
            currency,
            balanceBefore: Number(balanceBefore),
            balanceAfter: Number(newNetWorth),
            source: params.source,
            metadata: params.metadata ?? {},
            createdAt: now,
          })
          .returning();

        if (!bal || !entry) throw new DatabaseError('Failed to record balance update in SQLite');
        updatedBalance = bal as EconomyBalance;
        transactionRecord = entry as EconomyTransaction;
      } else {
        const [bal] = await txClient.db
          .update(pgSchema.economyBalances)
          .set({
            walletBalance: newWallet,
            bankBalance: newBank,
            netWorth: newNetWorth,
            updatedAt: now,
          })
          .where(eq(pgSchema.economyBalances.userId, params.userId))
          .returning();

        const [entry] = await txClient.db
          .insert(pgSchema.economyTransactions)
          .values({
            id: txId,
            userId: params.userId,
            guildId: params.guildId ?? null,
            type: params.type,
            amount: amountChange,
            currency,
            balanceBefore,
            balanceAfter: newNetWorth,
            source: params.source,
            metadata: params.metadata ?? {},
            createdAt: now,
          })
          .returning();

        if (!bal || !entry)
          throw new DatabaseError('Failed to record balance update in PostgreSQL');
        updatedBalance = bal as unknown as EconomyBalance;
        transactionRecord = entry as unknown as EconomyTransaction;
      }

      return {
        balance: updatedBalance,
        transaction: transactionRecord,
      };
    });
  }

  /**
   * Transfers currency from one user to another in a single atomic ACID transaction
   * with double-entry ledger bookkeeping.
   */
  async transferBalance(
    params: TransferBalanceParams,
    tx?: DatabaseClient,
  ): Promise<TransferBalanceResult> {
    const amountBig = BigInt(params.amount);
    if (amountBig <= 0n) {
      throw new DatabaseError('Transfer amount must be greater than zero');
    }

    if (params.fromUserId === params.toUserId) {
      throw new DatabaseError('Cannot transfer currency to oneself');
    }

    const targetClient = this.getClient(tx);

    return withTransaction(targetClient, async (txClient) => {
      // Debit sender
      const debitResult = await this.modifyBalance(
        {
          userId: params.fromUserId,
          guildId: params.guildId,
          walletDelta: -amountBig,
          type: 'TRANSFER',
          source: params.source ?? 'USER_TRANSFER',
          currency: params.currency,
          metadata: {
            ...params.metadata,
            recipientId: params.toUserId,
            direction: 'DEBIT',
          },
        },
        txClient,
      );

      // Credit recipient
      const creditResult = await this.modifyBalance(
        {
          userId: params.toUserId,
          guildId: params.guildId,
          walletDelta: amountBig,
          type: 'TRANSFER',
          source: params.source ?? 'USER_TRANSFER',
          currency: params.currency,
          metadata: {
            ...params.metadata,
            senderId: params.fromUserId,
            direction: 'CREDIT',
          },
        },
        txClient,
      );

      return {
        fromBalance: debitResult.balance,
        toBalance: creditResult.balance,
        debitTransaction: debitResult.transaction,
        creditTransaction: creditResult.transaction,
      };
    });
  }

  /**
   * Deposits credits from wallet into bank up to maximum capacity.
   */
  async deposit(
    userId: string,
    amount: number | bigint,
    tx?: DatabaseClient,
  ): Promise<ModifyBalanceResult> {
    const amountBig = BigInt(amount);
    if (amountBig <= 0n) {
      throw new DatabaseError('Deposit amount must be greater than zero');
    }

    return this.modifyBalance(
      {
        userId,
        walletDelta: -amountBig,
        bankDelta: amountBig,
        type: 'DEPOSIT',
        source: 'BANK_DEPOSIT',
      },
      tx,
    );
  }

  /**
   * Withdraws credits from bank into wallet.
   */
  async withdraw(
    userId: string,
    amount: number | bigint,
    tx?: DatabaseClient,
  ): Promise<ModifyBalanceResult> {
    const amountBig = BigInt(amount);
    if (amountBig <= 0n) {
      throw new DatabaseError('Withdrawal amount must be greater than zero');
    }

    return this.modifyBalance(
      {
        userId,
        walletDelta: amountBig,
        bankDelta: -amountBig,
        type: 'WITHDRAW',
        source: 'BANK_WITHDRAW',
      },
      tx,
    );
  }

  /**
   * Retrieves paginated financial transaction history for a user.
   */
  async getTransactionHistory(
    userId: string,
    options?: PaginationOptions,
    tx?: DatabaseClient,
  ): Promise<PaginatedResult<EconomyTransaction>> {
    const client = this.getClient(tx);
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    if (this.isSqlite(client)) {
      const items = await client.db
        .select()
        .from(sqliteSchema.economyTransactions)
        .where(eq(sqliteSchema.economyTransactions.userId, userId))
        .orderBy(desc(sqliteSchema.economyTransactions.createdAt))
        .limit(limit)
        .offset(offset);

      const [countRes] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.economyTransactions)
        .where(eq(sqliteSchema.economyTransactions.userId, userId));

      return {
        items: items as EconomyTransaction[],
        total: Number(countRes?.count ?? 0),
        limit,
        offset,
      };
    } else {
      const items = await client.db
        .select()
        .from(pgSchema.economyTransactions)
        .where(eq(pgSchema.economyTransactions.userId, userId))
        .orderBy(desc(pgSchema.economyTransactions.createdAt))
        .limit(limit)
        .offset(offset);

      const [countRes] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.economyTransactions)
        .where(eq(pgSchema.economyTransactions.userId, userId));

      return {
        items: items as unknown as EconomyTransaction[],
        total: Number(countRes?.count ?? 0),
        limit,
        offset,
      };
    }
  }
}
