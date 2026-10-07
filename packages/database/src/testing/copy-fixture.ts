import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createDatabaseClient } from '../client/factory.js';
import type { DatabaseClient, SqliteDatabaseClient } from '../client/types.js';
import { ensureAdventureSchema } from '../migrations/adventure-schema.js';
import { ensureCardSerialSchema } from '../migrations/card-serials.js';
import {
  AdventureSessionRepository,
  type StoredAdventureSession,
} from '../repositories/adventure-session.repository.js';
import { EconomyRepository } from '../repositories/economy.repository.js';
import { GuildSettingsRepository } from '../repositories/guild-settings.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { WaifuCardRepository } from '../repositories/waifu-card.repository.js';

export const MOMENT = new Date('2024-05-06T07:08:09.123Z');
export const BIG_WALLET = 9_007_199_254_740_993n; // 2^53 + 1: a float cannot hold it
export const BIG_BANK = 9_007_199_254_740_999n;

export function sqlite(client: DatabaseClient): SqliteDatabaseClient {
  if (client.dialect !== 'sqlite') throw new Error('expected a SQLite client');
  return client;
}

/** Everything the fixture wrote, read back through the real repositories. */
export async function readBack(client: DatabaseClient, cardId: string) {
  const economy = new EconomyRepository(client);
  const cards = new WaifuCardRepository(client);
  const adventure = new AdventureSessionRepository<StoredAdventureSession>(client);
  const { critRate, ...card } = (await cards.findById(cardId))!;
  return {
    alice: await new UserRepository(client).findById('u1'),
    bob: await new UserRepository(client).findById('u2'),
    aliceBalance: await economy.findById('u1'),
    bobBalance: await economy.findById('u2'),
    bobLedger: (await economy.getTransactionHistory('u2')).items,
    card,
    critRate,
    aliceCards: await cards.listUserCards('u1'),
    bobCards: await cards.listUserCards('u2'),
    highestSerial: await cards.getHighestSerialNumber(cardId),
    session: await adventure.findById('s1'),
    adventureSettings: await adventure.getSettings('g1'),
    cooldowns: await adventure.withUser('u1', async (_tx, cooldownUntil, lastStartAt) => ({
      cooldownUntil,
      lastStartAt,
    })),
    guild: await new GuildSettingsRepository(client).findById('g1'),
  };
}

/**
 * A SQLite file built as the bot builds one (schema, then the startup upgrades) and filled through
 * the repositories: booleans, timestamps, JSON, bigint balances, owned cards with serials and an
 * adventure session.
 */
export async function buildSource(directory: string, name: string) {
  const path = join(directory, `${name}.sqlite`);
  const source = await createDatabaseClient({ dialect: 'sqlite', url: path });
  await ensureAdventureSchema(source);
  await ensureCardSerialSchema(source);

  const users = new UserRepository(source);
  await users.create({
    id: 'u1',
    username: 'alice',
    displayName: 'Alice',
    isBlacklisted: false,
    warnCount: 2,
    createdAt: MOMENT,
    updatedAt: MOMENT,
  });
  await users.create({ id: 'u2', username: 'bob', isBlacklisted: true });

  const economy = new EconomyRepository(source);
  await economy.create({
    userId: 'u1',
    walletBalance: 1500,
    bankBalance: 250,
    bankCapacity: 10_000,
    netWorth: 1750,
  });
  await economy.modifyBalance({
    userId: 'u2',
    walletDelta: 300,
    type: 'GRANT',
    source: 'SEED',
    metadata: { reason: 'seed', nested: { list: [1, 2, 3] } },
  });
  await economy.create({
    userId: 'u3',
    walletBalance: 0,
    bankBalance: 0,
    bankCapacity: 10_000,
    netWorth: 0,
  });
  // Above 2^53, which JavaScript numbers (and Drizzle's number mode) cannot hold.
  sqlite(source)
    .raw.prepare(
      'UPDATE economy_balances SET wallet_balance = ?, bank_balance = ? WHERE user_id = ?',
    )
    .run(BIG_WALLET, BIG_BANK, 'u3');

  const cards = new WaifuCardRepository(source);
  const card = await cards.create({
    assetId: randomUUID(),
    name: 'Copy Test Card',
    rarity: 'RARE',
    element: 'FIRE',
    attack: 120,
    defense: 50,
    speed: 10,
    health: 1000,
    collectionNumber: 1,
  });
  await cards.mintUserCard({ userId: 'u1', cardId: card.id, obtainedAt: MOMENT });
  await cards.mintUserCard({ userId: 'u2', cardId: card.id, isFavorite: true });

  const adventure = new AdventureSessionRepository<StoredAdventureSession>(source);
  await adventure.create(
    {
      id: 's1',
      userId: 'u1',
      guildId: 'g1',
      channelId: 'c1',
      revision: 1,
      status: 'ACTIVE',
      deadline: 1_700_000_000_000,
      startedAt: 1_699_999_000_000,
      deliveredRevision: -1,
    },
    source,
  );
  await adventure.recordChoice('s1', 1, { choice: 'left' }, source);
  await adventure.setSettings('g1', { energyEnabled: false });
  await adventure.withUser('u1', async (tx) => {
    await adventure.setCooldown('u1', 5_000, tx);
    await adventure.setLastStart('u1', 4_000, tx);
  });

  await new GuildSettingsRepository(source).create({
    guildId: 'g1',
    noXpChannelIds: ['c1', 'c2'],
    escalationSteps: [{ warnThreshold: 3, action: 'TIMEOUT', durationSeconds: 600 }],
    voiceXpEnabled: true,
    createdAt: MOMENT,
    updatedAt: MOMENT,
  });

  const expected = await readBack(source, card.id);
  return { path, source, cardId: card.id, expected };
}
