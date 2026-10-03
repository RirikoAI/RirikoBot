import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { EconomyRepository } from './economy.repository.js';

const wallet = async (repo: EconomyRepository, userId: string) =>
  Number((await repo.findById(userId))?.walletBalance);
const bank = async (repo: EconomyRepository, userId: string) =>
  Number((await repo.findById(userId))?.bankBalance);

describeDialects('EconomyRepository behaviour', (db) => {
  async function fund(repo: EconomyRepository, userId: string, amount: number) {
    return repo.modifyBalance({ userId, walletDelta: amount, type: 'GRANT', source: 'TEST' });
  }

  it('creates, finds, updates, counts and deletes balances', async () => {
    const repo = new EconomyRepository(db.client);
    expect(await repo.findById('u1')).toBeNull();
    expect(await repo.exists('u1')).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create({
      userId: 'u1',
      walletBalance: 5,
      bankBalance: 7,
      bankCapacity: 100,
      netWorth: 12,
    });
    expect(Number(created.walletBalance)).toBe(5);
    expect(await repo.exists('u1')).toBe(true);
    expect(await repo.count()).toBe(1);

    const updated = await repo.update('u1', { walletBalance: 50, bankCapacity: 500 });
    expect(Number(updated.walletBalance)).toBe(50);
    expect(Number(updated.bankCapacity)).toBe(500);
    expect(Number(updated.bankBalance)).toBe(7);
    await expect(repo.update('ghost', { walletBalance: 1 })).rejects.toThrow(DatabaseError);

    expect(await repo.delete('u1')).toBe(true);
    expect(await repo.delete('u1')).toBe(false);
    expect(await repo.count()).toBe(0);
  });

  it('rejects a second balance for the same user', async () => {
    const repo = new EconomyRepository(db.client);
    await repo.create({ userId: 'u1', walletBalance: 0, bankBalance: 0, bankCapacity: 10 });

    await expect(
      repo.create({ userId: 'u1', walletBalance: 0, bankBalance: 0, bankCapacity: 10 }),
    ).rejects.toThrow();
  });

  it('gets or creates a balance with the requested bank capacity', async () => {
    const repo = new EconomyRepository(db.client);

    const created = await repo.getOrCreateBalance('u1', 2500);
    expect(Number(created.bankCapacity)).toBe(2500);
    expect(Number(created.walletBalance)).toBe(0);

    const again = await repo.getOrCreateBalance('u1', 9999);
    expect(Number(again.bankCapacity)).toBe(2500);

    const defaulted = await repo.getOrCreateBalance('u2');
    expect(Number(defaulted.bankCapacity)).toBe(10_000);
    expect(await repo.count()).toBe(2);
  });

  it('sets a bank capacity, creating the balance when needed', async () => {
    const repo = new EconomyRepository(db.client);

    const fresh = await repo.setBankCapacity('u1', 777);
    expect(Number(fresh.bankCapacity)).toBe(777);

    const raised = await repo.setBankCapacity('u1', 5000);
    expect(Number(raised.bankCapacity)).toBe(5000);
  });

  it('applies wallet and bank deltas and writes a ledger entry for each change', async () => {
    const repo = new EconomyRepository(db.client);

    const grant = await repo.modifyBalance({
      userId: 'u1',
      guildId: 'g1',
      walletDelta: 1000,
      type: 'DAILY',
      source: 'DAILY_REWARD',
      metadata: { streak: 3 },
    });
    expect(Number(grant.balance.walletBalance)).toBe(1000);
    expect(Number(grant.balance.netWorth)).toBe(1000);
    expect(Number(grant.transaction.amount)).toBe(1000);
    expect(Number(grant.transaction.balanceBefore)).toBe(0);
    expect(Number(grant.transaction.balanceAfter)).toBe(1000);
    expect(grant.transaction.currency).toBe('CREDITS');
    expect(grant.transaction.guildId).toBe('g1');
    expect(grant.transaction.metadata).toEqual({ streak: 3 });

    const move = await repo.modifyBalance({
      userId: 'u1',
      walletDelta: -400n,
      bankDelta: 400n,
      type: 'DEPOSIT',
      source: 'BANK',
      currency: 'GEMS',
    });
    expect(Number(move.balance.walletBalance)).toBe(600);
    expect(Number(move.balance.bankBalance)).toBe(400);
    expect(Number(move.balance.netWorth)).toBe(1000);
    expect(Number(move.transaction.amount)).toBe(800);
    expect(move.transaction.currency).toBe('GEMS');
    expect(move.transaction.guildId).toBeNull();
    expect(move.transaction.metadata).toEqual({});
  });

  it('refuses overdrafts and over-capacity deposits without changing the balance', async () => {
    const repo = new EconomyRepository(db.client);
    await fund(repo, 'u1', 100);
    await repo.setBankCapacity('u1', 150);

    await expect(
      repo.modifyBalance({ userId: 'u1', walletDelta: -101, type: 'SPEND', source: 'TEST' }),
    ).rejects.toThrow(/Insufficient wallet balance/);
    await expect(
      repo.modifyBalance({ userId: 'u1', bankDelta: -1, type: 'SPEND', source: 'TEST' }),
    ).rejects.toThrow(/Insufficient bank balance/);
    await expect(
      repo.modifyBalance({ userId: 'u1', bankDelta: 151, type: 'SAVE', source: 'TEST' }),
    ).rejects.toThrow(/Bank capacity exceeded/);

    expect(await wallet(repo, 'u1')).toBe(100);
    expect(await bank(repo, 'u1')).toBe(0);
    expect((await repo.getTransactionHistory('u1')).total).toBe(1);
  });

  it('transfers between users and records a debit and a credit entry', async () => {
    const repo = new EconomyRepository(db.client);
    await fund(repo, 'alice', 500);

    const result = await repo.transferBalance({
      fromUserId: 'alice',
      toUserId: 'bob',
      amount: 200,
      guildId: 'g1',
      metadata: { note: 'thanks' },
    });

    expect(Number(result.fromBalance.walletBalance)).toBe(300);
    expect(Number(result.toBalance.walletBalance)).toBe(200);
    expect(result.debitTransaction.type).toBe('TRANSFER');
    expect(result.debitTransaction.source).toBe('USER_TRANSFER');
    expect(result.debitTransaction.metadata).toEqual({
      note: 'thanks',
      recipientId: 'bob',
      direction: 'DEBIT',
    });
    expect(result.creditTransaction.metadata).toEqual({
      note: 'thanks',
      senderId: 'alice',
      direction: 'CREDIT',
    });

    const custom = await repo.transferBalance({
      fromUserId: 'bob',
      toUserId: 'alice',
      amount: 50n,
      source: 'GIFT',
    });
    expect(custom.debitTransaction.source).toBe('GIFT');
    expect(await wallet(repo, 'alice')).toBe(350);
    expect(await wallet(repo, 'bob')).toBe(150);
  });

  it('refuses invalid transfers and rolls back when the sender cannot pay', async () => {
    const repo = new EconomyRepository(db.client);
    await fund(repo, 'alice', 100);

    await expect(
      repo.transferBalance({ fromUserId: 'alice', toUserId: 'bob', amount: 0 }),
    ).rejects.toThrow(/greater than zero/);
    await expect(
      repo.transferBalance({ fromUserId: 'alice', toUserId: 'alice', amount: 5 }),
    ).rejects.toThrow(/oneself/);
    await expect(
      repo.transferBalance({ fromUserId: 'alice', toUserId: 'bob', amount: 101 }),
    ).rejects.toThrow(/Insufficient wallet balance/);

    expect(await wallet(repo, 'alice')).toBe(100);
    expect(await repo.findById('bob')).toBeNull();
    expect((await repo.getTransactionHistory('bob')).total).toBe(0);
  });

  it('moves credits between wallet and bank with deposit and withdraw', async () => {
    const repo = new EconomyRepository(db.client);
    await fund(repo, 'u1', 1000);

    const deposited = await repo.deposit('u1', 300);
    expect(Number(deposited.balance.walletBalance)).toBe(700);
    expect(Number(deposited.balance.bankBalance)).toBe(300);
    expect(deposited.transaction.type).toBe('DEPOSIT');
    expect(deposited.transaction.source).toBe('BANK_DEPOSIT');

    const withdrawn = await repo.withdraw('u1', 100n);
    expect(Number(withdrawn.balance.walletBalance)).toBe(800);
    expect(Number(withdrawn.balance.bankBalance)).toBe(200);
    expect(withdrawn.transaction.type).toBe('WITHDRAW');
    expect(withdrawn.transaction.source).toBe('BANK_WITHDRAW');

    await expect(repo.deposit('u1', 0)).rejects.toThrow(/Deposit amount/);
    await expect(repo.withdraw('u1', -5)).rejects.toThrow(/Withdrawal amount/);
    await expect(repo.deposit('u1', 5000)).rejects.toThrow(/Insufficient wallet balance/);
    await expect(repo.withdraw('u1', 5000)).rejects.toThrow(/Insufficient bank balance/);
  });

  it('pages the transaction history newest first with a total', async () => {
    const repo = new EconomyRepository(db.client);
    for (let n = 1; n <= 5; n++) {
      await repo.modifyBalance({
        userId: 'u1',
        walletDelta: n,
        type: 'GRANT',
        source: `S${n}`,
        metadata: { n },
      });
      await repo.modifyBalance({ userId: 'other', walletDelta: 1, type: 'GRANT', source: 'X' });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const all = await repo.getTransactionHistory('u1');
    expect(all.total).toBe(5);
    expect(all.limit).toBe(20);
    expect(all.offset).toBe(0);
    expect(all.items.map((t) => t.source)).toEqual(['S5', 'S4', 'S3', 'S2', 'S1']);

    const page = await repo.getTransactionHistory('u1', { limit: 2, offset: 1 });
    expect(page.items.map((t) => t.source)).toEqual(['S4', 'S3']);
    expect(page.total).toBe(5);
    expect(page.limit).toBe(2);
    expect(page.offset).toBe(1);

    const empty = await repo.getTransactionHistory('nobody');
    expect(empty.items).toEqual([]);
    expect(empty.total).toBe(0);
  });

  it('keeps a separate account per user and freezes or unfreezes it', async () => {
    const repo = new EconomyRepository(db.client);
    expect(await repo.getAccount('u1')).toBeNull();
    expect(await repo.isAccountFrozen('u1')).toBe(false);

    const account = await repo.getOrCreateAccount('u1');
    expect(account.isFrozen).toBe(false);
    expect(account.dailyStreak).toBe(0);
    expect(account.lastDailyAt).toBeNull();
    expect((await repo.getOrCreateAccount('u1')).createdAt.getTime()).toBe(
      account.createdAt.getTime(),
    );

    const frozen = await repo.freezeAccount('u1');
    expect(frozen.isFrozen).toBe(true);
    expect(await repo.isAccountFrozen('u1')).toBe(true);
    expect((await repo.freezeAccount('u1', false)).isFrozen).toBe(false);
    expect(await repo.isAccountFrozen('u1')).toBe(false);

    const created = await repo.freezeAccount('u2');
    expect(created.isFrozen).toBe(true);
  });

  it('updates account state and throws for a missing account', async () => {
    const repo = new EconomyRepository(db.client);
    await repo.getOrCreateAccount('u1');
    const at = new Date('2026-05-05T10:00:00Z');

    const updated = await repo.updateAccount('u1', { dailyStreak: 4, lastDailyAt: at });
    expect(updated.dailyStreak).toBe(4);
    expect(updated.lastDailyAt?.getTime()).toBe(at.getTime());

    await expect(repo.updateAccount('ghost', { dailyStreak: 1 })).rejects.toThrow(DatabaseError);
  });
});
