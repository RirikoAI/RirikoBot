import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient, EconomyRepository, type SqliteDatabaseClient } from '@ririko/database';
import { EventBus } from '@ririko/core';
import { EconomyService } from './economy.service.js';
import { EconomyEventType, type EconomyEvent } from './types.js';
import { AntiSpamEvaluator } from './anti-spam.js';

describe('EconomyService Core', () => {
  let client: SqliteDatabaseClient;
  let repo: EconomyRepository;
  let eventBus: EventBus;
  let antiSpam: AntiSpamEvaluator;
  let service: EconomyService;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    // Execute SQLite schema creation for economy tables
    client.raw.exec(`
      CREATE TABLE IF NOT EXISTS economy_balances (
        user_id TEXT PRIMARY KEY,
        wallet_balance INTEGER NOT NULL DEFAULT 0,
        bank_balance INTEGER NOT NULL DEFAULT 0,
        bank_capacity INTEGER NOT NULL DEFAULT 10000,
        net_worth INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS economy_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CREDITS',
        balance_before INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        source TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL
      );
    `);

    repo = new EconomyRepository(client);
    eventBus = new EventBus();
    antiSpam = new AntiSpamEvaluator({
      cooldownSeconds: 60,
      similarityThreshold: 0.8,
      minContentLength: 5,
    });

    service = new EconomyService({
      repository: repo,
      eventBus,
      antiSpam,
    });
  });

  afterEach(async () => {
    await client.close();
  });

  it('awards credits and XP for a valid MESSAGE_SENT event and logs transaction', async () => {
    const event: EconomyEvent = {
      type: EconomyEventType.MESSAGE_SENT,
      userId: 'user_123',
      guildId: 'guild_abc',
      source: 'CHAT_MESSAGE',
      metadata: {
        content: 'Hello everyone, welcome to Ririko AI!',
        timestamp: 1_000_000,
      },
    };

    let emittedEvent: unknown = null;
    eventBus.on('economy:balanceUpdated', (payload) => {
      emittedEvent = payload;
    });

    const result = await service.handleEvent(event);

    expect(result.awarded).toBe(true);
    expect(result.credits).toBe(20);
    expect(result.xp).toBe(20);
    expect(result.walletBalance).toBe(20);
    expect(result.transactionId).toBeDefined();

    // Verify balance in database
    const balance = await service.getBalance('user_123');
    expect(balance.walletBalance).toBe(20);
    expect(balance.netWorth).toBe(20);

    // Verify transaction history in database
    const history = await repo.getTransactionHistory('user_123');
    expect(history.total).toBe(1);
    expect(history.items[0]!.type).toBe(EconomyEventType.MESSAGE_SENT);
    expect(history.items[0]!.amount).toBe(20);

    // Verify EventBus emission
    expect(emittedEvent).toEqual({
      userId: 'user_123',
      guildId: 'guild_abc',
      previousBalance: 0,
      newBalance: 20,
      reason: EconomyEventType.MESSAGE_SENT,
    });
  });

  it('rejects spam messages and awards zero credits/XP without mutating balance', async () => {
    const spamEvent: EconomyEvent = {
      type: EconomyEventType.MESSAGE_SENT,
      userId: 'spammer_1',
      guildId: 'guild_abc',
      source: 'CHAT_MESSAGE',
      metadata: {
        content: 'hi', // Under 5 characters -> rejected
        timestamp: 1_000_000,
      },
    };

    const result = await service.handleEvent(spamEvent);

    expect(result.awarded).toBe(false);
    expect(result.reason).toBe('MIN_LENGTH');
    expect(result.credits).toBe(0);
    expect(result.xp).toBe(0);

    // Balance should remain uncreated or zero
    const bal = await repo.findById('spammer_1');
    expect(bal).toBeNull();
  });

  it('applies custom multipliers for game wins or events', async () => {
    const gameEvent: EconomyEvent = {
      type: EconomyEventType.GAME_WON,
      userId: 'gamer_99',
      guildId: 'guild_abc',
      source: 'MINIGAME_COINFLIP',
      metadata: {
        multiplier: 2.0, // 2x boost
      },
    };

    const result = await service.handleEvent(gameEvent);

    expect(result.awarded).toBe(true);
    expect(result.credits).toBe(100); // 50 * 2
    expect(result.xp).toBe(100); // 50 * 2
    expect(result.walletBalance).toBe(100);
  });
});
