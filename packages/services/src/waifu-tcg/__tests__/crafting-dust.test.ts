import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabaseClient,
  EconomyRepository,
  GameItemRepository,
  PlayerEnergyRepository,
  UserInventoryItemRepository,
  WaifuCardRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { CANONICAL_ITEMS } from '../equipment/catalog.js';
import { ItemGrantService } from '../equipment/item-grant.service.js';
import { CardDismantleService } from '../card/dismantle-service.js';
import { ExpeditionService } from '../game-modes/expedition-service.js';
import { BossRaidService } from '../game-modes/boss-raid-service.js';
import type { Combatant } from '../combat/types.js';

describe('Crafting dust & reward payouts (BUG-0011)', () => {
  let client: SqliteDatabaseClient;
  let grants: ItemGrantService;
  let economyRepo: EconomyRepository;
  let energyRepo: PlayerEnergyRepository;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    const itemRepo = new GameItemRepository(client);
    for (const item of CANONICAL_ITEMS) await itemRepo.create(item);
    grants = new ItemGrantService(itemRepo, new UserInventoryItemRepository(client));
    economyRepo = new EconomyRepository(client);
    energyRepo = new PlayerEnergyRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('stacks dust and spends it only when there is enough', async () => {
    await grants.grant('u1', 'CRAFTING_DUST', 30, 'TEST');
    await grants.grant('u1', 'crafting_dust', 20, 'TEST'); // legacy achievement key
    expect(await grants.countOwned('u1', 'CRAFTING_DUST')).toBe(50);

    await expect(grants.consume('u1', 'CRAFTING_DUST', 60)).rejects.toThrow(/need 60, have 50/);
    expect(await grants.countOwned('u1', 'CRAFTING_DUST')).toBe(50);

    await grants.consume('u1', 'CRAFTING_DUST', 50);
    expect(await grants.countOwned('u1', 'CRAFTING_DUST')).toBe(0);
  });

  it('pays dismantle dust into the inventory', async () => {
    const cardRepo = new WaifuCardRepository(client);
    const card = await cardRepo.create({
      assetId: 'a',
      name: 'Nezuko',
      rarity: 'RARE',
      element: 'FIRE',
      attack: 1,
      defense: 1,
      speed: 1,
      health: 1,
      collectionNumber: 1,
    });
    const owned = await cardRepo.createUserCard({ userId: 'u1', cardId: card.id, serialNumber: 1 });

    const result = await new CardDismantleService(cardRepo, grants).dismantleCard('u1', owned.id);
    expect(result.success).toBe(true);
    expect(await grants.countOwned('u1', 'CRAFTING_DUST')).toBe(result.dustAwarded);
  });

  it('pays expedition credits and dust on claim', async () => {
    const expeditions = new ExpeditionService(energyRepo, { economyRepo, grants });
    const started = await expeditions.startExpedition('u1', 'card_1', '1h', 0);
    const claim = await expeditions.claimExpedition('u1', started.expedition!.id, () => 0.5);

    expect(claim.success).toBe(true);
    expect((await economyRepo.findById('u1'))?.walletBalance).toBe(claim.rewards!.credits);
    expect(await grants.countOwned('u1', 'CRAFTING_DUST')).toBe(claim.rewards!.dust);
  });

  it('pays world boss raid credits and dust', async () => {
    const raid = new BossRaidService(energyRepo, undefined, { economyRepo, grants });
    const attacker: Combatant = {
      id: 'c1',
      name: 'Hero',
      team: 'TEAM_A',
      element: 'WATER',
      rarity: 'RARE',
      level: 10,
      maxHealth: 5000,
      currentHealth: 5000,
      attack: 800,
      defense: 200,
      speed: 80,
      critRate: 0.1,
      critDamage: 1.5,
      maxMp: 100,
      currentMp: 0,
      skillManaCost: 40,
      shield: 0,
      statusEffects: [],
      perks: [],
      hasUsedPhoenixWard: false,
      isAlive: true,
    };
    const result = await raid.attackBoss('u1', attacker);

    expect(result.success).toBe(true);
    expect((await economyRepo.findById('u1'))?.walletBalance).toBe(result.rewards!.credits);
    expect(await grants.countOwned('u1', 'CRAFTING_DUST')).toBe(result.rewards!.craftingDust);
  });
});
