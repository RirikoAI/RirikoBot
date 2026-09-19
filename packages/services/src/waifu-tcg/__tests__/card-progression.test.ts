import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabaseClient,
  GameItemRepository,
  PlayerEnergyRepository,
  UserDungeonProgressRepository,
  UserInventoryItemRepository,
  WaifuCardRepository,
  type SqliteDatabaseClient,
  type UserCard,
} from '@ririko/database';
import { CANONICAL_ITEMS } from '../equipment/catalog.js';
import { ItemGrantService } from '../equipment/item-grant.service.js';
import { EnhancementService } from '../equipment/enhancement-service.js';
import { LoadoutService } from '../equipment/loadout-service.js';
import { resolveSkillMpCost } from '../card/card-generator.js';
import {
  CardProgressionService,
  formatCardExpResult,
  getDungeonCardExp,
} from '../card/card-progression.service.js';
import { DungeonRunner } from '../dungeon/dungeon-runner.js';
import { DungeonBattleSession } from '../dungeon/dungeon-battle-session.js';
import { SeasonalAffixHandler } from '../dungeon/seasonal-affixes.js';
import type { Combatant } from '../combat/types.js';

describe('Card progression & real skill MP cost (STORY-150)', () => {
  describe('getDungeonCardExp', () => {
    it('doubles first clears, gives 20% on real defeats and nothing on forfeits', () => {
      expect(getDungeonCardExp(1, { victory: true, isFirstClear: true, forfeited: false })).toBe(
        130,
      );
      expect(getDungeonCardExp(1, { victory: true, isFirstClear: false, forfeited: false })).toBe(
        65,
      );
      expect(getDungeonCardExp(10, { victory: false, isFirstClear: false, forfeited: false })).toBe(
        58,
      );
      expect(getDungeonCardExp(10, { victory: false, isFirstClear: false, forfeited: true })).toBe(
        0,
      );
    });
  });

  describe('resolveSkillMpCost', () => {
    it('reads the cost from the skill description and falls back to the element default', () => {
      expect(resolveSkillMpCost('Costs 35 MP. Deals 170% Fire ATK.', 'FIRE')).toBe(35);
      expect(resolveSkillMpCost(null, 'LIGHT')).toBe(45);
      expect(resolveSkillMpCost('Deals big damage.', 'EARTH')).toBe(30);
    });
  });

  describe('with a database', () => {
    let client: SqliteDatabaseClient;
    let cardRepo: WaifuCardRepository;
    let itemRepo: GameItemRepository;
    let inventoryRepo: UserInventoryItemRepository;

    async function createCard(rarity: string, level = 1, exp = 0): Promise<UserCard> {
      const card = await cardRepo.create({
        assetId: 'asset_x',
        name: 'Shana',
        rarity,
        element: 'FIRE',
        attack: 200,
        defense: 100,
        speed: 50,
        health: 1000,
        critRate: 0.1,
        skillName: 'Inferno Burst',
        skillDescription: 'Costs 35 MP. Deals 170% Fire ATK and applies Burn for 2 turns.',
        collectionNumber: 1,
      });
      const userCard = await cardRepo.createUserCard({
        userId: 'u1',
        cardId: card.id,
        serialNumber: 1,
        state: 'EQUIPPED',
      });
      if (level !== 1 || exp !== 0) {
        return (await cardRepo.updateUserCardLevelAndExp(userCard.id, level, exp))!;
      }
      return userCard;
    }

    beforeEach(async () => {
      const raw = await createDatabaseClient({
        dialect: 'sqlite',
        url: ':memory:',
        autoMigrate: true,
      });
      if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
      client = raw;
      cardRepo = new WaifuCardRepository(client);
      itemRepo = new GameItemRepository(client);
      inventoryRepo = new UserInventoryItemRepository(client);
      for (const item of CANONICAL_ITEMS) await itemRepo.create(item);
    });

    afterEach(async () => {
      await client.close();
    });

    it('levels a card up and caps it at the rarity max level', async () => {
      const progression = new CardProgressionService(cardRepo);
      const fresh = await createCard('COMMON');

      const result = await progression.grantExp(fresh.id, 400);
      expect(result).toMatchObject({
        previousLevel: 1,
        newLevel: 3,
        levelsGained: 2,
        expGained: 400,
      });
      expect(formatCardExpResult(result!)).toContain('Lv.1 → Lv.3');
      expect((await cardRepo.findUserCardById(fresh.id))?.level).toBe(3);

      const maxed = await createCard('COMMON', 20);
      const capped = await progression.grantExp(maxed.id, 5000);
      expect(capped).toMatchObject({ newLevel: 20, expGained: 0, isMaxLevel: true });
    });

    it('builds combatants with level scaling, the real skill MP cost and equipped gear', async () => {
      const userCard = await createCard('COMMON', 11);
      const blade = await new ItemGrantService(itemRepo, inventoryRepo).grant(
        'u1',
        'WEAPON_NOVICE_BLADE',
        1,
        'TEST',
      );
      await inventoryRepo.equipToCard('u1', blade!.inventoryItems[0]!.id, userCard.id, 'WEAPON');

      const loadout = new LoadoutService(
        itemRepo,
        inventoryRepo,
        cardRepo,
        new EnhancementService(itemRepo, inventoryRepo),
      );
      const [combatant] = await loadout.buildActiveParty('u1', 'TEAM_A');

      expect(combatant?.skillManaCost).toBe(35);
      expect(combatant?.maxHealth).toBe(1200); // 1000 × (1 + 10 × 2%)
      expect(combatant?.attack).toBe(240 + 25); // level-scaled ATK + Novice Blade
    });

    it('grants card EXP when a dungeon battle is finalized, but not for forfeits', async () => {
      const userCard = await createCard('COMMON');
      const runner = new DungeonRunner(
        new PlayerEnergyRepository(client),
        new UserDungeonProgressRepository(client),
        {
          cardRepo,
          cardProgression: new CardProgressionService(cardRepo),
        },
      );

      const player: Combatant = {
        id: userCard.id,
        name: 'Shana',
        team: 'TEAM_A',
        element: 'FIRE',
        rarity: 'COMMON',
        level: 1,
        maxHealth: 1000,
        currentHealth: 1000,
        attack: 5000,
        defense: 100,
        speed: 99,
        critRate: 0,
        critDamage: 1.5,
        maxMp: 100,
        currentMp: 0,
        skillManaCost: 35,
        shield: 0,
        statusEffects: [],
        perks: [],
        hasUsedPhoenixWard: false,
        isAlive: true,
      };
      const boss: Combatant = {
        ...player,
        id: 'boss',
        name: 'Dummy',
        team: 'TEAM_B',
        attack: 1,
        maxHealth: 10,
        currentHealth: 10,
        speed: 1,
      };
      const newSession = () =>
        new DungeonBattleSession({
          floorNumber: 1,
          seasonId: 's1',
          userId: 'u1',
          playerCard: player,
          boss,
          affixHandler: new SeasonalAffixHandler('NONE'),
          rng: () => 0.99,
        });

      const won = newSession();
      won.start();
      won.executeTurn('ATTACK');
      const winResult = await runner.finalizeBattleResult(won, { energySpent: 0 });
      expect(winResult.victory).toBe(true);
      expect(winResult.cardExp[0]).toMatchObject({ expGained: 130, newLevel: 2 });

      const surrendered = newSession();
      surrendered.start();
      surrendered.forfeit();
      const forfeitResult = await runner.finalizeBattleResult(surrendered, { energySpent: 0 });
      expect(forfeitResult.cardExp).toEqual([]);
    });
  });
});
