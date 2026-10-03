import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { describeDialects } from '../testing/dialects.js';
import { EconomyRepository } from './economy.repository.js';
import { XpRepository } from './xp.repository.js';
import { MarketListingRepository } from './market-listing.repository.js';

/**
 * BUG-0031: the shared row types say `number`. Postgres stores these columns as BIGINT, and
 * they must still come back as plain numbers on both dialects.
 */
describeDialects('BIGINT columns read as numbers (BUG-0031)', (db) => {
  it('returns balances, transactions, XP and listing prices as numbers', async () => {
    const economy = new EconomyRepository(db.client);
    const created = await economy.getOrCreateBalance('user-1');
    expect(typeof created.bankCapacity).toBe('number');

    const { balance, transaction } = await economy.modifyBalance({
      userId: 'user-1',
      walletDelta: 250,
      type: 'TEST',
      source: 'TEST',
    });
    for (const value of [
      balance.walletBalance,
      balance.bankBalance,
      balance.netWorth,
      transaction.amount,
      transaction.balanceBefore,
      transaction.balanceAfter,
    ]) {
      expect(typeof value).toBe('number');
    }
    // Plain arithmetic works without Number() or BigInt().
    expect(balance.walletBalance + balance.bankBalance).toBe(250);

    const reread = await economy.findById('user-1');
    expect(reread?.netWorth).toBe(250);
    const history = await economy.getTransactionHistory('user-1');
    expect(history.items[0]?.amount).toBe(250);

    const xp = new XpRepository(db.client);
    const { account } = await xp.addXp({
      userId: 'user-1',
      guildId: 'guild-1',
      xpDelta: 40,
      source: 'TEST',
    });
    expect(account.xp).toBe(40);
    expect((await xp.getAccount('user-1', 'guild-1'))?.xp).toBe(40);

    const market = new MarketListingRepository(db.client);
    const listing = await market.create({
      sellerUserId: 'user-1',
      userCardId: randomUUID(),
      price: 1200,
      taxPaid: 60,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(listing.price).toBe(1200);
    expect(listing.taxPaid).toBe(60);
  });
});
