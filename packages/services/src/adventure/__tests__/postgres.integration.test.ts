import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  createDatabaseClient,
  AdventureSessionRepository,
  PlayerEnergyRepository,
  EconomyRepository,
  XpRepository,
  WaifuCardRepository,
  WaifuAssetRepository,
  GameItemRepository,
  UserInventoryItemRepository,
  ensureAdventureSchema,
  ensureCardSerialSchema,
  type PostgresDatabaseClient,
} from '@ririko/database';
import { AdventureEngine } from '../adventure-engine.js';
import { AdventurePayoutService } from '../adventure-payout.service.js';
import { ItemGrantService } from '../../waifu-tcg/equipment/item-grant.service.js';
import type { ActiveAdventureSession } from '../types.js';
import { adventureRewardRank, finalizeRankRewards } from '../reward-rank.js';
import { syncCanonicalItems } from '../../waifu-tcg/equipment/catalog.js';
import { CardProgressionService } from '../../waifu-tcg/card/card-progression.service.js';

// Explicit opt-in only. All tables live in a newly generated schema; no existing tables are reset.
describe.skipIf(!process.env.ADVENTURE_TEST_POSTGRES_URL)(
  'adventure PostgreSQL concurrency',
  () => {
    const schema = `adventure_test_${randomUUID().replaceAll('-', '')}`;
    let admin: PostgresDatabaseClient,
      first: PostgresDatabaseClient,
      second: PostgresDatabaseClient;
    let created = false;
    function services(db: PostgresDatabaseClient, completionRewards = false) {
      const sessions = new AdventureSessionRepository<ActiveAdventureSession>(db);
      const energy = new PlayerEnergyRepository(db),
        economy = new EconomyRepository(db);
      const cards = new WaifuCardRepository(db),
        assets = new WaifuAssetRepository(db);
      const payments = new AdventurePayoutService({
        economy,
        energy,
        cards,
        assets,
        xp: new XpRepository(db),
        items: new ItemGrantService(
          new GameItemRepository(db),
          new UserInventoryItemRepository(db),
        ),
      });
      return {
        sessions,
        energy,
        economy,
        cards,
        assets,
        engine: new AdventureEngine({
          completionRewards,
          sessions,
          energy,
          payments,
          seed: () => 1705,
        }),
      };
    }
    beforeAll(async () => {
      const url = process.env.ADVENTURE_TEST_POSTGRES_URL!;
      admin = (await createDatabaseClient({ dialect: 'postgres', url })) as PostgresDatabaseClient;
      await admin.raw.query(`CREATE SCHEMA "${schema}"`);
      created = true;
      const isolated = new URL(url);
      isolated.searchParams.set('options', `-c search_path=${schema}`);
      first = (await createDatabaseClient({
        dialect: 'postgres',
        url: isolated.toString(),
      })) as PostgresDatabaseClient;
      second = (await createDatabaseClient({
        dialect: 'postgres',
        url: isolated.toString(),
      })) as PostgresDatabaseClient;
      const root = resolve(fileURLToPath(new URL('../../../../../', import.meta.url)));
      // Drizzle Kit's snapshot serializer needs JSON-safe bigint defaults, confined to this child process.
      const ddl = execFileSync(
        process.execPath,
        [
          '-e',
          `
      BigInt.prototype.toJSON = function () { return this.toString(); };
      process.argv = ['node', 'drizzle-kit', 'export', '--dialect', 'postgresql', '--schema', './packages/database/src/schema/pg/index.ts'];
      require('./packages/database/node_modules/drizzle-kit/bin.cjs');
    `,
        ],
        { cwd: root, encoding: 'utf8' },
      );
      if (!ddl.startsWith('CREATE TABLE'))
        throw new Error('Could not export PostgreSQL test schema');
      await first.raw.query(ddl.replaceAll('"public".', `"${schema}".`));
      await ensureAdventureSchema(first);
      await ensureCardSerialSchema(first);
    }, 30_000);
    afterAll(async () => {
      await first?.close();
      await second?.close();
      // Delete only the exact schema this suite successfully created.
      if (created && /^adventure_test_[a-f0-9]{32}$/.test(schema))
        await admin.raw.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin?.close();
    });
    it('admits one start across independent connection pools, guilds and channels', async () => {
      const a = services(first),
        b = services(second);
      const results = await Promise.allSettled([
        a.engine.start({ userId: 'start-race', guildId: 'g1', channelId: 'c1' }),
        b.engine.start({ userId: 'start-race', guildId: 'g2', channelId: 'c2' }),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect((await b.energy.findById('start-race'))?.currentEnergy).toBe(85);
    });
    it('serializes settlement with a concurrent ordinary wallet credit and pays only once', async () => {
      const a = services(first),
        b = services(second),
        userId = 'wallet-race';
      const state = await a.engine.start({ userId, guildId: 'g1', channelId: 'c1' });
      await a.economy.modifyBalance({ userId, walletDelta: 50, type: 'TEST', source: 'TEST' });
      delete state.rewardRank;
      delete state.rewardCalculation;
      state.status = 'SETTLING';
      state.rewards.credits = '300';
      state.penalties.credits = '100';
      await a.sessions.withUser(userId, (tx) => a.sessions.save(state, state.revision, tx));
      await Promise.all([
        a.engine.settle(userId, state.id),
        b.engine.settle(userId, state.id),
        b.economy.modifyBalance({ userId, walletDelta: 25, type: 'TEST', source: 'TEST' }),
      ]);
      const receipt = (await b.sessions.findById(state.id))!.receipt!;
      expect(
        BigInt((await b.economy.getOrCreateBalance(userId)).walletBalance) +
          BigInt(receipt.lostCredits),
      ).toBe(375n);
      expect(
        (
          await first.raw.query(
            "SELECT count(*)::integer AS n FROM economy_transactions WHERE user_id = $1 AND type = 'ADVENTURE_REWARD'",
            [userId],
          )
        ).rows[0],
      ).toEqual({ n: 1 });
    });
    it('persists boosted policy/final totals across pools and pays once', async () => {
      const a = services(first),
        b = services(second),
        userId = 'rank-recovery';
      const state = await a.engine.start({ userId, guildId: 'g1', channelId: 'c1' });
      state.rewardRank = adventureRewardRank(100);
      state.rewardCalculation!.eligible.credits = '300';
      finalizeRankRewards(state);
      state.status = 'SETTLING';
      await a.sessions.withUser(userId, (tx) => a.sessions.save(state, state.revision, tx));
      await b.engine.assertCompatibleSessions();
      const [one, two] = await Promise.all([
        a.engine.settle(userId, state.id),
        b.engine.settle(userId, state.id),
      ]);
      expect(one.receipt).toEqual(two.receipt);
      expect(one.receipt).toMatchObject({
        grossCredits: '1800',
        rewardRank: { rank: 'S+' },
        rewardBonus: { credits: '1500' },
      });
      expect(Number((await b.economy.getOrCreateBalance(userId)).walletBalance)).toBe(1800);
    });
    it('grants completion XP atomically across pools alongside tower XP', async () => {
      const a = services(first, true),
        b = services(second, true),
        userId = 'companion-xp';
      await syncCanonicalItems(new GameItemRepository(first));
      const asset = await a.assets.create({
        sourceId: 'TEST',
        sourceImageId: 'xp',
        imageHash: randomUUID(),
        characterName: 'Companion',
        animeTitle: 'Test',
        discordCdnUrl: 'https://example.test/card.png',
      });
      const definition = await a.cards.create({
        assetId: asset.id,
        name: 'Companion',
        rarity: 'COMMON',
        element: 'WATER',
        attack: 150,
        defense: 150,
        speed: 150,
        health: 100,
        collectionNumber: 2,
      });
      const owned = await a.cards.createUserCard({
        userId,
        cardId: definition.id,
        serialNumber: 1,
        level: 18,
        state: 'EQUIPPED',
      });
      let state = await a.engine.start({
        userId,
        guildId: 'g1',
        channelId: 'c1',
        scenarioId: 'the-clockwork-orchard',
        card: {
          userCardId: owned.id,
          level: 18,
          name: 'Companion',
          element: 'WATER',
          attack: 150,
          defense: 150,
          speed: 150,
        },
      });
      for (const choice of ['2', '1', '1', '1']) {
        await a.engine.presented(userId, state.id, state.revision, 'message');
        state = await a.engine.choose(userId, state.id, state.revision, choice);
      }
      await Promise.all([
        a.engine.settle(userId, state.id),
        b.engine.settle(userId, state.id),
        new CardProgressionService(b.cards).grantExp(owned.id, 890),
      ]);
      expect((await b.cards.findUserCardById(owned.id))?.exp).toBe(
        state.rewards.companionXp! + 890,
      );
      expect((await b.sessions.findById(state.id))?.receipt?.companionXp?.expGained).toBe(
        state.rewards.companionXp,
      );
    });
    it('uses a shared serial allocator for simultaneous card grants and reserved drops', async () => {
      const a = services(first),
        b = services(second);
      const asset = await a.assets.create({
        sourceId: 'TEST',
        sourceImageId: '1',
        imageHash: randomUUID(),
        characterName: 'Test',
        animeTitle: 'Test',
        discordCdnUrl: 'https://example.test/card.png',
      });
      const card = await a.cards.create({
        assetId: asset.id,
        name: 'Test',
        rarity: 'RARE',
        element: 'FIRE',
        attack: 10,
        defense: 10,
        speed: 10,
        health: 10,
        collectionNumber: 1,
      });
      const reserved = await a.cards.reserveSerialNumber(card.id);
      const grants = await Promise.all([
        a.cards.mintUserCard({ userId: 'one', cardId: card.id }),
        b.cards.mintUserCard({ userId: 'two', cardId: card.id }),
      ]);
      expect(grants.map((value) => value.serialNumber).sort()).toEqual([2, 3]);
      expect(
        (await b.cards.createUserCard({ userId: 'drop', cardId: card.id, serialNumber: reserved }))
          .serialNumber,
      ).toBe(1);
    });
  },
);
