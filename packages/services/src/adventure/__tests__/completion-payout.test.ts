import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
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
  type SqliteDatabaseClient,
  type UserCard,
} from '@ririko/database';
import { AdventureEngine } from '../adventure-engine.js';
import { AdventurePayoutService } from '../adventure-payout.service.js';
import { getAdventureScenario } from '../scenarios/index.js';
import type { ActiveAdventureSession } from '../types.js';
import { ItemGrantService } from '../../waifu-tcg/equipment/item-grant.service.js';
import { syncCanonicalItems } from '../../waifu-tcg/equipment/catalog.js';
import { CardProgressionService } from '../../waifu-tcg/card/card-progression.service.js';
import { LevelingEngine } from '../../waifu-tcg/card/leveling-engine.js';

describe('completion progression settlement', () => {
  let db: SqliteDatabaseClient,
    cards: WaifuCardRepository,
    energy: PlayerEnergyRepository,
    economy: EconomyRepository,
    xp: XpRepository;
  let sessions: AdventureSessionRepository<ActiveAdventureSession>,
    engine: AdventureEngine,
    owned: UserCard,
    now: number;
  beforeEach(async () => {
    db = (await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    })) as SqliteDatabaseClient;
    cards = new WaifuCardRepository(db);
    energy = new PlayerEnergyRepository(db);
    economy = new EconomyRepository(db);
    xp = new XpRepository(db);
    sessions = new AdventureSessionRepository(db);
    const catalog = new GameItemRepository(db);
    await syncCanonicalItems(catalog);
    const assets = new WaifuAssetRepository(db);
    await assets.create({
      id: 'asset',
      sourceId: 'test',
      sourceImageId: '1',
      characterName: 'Rem',
      animeTitle: 'Test',
      imageHash: 'test',
      discordCdnUrl: 'https://example.test/card.png',
    });
    await cards.create({
      id: 'definition',
      assetId: 'asset',
      name: 'Rem',
      rarity: 'COMMON',
      element: 'WATER',
      attack: 150,
      defense: 150,
      speed: 150,
      health: 100,
      collectionNumber: 1,
    });
    owned = await cards.createUserCard({
      userId: 'alice',
      cardId: 'definition',
      serialNumber: 1,
      level: 18,
      state: 'EQUIPPED',
    });
    now = 1_000_000;
    engine = new AdventureEngine({
      sessions,
      energy,
      payments: new AdventurePayoutService({
        economy,
        xp,
        energy,
        cards,
        assets,
        items: new ItemGrantService(catalog, new UserInventoryItemRepository(db)),
      }),
      seed: () => 11,
      now: () => now,
      startCooldownMs: 0,
    });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.close();
  });
  async function start(scenarioId = 'the-clockwork-orchard') {
    return engine.start({
      userId: 'alice',
      guildId: 'guild',
      channelId: 'channel',
      scenarioId,
      card: {
        userCardId: owned.id,
        level: owned.level,
        name: 'Rem',
        element: 'WATER',
        attack: 150,
        defense: 150,
        speed: 150,
      },
    });
  }
  async function finish(state: ActiveAdventureSession, choices?: string[]) {
    let step = 0;
    while (state.status === 'ACTIVE') {
      const node = getAdventureScenario(state.scenarioId).nodes[state.currentNodeId]!;
      if (node.type !== 'decision') throw Error('Unexpected terminal');
      const choice =
        choices?.[step++] ??
        node.choices.find((c) => !c.cost && c.transition.type === 'direct')!.id;
      await engine.presented('alice', state.id, state.revision, 'message');
      state = await engine.choose('alice', state.id, state.revision, choice);
    }
    return state;
  }
  it('grants actual companion XP/levels exactly once and freezes the entry rank', async () => {
    await cards.updateUserCardLevelAndExp(
      owned.id,
      18,
      new LevelingEngine().getExpForNextLevel(18) - 100,
    );
    const state = await finish(await start(), ['2', '1', '1', '1']);
    expect(state.rewards.companionXp).toBeGreaterThan(675);
    const [a, b] = await Promise.all([
      engine.settle('alice', state.id),
      engine.settle('alice', state.id),
    ]);
    expect(a.receipt).toEqual(b.receipt);
    expect(a.receipt?.companionXp).toMatchObject({
      userCardId: owned.id,
      previousLevel: 18,
      newLevel: 19,
      levelsGained: 1,
      expGained: state.rewards.companionXp,
    });
    expect(a.receipt?.rewardRank?.rank).toBe('E');
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(
      Number(state.rewards.credits),
    );
  });
  it('rolls card XP and all other rewards back if the last participant fails', async () => {
    const state = await finish(await start(), ['2', '1', '1', '1']);
    const update = cards.updateUserCardLevelAndExp.bind(cards);
    vi.spyOn(cards, 'updateUserCardLevelAndExp').mockImplementationOnce(async (...args) => {
      await update(...args);
      throw Error('after XP write');
    });
    await expect(engine.settle('alice', state.id)).rejects.toThrow('after XP write');
    expect((await cards.findUserCardById(owned.id))?.exp).toBe(0);
    expect(Number((await economy.getOrCreateBalance('alice')).walletBalance)).toBe(0);
    expect(await xp.getAccount('alice', 'guild')).toBeNull();
    expect((await sessions.findById(state.id))?.status).toBe('SETTLING');
    const done = await engine.settle('alice', state.id);
    expect(done.receipt?.companionXp?.expGained).toBe(state.rewards.companionXp);
  });
  it('serializes simultaneous tower XP with adventure XP without lost updates', async () => {
    const state = await finish(await start(), ['2', '1', '1', '1']);
    await Promise.all([
      engine.settle('alice', state.id),
      new CardProgressionService(cards).grantExp(owned.id, 890),
    ]);
    expect((await cards.findUserCardById(owned.id))?.exp).toBe(state.rewards.companionXp! + 890);
  });
  it.each(['transfer', 'trade', 'delete'])(
    'does not redirect XP after original companion becomes unavailable: %s',
    async (action) => {
      const state = await finish(await start());
      if (action === 'transfer') await cards.updateUserCardOwner(owned.id, 'bob');
      if (action === 'trade') await cards.updateUserCardState(owned.id, 'IN_TRADE');
      if (action === 'delete')
        await db.raw.prepare('DELETE FROM user_cards WHERE id = ?').run(owned.id);
      const done = await engine.settle('alice', state.id);
      expect(done.receipt?.companionXpUnavailable).toBe(true);
      expect(done.receipt?.companionXp).toBeUndefined();
      expect(done.receipt?.grossCredits).toBe(state.rewards.credits);
    },
  );
  it('caps the actual XP grant at rarity max level', async () => {
    await cards.updateUserCardLevelAndExp(
      owned.id,
      19,
      new LevelingEngine().getExpForNextLevel(19) - 5,
    );
    owned.level = 19;
    const state = await finish(await start());
    const done = await engine.settle('alice', state.id);
    expect(done.receipt?.companionXp).toMatchObject({
      expGained: 5,
      newLevel: 20,
      isMaxLevel: true,
    });
  });
  it('rewards a completed failure but grants no XP for abandonment or timeout', async () => {
    let state = await finish(await start('the-cursed-crypt'));
    const node = getAdventureScenario(state.scenarioId).nodes[state.currentNodeId]!;
    expect(node.type === 'terminal' && node.outcome.type.includes('FAILURE')).toBe(true);
    expect(state.rewards.companionXp).toBeGreaterThan(0);
    await engine.settle('alice', state.id);
    const after = (await cards.findUserCardById(owned.id))!.exp;
    state = await start();
    await engine.cancel('alice', state.id);
    state = await start();
    await engine.presented('alice', state.id, 0, 'message');
    now += 90_001;
    await engine.status('alice');
    expect((await cards.findUserCardById(owned.id))?.exp).toBe(after);
  });
  it('survives new engine recovery using the saved completion policy', async () => {
    const state = await finish(await start());
    const snapshot = JSON.parse(JSON.stringify(state)) as ActiveAdventureSession;
    expect(snapshot.rewardEconomy?.version).toBe(2);
    await engine.recover(
      async () => {},
      () => {
        throw Error('unexpected recovery failure');
      },
    );
    const done = await sessions.findById(state.id);
    expect(done?.receipt?.companionXp?.expGained).toBe(snapshot.rewards.companionXp);
    expect(done?.receipt?.grossCredits).toBe(snapshot.rewards.credits);
  });
});
