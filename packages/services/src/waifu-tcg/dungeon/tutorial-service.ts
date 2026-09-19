import type {
  UserDungeonProgressRepository,
  WaifuCardRepository,
  UserInventoryItemRepository,
  GameItemRepository,
  WaifuAssetRepository,
  UserCard,
} from '@ririko/database';
import type { Combatant } from '../combat/types.js';
import type { AchievementService } from '../achievements/achievement-service.js';
import { STARTER_POOL_TAG } from '../catalog/card-catalog.js';

export interface TutorialFloorInfo {
  floorId: string;
  floorNumber: number;
  title: string;
  topic: string;
  description: string;
  guideMessage: string;
  dummyEnemy: Combatant;
}

export interface TutorialCompletionResult {
  success: boolean;
  isFirstCompletion: boolean;
  starterCardId?: string;
  starterCardName?: string;
  equipmentGranted?: string;
  consumablesGranted?: string;
  achievementCode: string;
  message: string;
}

export const TUTORIAL_FLOORS: readonly TutorialFloorInfo[] = Object.freeze([
  {
    floorId: 'T1',
    floorNumber: 1,
    title: 'Floor T1: Elemental Resonance',
    topic: 'Elemental Multipliers',
    description: 'Learn the 7-element counter loop (Fire > Ice > Earth > Lightning > Water > Fire).',
    guideMessage: 'Striking with an advantageous element deals 1.5x damage! Counter the training dummy with resonant strikes.',
    dummyEnemy: {
      id: 'dummy_t1',
      name: 'Training Automaton [ICE]',
      team: 'TEAM_B',
      element: 'ICE',
      rarity: 'COMMON',
      level: 1,
      maxHealth: 500,
      currentHealth: 500,
      attack: 30,
      defense: 20,
      speed: 15,
      critRate: 0,
      critDamage: 1.5,
      maxMp: 0,
      currentMp: 0,
      skillManaCost: 0,
      shield: 0,
      statusEffects: [],
      perks: [],
      hasUsedPhoenixWard: false,
      isAlive: true,
    },
  },
  {
    floorId: 'T2',
    floorNumber: 2,
    title: 'Floor T2: Mana & Active Skills',
    topic: 'MP Management & Tactical Skills',
    description: 'Demonstrates card MP consumption and tactical active skill execution.',
    guideMessage: 'Every basic attack generates MP. When MP is full, your card automatically unleashes its signature tactical skill!',
    dummyEnemy: {
      id: 'dummy_t2',
      name: 'Reinforced Dummy [EARTH]',
      team: 'TEAM_B',
      element: 'EARTH',
      rarity: 'COMMON',
      level: 2,
      maxHealth: 800,
      currentHealth: 800,
      attack: 50,
      defense: 40,
      speed: 20,
      critRate: 0.05,
      critDamage: 1.5,
      maxMp: 50,
      currentMp: 0,
      skillManaCost: 30,
      shield: 0,
      statusEffects: [],
      perks: [],
      hasUsedPhoenixWard: false,
      isAlive: true,
    },
  },
  {
    floorId: 'T3',
    floorNumber: 3,
    title: 'Floor T3: Consumables & Survival',
    topic: 'HP & MP Potions',
    description: 'Introduces battle consumables and tactical survival.',
    guideMessage: 'Potions restore health and mana during intense battles. Equip potions in your loadout to sustain against formidable foes.',
    dummyEnemy: {
      id: 'dummy_t3',
      name: 'Aggressive Sparring Bot [LIGHTNING]',
      team: 'TEAM_B',
      element: 'LIGHTNING',
      rarity: 'UNCOMMON',
      level: 3,
      maxHealth: 1200,
      currentHealth: 1200,
      attack: 85,
      defense: 50,
      speed: 30,
      critRate: 0.1,
      critDamage: 1.5,
      maxMp: 50,
      currentMp: 20,
      skillManaCost: 25,
      shield: 0,
      statusEffects: [],
      perks: [],
      hasUsedPhoenixWard: false,
      isAlive: true,
    },
  },
  {
    floorId: 'T4',
    floorNumber: 4,
    title: 'Floor T4: Boss Break Shields',
    topic: 'Multi-Elemental Barrier Breaking',
    description: 'Break through multi-elemental barrier layers on an elite training dummy.',
    guideMessage: 'High-floor dungeon bosses possess Elemental Wards! Attacks with non-matching elements deal ZERO damage. Strike with the matching element to shatter their barrier!',
    dummyEnemy: {
      id: 'dummy_t4',
      name: 'Warded Guardian Automaton [FIRE]',
      team: 'TEAM_B',
      element: 'FIRE',
      rarity: 'RARE',
      level: 5,
      maxHealth: 1500,
      currentHealth: 1500,
      attack: 110,
      defense: 70,
      speed: 25,
      critRate: 0.1,
      critDamage: 1.5,
      maxMp: 100,
      currentMp: 30,
      skillManaCost: 35,
      shield: 0,
      statusEffects: [],
      perks: [],
      hasUsedPhoenixWard: false,
      isAlive: true,
    },
  },
]);

export class TutorialService {
  private readonly progressRepo: UserDungeonProgressRepository;
  private readonly cardRepo: WaifuCardRepository | undefined;
  private readonly inventoryRepo: UserInventoryItemRepository | undefined;
  private readonly itemRepo: GameItemRepository | undefined;
  private readonly assetRepo: WaifuAssetRepository | undefined;
  private readonly achievementService: AchievementService | undefined;
  private readonly randomFn: () => number;

  constructor(
    progressRepo: UserDungeonProgressRepository,
    options: {
      cardRepo?: WaifuCardRepository | undefined;
      inventoryRepo?: UserInventoryItemRepository | undefined;
      itemRepo?: GameItemRepository | undefined;
      assetRepo?: WaifuAssetRepository | undefined;
      achievementService?: AchievementService | undefined;
      randomFn?: (() => number) | undefined;
    } = {},
  ) {
    this.progressRepo = progressRepo;
    this.cardRepo = options.cardRepo;
    this.inventoryRepo = options.inventoryRepo;
    this.itemRepo = options.itemRepo;
    this.assetRepo = options.assetRepo;
    this.achievementService = options.achievementService;
    this.randomFn = options.randomFn ?? Math.random;
  }

  public getTutorialFloor(floorNumber: number): TutorialFloorInfo | null {
    return TUTORIAL_FLOORS.find((f) => f.floorNumber === floorNumber) ?? null;
  }

  public getAllTutorialFloors(): readonly TutorialFloorInfo[] {
    return TUTORIAL_FLOORS;
  }

  /**
   * Ensures the user has a starter waifu card equipped.
   * If the user has no cards, grants a random card from the starter pool (assets tagged
   * `starter_pool`, generated by `pnpm tcg:card-builder --starters`). With an empty pool it
   * falls back to Flame Novice Aria [FIRE] (starter_waifu_01).
   */
  public async ensureStarterCard(userId: string): Promise<UserCard | null> {
    if (!this.cardRepo) return null;

    // 1. Check if user already has cards
    const userCards = await this.cardRepo.listUserCards(userId);
    if (userCards.length > 0) {
      const equipped = userCards.find((c) => c.state === 'EQUIPPED');
      if (!equipped && userCards[0]) {
        await this.cardRepo.updateUserCardState(userCards[0].id, 'EQUIPPED');
        return { ...userCards[0], state: 'EQUIPPED' };
      }
      return equipped ?? userCards[0]!;
    }

    // 2. Prefer a random card from the generated starter pool
    const pooledCardId = await this.pickStarterPoolCardId();
    if (pooledCardId) {
      return this.cardRepo.createUserCard({
        userId,
        cardId: pooledCardId,
        serialNumber: (await this.cardRepo.getHighestSerialNumber(pooledCardId)) + 1,
        state: 'EQUIPPED',
      });
    }

    // 3. Fallback: ensure base starter card exists in waifu_cards
    let baseCard = await this.cardRepo.findById('starter_waifu_01');
    if (!baseCard) {
      let assetId = 'asset_starter_aria';
      if (this.assetRepo) {
        const assets = await this.assetRepo.findActiveAssets(1, 0);
        if (assets.length > 0 && assets[0]) {
          assetId = assets[0].id;
        } else {
          try {
            const created = await this.assetRepo.create({
              id: 'asset_starter_aria',
              sourceId: 'WAIFU_IM',
              sourceImageId: 'starter_aria',
              characterName: 'Flame Novice Aria',
              animeTitle: 'Ririko Academy',
              imageHash: '0000000000000000000000000000000000000000000000000000000000000000',
              localStoragePath: '/assets/waifu-cards/starter_aria.png',
              tags: ['starter', 'fire', 'novice'],
            });
            assetId = created.id;
          } catch {
            // Fallback if already exists or table structure differs
          }
        }
      }

      try {
        baseCard = await this.cardRepo.create({
          id: 'starter_waifu_01',
          assetId,
          name: 'Flame Novice Aria',
          rarity: 'COMMON',
          element: 'FIRE',
          attack: 120,
          defense: 80,
          speed: 95,
          health: 600,
          critRate: 0.05,
          skillName: 'Ignite Slash',
          skillDescription: 'Strikes enemy with fiery blade dealing 140% ATK damage.',
          passiveName: 'Warm Up',
          passiveDescription: 'Increases ATK by 5% in battle.',
          collectionNumber: 1,
          isActive: true,
        });
      } catch {
        // May already exist
      }
    }

    // 4. Grant card to user in EQUIPPED state
    return this.cardRepo.createUserCard({
      userId,
      cardId: 'starter_waifu_01',
      serialNumber: 1,
      state: 'EQUIPPED',
    });
  }

  /** Random active card from the starter pool, or null when the pool is empty. */
  private async pickStarterPoolCardId(): Promise<string | null> {
    if (!this.assetRepo || !this.cardRepo) return null;
    const assets = [...(await this.assetRepo.findActiveAssetsByTag(STARTER_POOL_TAG))];
    while (assets.length > 0) {
      const [asset] = assets.splice(Math.floor(this.randomFn() * assets.length), 1);
      const card = await this.cardRepo.findByAssetId(asset!.id);
      if (card?.isActive) return card.id;
    }
    return null;
  }

  /**
   * Completes the prologue tutorial and grants starter rewards:
   * Random starter waifu card (from the starter pool), Novice Blade (Common), 3x Minor HP Potions, unlocks TUTORIAL_COMPLETE.
   */
  public async completeTutorial(userId: string): Promise<TutorialCompletionResult> {
    const seasonId = 'season_tutorial';
    const progress = await this.progressRepo.getOrCreateProgress(userId, seasonId);

    const isFirstTime = progress.highestClearedFloor < 4;

    if (isFirstTime) {
      await this.progressRepo.recordFloorAttempt(userId, seasonId, 4, true);

      // Grant starter equipment (Novice Blade) & potions if inventory repository is provided
      if (this.inventoryRepo) {
        const inventory = await this.inventoryRepo.findByUser(userId);
        const hasBlade = inventory.some((i) => i.itemId === 'item_novice_blade');
        if (!hasBlade) {
          await this.inventoryRepo.create({
            userId,
            itemId: 'item_novice_blade',
            slot: 'WEAPON',
            obtainedFrom: 'TUTORIAL',
            state: 'IDLE',
          });
        }

        const potions = inventory.filter((i) => i.itemId === 'potion_hp_minor');
        const potionsNeeded = Math.max(0, 3 - potions.length);
        for (let i = 0; i < potionsNeeded; i++) {
          await this.inventoryRepo.create({
            userId,
            itemId: 'potion_hp_minor',
            slot: 'CONSUMABLE',
            obtainedFrom: 'TUTORIAL',
            state: 'IDLE',
          });
        }
      }

      const starter = await this.ensureStarterCard(userId);
      const starterCard = starter ? await this.cardRepo?.findById(starter.cardId) : null;
      const starterCardName = starterCard
        ? `${starterCard.name} [${starterCard.element}]`
        : 'Flame Novice Aria [FIRE]';

      if (this.achievementService) {
        try {
          await this.achievementService.recordProgress(userId, 'TUTORIAL_CLEARED', 4, true);
        } catch {
          // Ignore in tests if achievement service not fully configured
        }
      }

      return {
        success: true,
        isFirstCompletion: true,
        starterCardId: starter?.cardId ?? 'starter_waifu_01',
        starterCardName,
        equipmentGranted: 'Novice Blade (Common Weapon, +20 ATK)',
        consumablesGranted: '3x Minor HP Potions (+250 HP)',
        achievementCode: 'TUTORIAL_COMPLETE',
        message:
          '🎉 **Tutorial Prologue Completed!** You have mastered Elemental Resonance, Skills, Consumables, and Shield Wards!\n' +
          '🎁 **Starter Rewards Dispatched:**\n' +
          `• **Card:** ${starterCardName}\n` +
          '• **Weapon:** Novice Blade (+20 ATK)\n' +
          '• **Consumables:** 3x Minor HP Potions\n' +
          '• **Achievement Unlocked:** `TUTORIAL_COMPLETE`',
      };
    }

    // Even if already completed, make sure user has their starter card
    await this.ensureStarterCard(userId);

    return {
      success: true,
      isFirstCompletion: false,
      achievementCode: 'TUTORIAL_COMPLETE',
      message: 'You have already completed the Tutorial Prologue!',
    };
  }
}
