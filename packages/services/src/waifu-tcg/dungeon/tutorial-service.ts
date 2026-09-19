import type {
  UserDungeonProgressRepository,
  WaifuCardRepository,
  UserInventoryItemRepository,
  GameItemRepository,
} from '@ririko/database';
import type { Combatant } from '../combat/types.js';

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

  constructor(
    progressRepo: UserDungeonProgressRepository,
    options: {
      cardRepo?: WaifuCardRepository | undefined;
      inventoryRepo?: UserInventoryItemRepository | undefined;
      itemRepo?: GameItemRepository | undefined;
    } = {},
  ) {
    this.progressRepo = progressRepo;
    this.cardRepo = options.cardRepo;
    this.inventoryRepo = options.inventoryRepo;
    this.itemRepo = options.itemRepo;
  }

  public getTutorialFloor(floorNumber: number): TutorialFloorInfo | null {
    return TUTORIAL_FLOORS.find((f) => f.floorNumber === floorNumber) ?? null;
  }

  public getAllTutorialFloors(): readonly TutorialFloorInfo[] {
    return TUTORIAL_FLOORS;
  }

  /**
   * Completes the prologue tutorial and grants starter rewards:
   * Fixed starter waifu card, Novice Blade (Common), 3x Minor HP Potions, unlocks TUTORIAL_COMPLETE.
   */
  public async completeTutorial(userId: string): Promise<TutorialCompletionResult> {
    const seasonId = 'season_tutorial';
    const progress = await this.progressRepo.getOrCreateProgress(userId, seasonId);

    const isFirstTime = progress.highestClearedFloor < 4;

    if (isFirstTime) {
      await this.progressRepo.recordFloorAttempt(userId, seasonId, 4, true);

      // Grant starter equipment (Novice Blade) & potions if inventory repository is provided
      if (this.inventoryRepo) {
        // Novice Blade
        await this.inventoryRepo.create({
          userId,
          itemId: 'item_novice_blade',
          slot: 'WEAPON',
          obtainedFrom: 'TUTORIAL',
          state: 'IDLE',
        });

        // 3x Minor HP Potions
        for (let i = 0; i < 3; i++) {
          await this.inventoryRepo.create({
            userId,
            itemId: 'potion_hp_minor',
            slot: 'CONSUMABLE',
            obtainedFrom: 'TUTORIAL',
            state: 'IDLE',
          });
        }
      }

      if (this.cardRepo) {
        await this.cardRepo.createUserCard({
          userId,
          cardId: 'starter_waifu_01',
          serialNumber: 1,
        });
      }

      return {
        success: true,
        isFirstCompletion: true,
        starterCardId: 'starter_waifu_01',
        starterCardName: 'Flame Novice Aria [FIRE]',
        equipmentGranted: 'Novice Blade (Common Weapon, +20 ATK)',
        consumablesGranted: '3x Minor HP Potions (+250 HP)',
        achievementCode: 'TUTORIAL_COMPLETE',
        message:
          '🎉 **Tutorial Prologue Completed!** You have mastered Elemental Resonance, Skills, Consumables, and Shield Wards!\n' +
          '🎁 **Starter Rewards Dispatched:**\n' +
          '• **Card:** Flame Novice Aria [FIRE]\n' +
          '• **Weapon:** Novice Blade (+20 ATK)\n' +
          '• **Consumables:** 3x Minor HP Potions\n' +
          '• **Achievement Unlocked:** `TUTORIAL_COMPLETE`',
      };
    }

    return {
      success: true,
      isFirstCompletion: false,
      achievementCode: 'TUTORIAL_COMPLETE',
      message: 'You have already completed the Tutorial Prologue!',
    };
  }
}
