import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabaseClient,
  AdventureSessionRepository,
  EconomyRepository,
  XpRepository,
  PlayerEnergyRepository,
  WaifuCardRepository,
  WaifuAssetRepository,
  GameItemRepository,
  UserInventoryItemRepository,
  withTransaction,
  ensureCardSerialSchema,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { AdventureEngine } from '../adventure-engine.js';
import { AdventurePayoutService } from '../adventure-payout.service.js';
import type { ActiveAdventureSession } from '../types.js';
import { ItemGrantService } from '../../waifu-tcg/equipment/item-grant.service.js';
import { createMulberry32, ORDERED_RARITY_TIERS } from '../../waifu-tcg/rarity/rarity-engine.js';

describe('transactional adventure payouts', () => {
  let db: SqliteDatabaseClient;
  let economy: EconomyRepository, xp: XpRepository, energy: PlayerEnergyRepository;
  let cards: WaifuCardRepository, assets: WaifuAssetRepository, items: ItemGrantService;
  let sessions: AdventureSessionRepository<ActiveAdventureSession>;
  let payouts: AdventurePayoutService, engine: AdventureEngine;
  let session: ActiveAdventureSession;
  beforeEach(async () => {
    db = (await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    })) as SqliteDatabaseClient;
    economy = new EconomyRepository(db);
    xp = new XpRepository(db);
    energy = new PlayerEnergyRepository(db);
    cards = new WaifuCardRepository(db);
    assets = new WaifuAssetRepository(db);
    const catalog = new GameItemRepository(db);
    for (const code of ['CRAFTING_DUST', 'POTION_MINOR_HP'])
      await catalog.create({
        code,
        name: code,
        description: '',
        type: 'CONSUMABLE',
        subtype: 'POTION',
      });
    items = new ItemGrantService(catalog, new UserInventoryItemRepository(db));
    sessions = new AdventureSessionRepository(db);
    payouts = new AdventurePayoutService({ economy, xp, energy, cards, assets, items });
    engine = new AdventureEngine({
      completionRewards: false /* Retain coverage of stored version-1 reward behavior. */,
      startCooldownMs: 0,
      sessions,
      energy,
      payments: payouts,
      seed: () => 1703,
    });
    session = await engine.start({
      userId: 'alice',
      guildId: 'guild',
      channelId: 'channel',
      scenarioId: 'the-goblin-bazaar',
    });
  });
  afterEach(async () => {
    await db.close();
  });
  async function freeze() {
    // These tests inject already-frozen legacy payouts directly.
    delete session.rewardRank;
    delete session.rewardCalculation;
    session.status = 'SETTLING';
    await sessions.withUser('alice', (tx) => sessions.save(session, session.revision, tx));
  }
  async function definition(id: string, rarity = 'RARE', usable = true) {
    await assets.create({
      id: `asset-${id}`,
      sourceId: 'test',
      sourceImageId: id,
      characterName: id,
      animeTitle: 'test',
      imageHash: id,
      discordCdnUrl: 'https://example.test/image.png',
      isDeletedByRequest: !usable,
    });
    return cards.create({
      id,
      assetId: `asset-${id}`,
      name: id,
      rarity,
      element: 'FIRE',
      attack: 10,
      defense: 10,
      speed: 10,
      health: 10,
      collectionNumber: 1,
    });
  }
  it('pays boosted credits, XP and dust atomically once, with rank audit metadata', async () => {
    await engine.cancel('alice', session.id, 'START_FAILED');
    session = await engine.start({
      userId: 'alice',
      guildId: 'guild',
      channelId: 'channel',
      scenarioId: 'the-clockwork-orchard',
      card: {
        name: 'Rem',
        userCardId: 'owned',
        level: 100,
        element: 'WATER',
        attack: 100,
        defense: 100,
        speed: 50,
      },
    });
    for (const choice of ['2', '1', '1', '1']) {
      await engine.presented('alice', session.id, session.revision, 'message');
      session = await engine.choose('alice', session.id, session.revision, choice);
    }
    expect(session.rewards).toMatchObject({ credits: '1320', xp: 720, dust: 120 });
    const realGrant = items.grant.bind(items);
    const failure = vi.spyOn(items, 'grant').mockImplementationOnce(async (...args) => {
      await realGrant(...args);
      throw new Error('injected');
    });
    await expect(engine.settle('alice', session.id)).rejects.toThrow('injected');
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(0);
    expect(await xp.getAccount('alice', 'guild')).toBeNull();
    failure.mockRestore();
    const [done, retry] = await Promise.all([
      engine.settle('alice', session.id),
      engine.settle('alice', session.id),
    ]);
    expect(done.receipt).toEqual(retry.receipt);
    expect(done.receipt).toMatchObject({
      rewardRank: { rank: 'S+', amountBps: 60000 },
      rewardBonus: { credits: '1100', xp: 600, dust: 100 },
    });
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(1320);
    expect(Number((await xp.getAccount('alice', 'guild'))?.xp)).toBe(720);
    expect(await items.countOwned('alice', 'CRAFTING_DUST')).toBe(120);
    expect((await energy.findById('alice'))?.currentEnergy).toBe(85);
  });
  it.each([0, 50, 200])(
    'clamps a 100-credit loss against the prior wallet of %i, then grants 300',
    async (wallet) => {
      await economy.modifyBalance({
        userId: 'alice',
        walletDelta: wallet,
        type: 'TEST',
        source: 'TEST',
      });
      session.rewards.credits = '300';
      session.penalties.credits = '100';
      await freeze();
      const results = await Promise.all([
        engine.settle('alice', session.id),
        engine.settle('alice', session.id),
      ]);
      expect(results[0]!.receipt).toEqual(results[1]!.receipt);
      expect(results[0]!.receipt?.lostCredits).toBe(String(Math.min(wallet, 100)));
      expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(
        300 + Math.max(0, wallet - 100),
      );
    },
  );
  it('rolls back a debit if the required item is unavailable', async () => {
    await economy.modifyBalance({
      userId: 'alice',
      walletDelta: 500,
      type: 'TEST',
      source: 'TEST',
    });
    await expect(
      withTransaction(db, (tx) =>
        payouts.payChoice(
          session,
          { credits: 200, items: [{ code: 'POTION_MINOR_HP', quantity: 1 }] },
          tx,
        ),
      ),
    ).rejects.toThrow('Not enough');
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(500);
    await items.grant('alice', 'POTION_MINOR_HP', 1, 'TEST');
    await withTransaction(db, (tx) =>
      payouts.payChoice(
        session,
        { credits: 200, items: [{ code: 'POTION_MINOR_HP', quantity: 1 }] },
        tx,
      ),
    );
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(300);
    expect(await items.countOwned('alice', 'POTION_MINOR_HP')).toBe(0);
  });
  it('awards XP/level, dust, items and capped energy without consuming potion quota', async () => {
    session.rewards = {
      credits: '300',
      xp: 120,
      dust: 7,
      energy: 50,
      cards: [],
      items: [{ code: 'POTION_MINOR_HP', quantity: 2 }],
    };
    await freeze();
    const done = await engine.settle('alice', session.id);
    expect(done.receipt?.energyChange).toBe(15);
    expect((await xp.getAccount('alice', 'guild'))?.level).toBe(1);
    expect(await items.countOwned('alice', 'CRAFTING_DUST')).toBe(7);
    expect(await items.countOwned('alice', 'POTION_MINOR_HP')).toBe(2);
    expect((await energy.findById('alice'))?.dailyEnergyPotsUsed).toBe(0);
  });
  it('rolls all payout writes back after an item grant fails and retries the same reward', async () => {
    session.rewards.credits = '300';
    session.rewards.xp = 120;
    session.rewards.items = [{ code: 'POTION_MINOR_HP', quantity: 2 }];
    await freeze();
    const realGrant = items.grant.bind(items);
    const spy = vi.spyOn(items, 'grant').mockImplementationOnce(async (...args) => {
      await realGrant(...args);
      throw new Error('injected after inventory write');
    });
    await expect(engine.settle('alice', session.id)).rejects.toThrow('injected');
    expect((await sessions.findById(session.id))?.status).toBe('SETTLING');
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(0);
    expect(await xp.getAccount('alice', 'guild')).toBeNull();
    expect(await items.countOwned('alice', 'POTION_MINOR_HP')).toBe(0);
    spy.mockRestore();
    expect((await engine.settle('alice', session.id)).receipt?.grossCredits).toBe('300');
    expect(await items.countOwned('alice', 'POTION_MINOR_HP')).toBe(2);
  });
  it('honors minimum rarity and scans beyond the first page of unusable definitions', async () => {
    await definition('common', 'COMMON');
    for (let i = 0; i < 101; i++)
      await definition(`a-${String(i).padStart(3, '0')}`, 'RARE', false);
    await definition('z-eligible');
    session.rewards.cards = [{ minRarity: 'RARE', cardId: null }];
    await withTransaction(db, (tx) => payouts.prepareRewards(session, createMulberry32(1703), tx));
    expect(session.rewards.cards[0]!.cardId).toBe('z-eligible');
    await freeze();
    expect((await engine.settle('alice', session.id)).receipt?.cards[0]).toMatchObject({
      name: 'z-eligible',
      rarity: 'RARE',
      serial: 1,
    });
  });
  it('reports missing/deleted frozen cards without substituting a new draw', async () => {
    await definition('selected', 'MYTHIC');
    await definition('replacement', 'MYTHIC');
    session.rewards.cards = [
      { minRarity: 'MYTHIC', cardId: 'selected' },
      { minRarity: 'RARE', cardId: null },
    ];
    await assets.update('asset-selected', { isDeletedByRequest: true });
    await freeze();
    expect((await engine.settle('alice', session.id)).receipt).toMatchObject({
      cards: [],
      unavailableCards: 2,
    });
  });
  it('persists an empty eligible pool and ignores energy in cooldown mode', async () => {
    await definition('common', 'COMMON');
    session.rewards.cards = [{ minRarity: 'MYTHIC', cardId: null }];
    await withTransaction(db, (tx) => payouts.prepareRewards(session, createMulberry32(1), tx));
    expect(session.rewards.cards[0]!.cardId).toBeNull();
    session.admissionMode = 'COOLDOWN';
    session.rewards.energy = 50;
    session.penalties.energy = 50;
    await freeze();
    expect((await engine.settle('alice', session.id)).receipt?.energyChange).toBe(0);
    expect((await energy.findById('alice'))?.currentEnergy).toBe(85);
  });
  it('reserves drop serials and atomically mints concurrent grants without reuse after deletion', async () => {
    await definition('shared');
    const reserved = await cards.reserveSerialNumber('shared');
    const minted = await Promise.all(
      ['alice', 'bob'].map((userId) => cards.mintUserCard({ cardId: 'shared', userId })),
    );
    expect(minted.map((card) => card.serialNumber)).toEqual([2, 3]);
    await cards.createUserCard({ cardId: 'shared', userId: 'charlie', serialNumber: reserved });
    await expect(
      cards.createUserCard({ cardId: 'shared', userId: 'duplicate', serialNumber: 2 }),
    ).rejects.toThrow();
    db.raw.prepare('DELETE FROM user_cards WHERE card_id = ?').run('shared');
    expect((await cards.mintUserCard({ cardId: 'shared', userId: 'alice' })).serialNumber).toBe(4);
  });
  it('audits legacy duplicate serials without changing owned cards', async () => {
    db.raw.exec('DROP INDEX idx_user_cards_serial_unique');
    await definition('legacy');
    for (const userId of ['alice', 'bob'])
      await cards.createUserCard({ userId, cardId: 'legacy', serialNumber: 1 });
    await expect(ensureCardSerialSchema(db)).rejects.toThrow('explicit repair');
    expect(db.raw.prepare('SELECT count(*) AS n FROM user_cards').get()).toEqual({ n: 2 });
  });
  it.each(ORDERED_RARITY_TIERS)('never grants below the %s rarity floor', async (floor) => {
    for (const rarity of ORDERED_RARITY_TIERS) await definition(rarity, rarity);
    session.rewards.cards = Array.from({ length: 24 }, () => ({ minRarity: floor, cardId: null }));
    await withTransaction(db, (tx) => payouts.prepareRewards(session, createMulberry32(1705), tx));
    for (const reward of session.rewards.cards) {
      const card = await cards.findById(reward.cardId!);
      expect(ORDERED_RARITY_TIERS.indexOf(card!.rarity as typeof floor)).toBeLessThanOrEqual(
        ORDERED_RARITY_TIERS.indexOf(floor),
      );
    }
  });
  it('charges one 200-credit stake and pays 400 gross on the seeded winning route', async () => {
    await economy.modifyBalance({
      userId: 'alice',
      walletDelta: 500,
      type: 'TEST',
      source: 'TEST',
    });
    for (const choice of ['1', '3', '1', '1', '1']) {
      await engine.presented('alice', session.id, session.revision, 'message');
      const previous = session;
      session = await engine.choose('alice', session.id, session.revision, choice);
      await engine.choose('alice', session.id, previous.revision, choice);
    }
    expect(session.currentNodeId).toBe('jackpot');
    const done = await engine.settle('alice', session.id);
    expect(done.receipt).toMatchObject({
      grossCredits: '400',
      lostCredits: '0',
      paidCredits: '250',
      netCredits: '150',
    });
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(650);
    expect(
      db.raw
        .prepare("SELECT count(*) AS n FROM economy_transactions WHERE type = 'ADVENTURE_COST'")
        .get(),
    ).toEqual({ n: 2 });
  });
  it('retains the 150-credit toll on abandonment without a deferred second charge', async () => {
    await engine.cancel('alice', session.id, 'START_FAILED');
    session = await engine.start({
      userId: 'alice',
      guildId: 'guild',
      channelId: 'channel',
      scenarioId: 'the-bandit-ambush',
    });
    await economy.modifyBalance({
      userId: 'alice',
      walletDelta: 500,
      type: 'TEST',
      source: 'TEST',
    });
    await engine.presented('alice', session.id, session.revision, 'message');
    session = await engine.choose('alice', session.id, session.revision, '2');
    expect(session.penalties.credits).toBe('0');
    const cancelled = await engine.cancel('alice', session.id);
    expect(cancelled.receipt).toMatchObject({
      paidCredits: '150',
      lostCredits: '0',
      netCredits: '-150',
      energyChange: 7,
    });
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(350);
  });
  it('rolls back minted cards, serials and every other reward when the last energy write fails', async () => {
    await definition('reward');
    session.rewards = {
      credits: '300',
      xp: 120,
      dust: 5,
      energy: 10,
      items: [{ code: 'POTION_MINOR_HP', quantity: 2 }],
      cards: [{ minRarity: 'RARE', cardId: 'reward' }],
    };
    await freeze();
    const original = energy.update.bind(energy);
    vi.spyOn(energy, 'update').mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error('last write failed');
    });
    await expect(engine.settle('alice', session.id)).rejects.toThrow('last write failed');
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(0);
    expect(await xp.getAccount('alice', 'guild')).toBeNull();
    expect(await items.countOwned('alice', 'CRAFTING_DUST')).toBe(0);
    expect(await items.countOwned('alice', 'POTION_MINOR_HP')).toBe(0);
    expect(await cards.listUserCards('alice')).toEqual([]);
    expect((await energy.findById('alice'))?.currentEnergy).toBe(85);
    const receipt = (await engine.settle('alice', session.id)).receipt!;
    expect(receipt.cards[0]?.serial).toBe(1);
    expect(receipt.energyChange).toBe(10);
  });
  it('refuses lossy SQLite currency totals without partially completing a payout', async () => {
    await economy.modifyBalance({
      userId: 'alice',
      walletDelta: Number.MAX_SAFE_INTEGER,
      type: 'TEST',
      source: 'TEST',
    });
    session.rewards.credits = '300';
    await freeze();
    await expect(engine.settle('alice', session.id)).rejects.toThrow('integer range');
    expect((await sessions.findById(session.id))?.status).toBe('SETTLING');
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });
  it('allows only one winner when a paid choice races its abandon button', async () => {
    await economy.modifyBalance({
      userId: 'alice',
      walletDelta: 500,
      type: 'TEST',
      source: 'TEST',
    });
    await engine.presented('alice', session.id, 0, 'message');
    const outcomes = await Promise.allSettled([
      engine.choose('alice', session.id, 0, '1'),
      engine.cancel('alice', session.id, 'ABANDONED', 0),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const ended = await engine.cancel('alice', session.id);
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(
      500 - Number(ended.receipt!.paidCredits),
    );
    expect(ended.receipt!.energyChange).toBe(7);
    expect(ended.history.length).toBeLessThanOrEqual(1);
  });
});
