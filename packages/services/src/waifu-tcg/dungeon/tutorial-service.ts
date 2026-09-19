import type {
  UserDungeonProgressRepository,
  WaifuCardRepository,
  UserInventoryItemRepository,
  GameItemRepository,
  GameItem,
  WaifuAssetRepository,
  UserCard,
  WaifuCard,
  TcgConfigRepository,
} from '@ririko/database';
import type { Combatant } from '../combat/types.js';
import type { AchievementService } from '../achievements/achievement-service.js';
import type { CardElement } from '../types.js';
import { ItemGrantService } from '../equipment/item-grant.service.js';

/** Rough combat power of a card, used to rank starter candidates. */
function starterPower(card: WaifuCard): number {
  return card.attack * 2 + card.defense + card.health / 5 + card.speed;
}

const STARTER_WEAPON_CODE = 'WEAPON_NOVICE_BLADE';
const STARTER_POTION_CODE = 'POTION_MINOR_HP';
const STARTER_POTION_COUNT = 3;

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
  starterCardId?: string | undefined;
  starterCardName?: string | undefined;
  equipmentGranted?: string | undefined;
  consumablesGranted?: string | undefined;
  achievementCode: string;
  message: string;
}

export interface TutorialFloor4Metadata {
  bossElement: CardElement;
  counterCardGiven: boolean;
  counterCardId?: string;
  userCardId?: string;
  grantedAt?: number;
}

export interface Floor4DefeatResult {
  bossElement: CardElement;
  counterCard: WaifuCard | null;
  userCard: UserCard | null;
  isNewGrant: boolean;
  alreadyOwned: boolean;
  alreadyEquipped?: boolean | undefined;
}

/**
 * Returns the element that counters (has advantage against) the given element.
 * Loop:
 * - Fire melts Ice (Fire > Ice, so Ice is countered by Fire)
 * - Ice freezes Earth (Ice > Earth, so Earth is countered by Ice)
 * - Earth grounds Lightning (Earth > Lightning, so Lightning is countered by Earth)
 * - Lightning shocks Water (Lightning > Water, so Water is countered by Lightning)
 * - Water extinguishes Fire (Water > Fire, so Fire is countered by Water)
 * - Light and Shadow counter each other
 */
export function getCounterElement(element: CardElement): CardElement {
  switch (element) {
    case 'FIRE':
      return 'WATER';
    case 'WATER':
      return 'LIGHTNING';
    case 'LIGHTNING':
      return 'EARTH';
    case 'EARTH':
      return 'ICE';
    case 'ICE':
      return 'FIRE';
    case 'LIGHT':
      return 'SHADOW';
    case 'SHADOW':
      return 'LIGHT';
    default:
      return 'WATER';
  }
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
      maxHealth: 400,
      currentHealth: 400,
      attack: 25,
      defense: 15,
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
      maxHealth: 500,
      currentHealth: 500,
      attack: 35,
      defense: 20,
      speed: 15,
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
      maxHealth: 650,
      currentHealth: 650,
      attack: 45,
      defense: 30,
      speed: 20,
      critRate: 0.05,
      critDamage: 1.5,
      maxMp: 50,
      currentMp: 0,
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
      name: 'Warded Guardian Automaton [WATER]',
      team: 'TEAM_B',
      element: 'WATER',
      rarity: 'RARE',
      level: 5,
      maxHealth: 400,
      currentHealth: 400,
      attack: 40,
      defense: 25,
      speed: 15,
      critRate: 0.05,
      critDamage: 1.5,
      maxMp: 100,
      currentMp: 0,
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
  private readonly grants: ItemGrantService | undefined;
  private readonly assetRepo: WaifuAssetRepository | undefined;
  private readonly tcgConfigRepo: TcgConfigRepository | undefined;
  private readonly achievementService: AchievementService | undefined;
  private readonly randomFn: () => number;

  constructor(
    progressRepo: UserDungeonProgressRepository,
    options: {
      cardRepo?: WaifuCardRepository | undefined;
      inventoryRepo?: UserInventoryItemRepository | undefined;
      itemRepo?: GameItemRepository | undefined;
      assetRepo?: WaifuAssetRepository | undefined;
      tcgConfigRepo?: TcgConfigRepository | undefined;
      achievementService?: AchievementService | undefined;
      randomFn?: (() => number) | undefined;
    } = {},
  ) {
    this.progressRepo = progressRepo;
    this.cardRepo = options.cardRepo;
    this.inventoryRepo = options.inventoryRepo;
    this.grants =
      options.itemRepo && options.inventoryRepo
        ? new ItemGrantService(options.itemRepo, options.inventoryRepo)
        : undefined;
    this.assetRepo = options.assetRepo;
    this.tcgConfigRepo = options.tcgConfigRepo;
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
   * Uses real COMMON cards existing in the database as starter candidates.
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

    // 2. Pick any existing COMMON card from the database
    let candidates = await this.cardRepo.listCards({
      rarity: 'COMMON',
      isActive: true,
      limit: 100,
    });

    // Fallback: any active card in database
    if (candidates.length === 0) {
      candidates = await this.cardRepo.listCards({
        isActive: true,
        limit: 100,
      });
    }

    if (candidates.length === 0) {
      return null;
    }

    // Starter guarantee: pick from the stronger half, so a low roll never strands a new player.
    const byPower = [...candidates].sort((a, b) => starterPower(b) - starterPower(a));
    const pool = byPower.slice(0, Math.max(1, Math.ceil(byPower.length / 2)));
    const chosen = pool[Math.floor(this.randomFn() * pool.length)]!;
    const serialNumber = (await this.cardRepo.getHighestSerialNumber(chosen.id)) + 1;

    return this.cardRepo.createUserCard({
      userId,
      cardId: chosen.id,
      serialNumber,
      state: 'EQUIPPED',
    });
  }

  /**
   * Resolves Floor T4 boss configuration for a specific user.
   * If the user already has saved Floor T4 metadata, retains that boss element so the boss
   * does not continuously shift when the player equips the counter card.
   * Otherwise, calculates the counter element to the player's active card and persists it.
   */
  public async getFloor4BossConfig(
    userId: string,
    playerElement: CardElement,
  ): Promise<{ element: CardElement; name: string }> {
    const configKey = `tutorial:floor4:${userId}`;
    if (this.tcgConfigRepo) {
      try {
        const existing = await this.tcgConfigRepo.getConfig<TutorialFloor4Metadata>(configKey);
        if (existing?.bossElement) {
          return {
            element: existing.bossElement,
            name: `Warded Guardian Automaton [${existing.bossElement}]`,
          };
        }
      } catch {
        // Ignore read errors, proceed to compute
      }
    }

    const counterElement = getCounterElement(playerElement);
    if (this.tcgConfigRepo) {
      try {
        await this.tcgConfigRepo.setConfig<TutorialFloor4Metadata>(
          configKey,
          { bossElement: counterElement, counterCardGiven: false },
          'system',
        );
      } catch {
        // Ignore write errors
      }
    }

    return {
      element: counterElement,
      name: `Warded Guardian Automaton [${counterElement}]`,
    };
  }

  /**
   * Handles defeat on Floor T4.
   * Grants a real COMMON card of the boss's element from existing database cards,
   * updating metadata so duplicate cards are not granted on repeated losses.
   */
  public async handleTutorialFloor4Defeat(
    userId: string,
    bossElement: CardElement,
  ): Promise<Floor4DefeatResult> {
    const configKey = `tutorial:floor4:${userId}`;
    let metadata: TutorialFloor4Metadata | null = null;
    if (this.tcgConfigRepo) {
      try {
        metadata = await this.tcgConfigRepo.getConfig<TutorialFloor4Metadata>(configKey);
      } catch {
        // Ignore
      }
    }

    // 1. If card was marked as given, verify that the user still actually owns a card of bossElement
    if (metadata?.counterCardGiven && this.cardRepo) {
      let userCard: UserCard | null = null;
      if (metadata.userCardId) {
        const found = await this.cardRepo.findUserCardById(metadata.userCardId);
        if (found && found.userId === userId) {
          userCard = found;
        }
      }

      // Fallback: check if the user owns any other card of bossElement
      if (!userCard) {
        const userCards = await this.cardRepo.listUserCards(userId);
        for (const uc of userCards) {
          const card = await this.cardRepo.findById(uc.cardId);
          if (card && card.element === bossElement) {
            userCard = uc;
            break;
          }
        }
      }

      // If user genuinely owns a counter card, don't duplicate
      if (userCard) {
        const baseCard = await this.cardRepo.findById(userCard.cardId);
        const alreadyEquipped = userCard.state === 'EQUIPPED';
        return {
          bossElement: metadata.bossElement ?? bossElement,
          counterCard: baseCard,
          userCard,
          isNewGrant: false,
          alreadyOwned: true,
          alreadyEquipped,
        };
      }
    }

    // 2. Otherwise, find a real COMMON card of bossElement in database
    if (!this.cardRepo) {
      return {
        bossElement,
        counterCard: null,
        userCard: null,
        isNewGrant: false,
        alreadyOwned: false,
      };
    }

    let candidates = await this.cardRepo.listCards({
      rarity: 'COMMON',
      element: bossElement,
      isActive: true,
      limit: 50,
    });

    // Fallback: any card of that element
    if (candidates.length === 0) {
      candidates = await this.cardRepo.listCards({
        element: bossElement,
        isActive: true,
        limit: 50,
      });
    }

    // Fallback: any COMMON card in database
    if (candidates.length === 0) {
      candidates = await this.cardRepo.listCards({
        rarity: 'COMMON',
        isActive: true,
        limit: 50,
      });
    }

    if (candidates.length === 0) {
      return {
        bossElement,
        counterCard: null,
        userCard: null,
        isNewGrant: false,
        alreadyOwned: false,
      };
    }

    const chosen = candidates[Math.floor(this.randomFn() * candidates.length)]!;
    const nextSerial = (await this.cardRepo.getHighestSerialNumber(chosen.id)) + 1;
    const userCard = await this.cardRepo.createUserCard({
      userId,
      cardId: chosen.id,
      serialNumber: nextSerial,
      state: 'IDLE',
    });

    if (this.tcgConfigRepo) {
      try {
        await this.tcgConfigRepo.setConfig<TutorialFloor4Metadata>(
          configKey,
          {
            bossElement,
            counterCardGiven: true,
            counterCardId: chosen.id,
            userCardId: userCard.id,
            grantedAt: Date.now(),
          },
          'system',
        );
      } catch {
        // Ignore
      }
    }

    return {
      bossElement,
      counterCard: chosen,
      userCard,
      isNewGrant: true,
      alreadyOwned: false,
      alreadyEquipped: userCard.state === 'EQUIPPED',
    };
  }

  /**
   * Ensures the user has at least 1x Minor HP Potion and 1x Mana Draught during Floor T3 (Consumables tutorial).
   */
  public async ensureFloor3Potions(
    userId: string,
  ): Promise<{ granted: boolean; hpPotionGranted: boolean; manaPotionGranted: boolean }> {
    if (!this.inventoryRepo || !this.grants) {
      return { granted: false, hpPotionGranted: false, manaPotionGranted: false };
    }

    const userInventory = await this.inventoryRepo.findByUser(userId, { state: 'IDLE' });
    const grantIfMissing = async (code: string): Promise<boolean> => {
      const item = await this.grants!.resolveItem(code);
      if (!item || userInventory.some((i) => i.itemId === item.id && i.quantity > 0)) return false;
      await this.grants!.grantItem(userId, item, 1, 'TUTORIAL');
      return true;
    };

    const hpPotionGranted = await grantIfMissing('POTION_MINOR_HP');
    const manaPotionGranted = await grantIfMissing('POTION_MANA_DRAUGHT');

    return {
      granted: hpPotionGranted || manaPotionGranted,
      hpPotionGranted,
      manaPotionGranted,
    };
  }

  /**
   * Grants 10 bonus potions (5x Minor HP + 5x Mana Draught) upon winning Floor T3 for the first time.
   */
  public async handleTutorialFloor3Victory(
    userId: string,
  ): Promise<{ granted: boolean; message?: string }> {
    if (!this.grants) return { granted: false };

    const configKey = `tutorial:floor3:potions_reward:${userId}`;
    if (this.tcgConfigRepo) {
      const existing = await this.tcgConfigRepo.getConfig(configKey);
      if (existing) {
        return { granted: false };
      }
    }

    await this.grants.grant(userId, 'POTION_MINOR_HP', 5, 'TUTORIAL');
    await this.grants.grant(userId, 'POTION_MANA_DRAUGHT', 5, 'TUTORIAL');

    if (this.tcgConfigRepo) {
      try {
        await this.tcgConfigRepo.setConfig(configKey, { grantedAt: Date.now() }, 'system');
      } catch {
        // Ignore
      }
    }

    return {
      granted: true,
      message: '🎁 **Tutorial Floor T3 Bonus**: Received 5x Minor HP Potions and 5x Mana Draughts (10 Potions)!',
    };
  }

  /**
   * Checks whether the user can challenge a specific tutorial floor.
   * Tutorial floors (1 to 4) cannot be repeated once cleared.
   */
  public async canAttemptTutorialFloor(
    userId: string,
    floorNumber: number,
  ): Promise<{ allowed: boolean; reason?: 'ALREADY_CLEARED' | 'LOCKED'; nextFloor?: number }> {
    const progress = await this.progressRepo.getOrCreateProgress(userId, 'season_tutorial');
    if (progress.highestClearedFloor >= floorNumber) {
      return {
        allowed: false,
        reason: 'ALREADY_CLEARED',
        nextFloor: Math.min(4, progress.highestClearedFloor + 1),
      };
    }
    if (floorNumber > progress.highestClearedFloor + 1) {
      return {
        allowed: false,
        reason: 'LOCKED',
        nextFloor: progress.highestClearedFloor + 1,
      };
    }
    return { allowed: true };
  }

  /**
   * Grants the starter weapon (once) and starter potions, and equips the weapon on the
   * starter card when that card's weapon slot is empty.
   */
  private async grantStarterGear(
    userId: string,
    starter: UserCard | null,
  ): Promise<{ weapon: GameItem | null; weaponEquipped: boolean; potion: GameItem | null; potionsGranted: number }> {
    if (!this.grants || !this.inventoryRepo) {
      return { weapon: null, weaponEquipped: false, potion: null, potionsGranted: 0 };
    }

    const weapon = await this.grants.resolveItem(STARTER_WEAPON_CODE);
    let weaponEquipped = false;
    if (weapon) {
      const owned = await this.inventoryRepo.findByUser(userId);
      const bladeRow =
        owned.find((i) => i.itemId === weapon.id) ??
        (await this.grants.grantItem(userId, weapon, 1, 'TUTORIAL')).inventoryItems[0];
      if (bladeRow?.state === 'EQUIPPED') {
        weaponEquipped = true;
      } else if (bladeRow && starter && !(await this.inventoryRepo.findCardSlot(starter.id, 'WEAPON'))) {
        await this.inventoryRepo.equipToCard(userId, bladeRow.id, starter.id, 'WEAPON');
        weaponEquipped = true;
      }
    }

    const potion = await this.grants.resolveItem(STARTER_POTION_CODE);
    if (potion) await this.grants.grantItem(userId, potion, STARTER_POTION_COUNT, 'TUTORIAL');

    return { weapon, weaponEquipped, potion, potionsGranted: potion ? STARTER_POTION_COUNT : 0 };
  }

  /**
   * Completes the prologue tutorial and grants starter rewards:
   * Novice Blade (Common), 3x Minor HP Potions, unlocks TUTORIAL_COMPLETE.
   * Cleans up Floor T4 tutorial metadata.
   */
  public async completeTutorial(userId: string): Promise<TutorialCompletionResult> {
    const seasonId = 'season_tutorial';
    const progress = await this.progressRepo.getOrCreateProgress(userId, seasonId);

    // Clean up Floor 4 metadata upon clearing tutorial
    if (this.tcgConfigRepo) {
      try {
        await this.tcgConfigRepo.delete(`tutorial:floor4:${userId}`);
      } catch {
        // Ignore
      }
    }

    const isFirstTime = progress.highestClearedFloor < 4;

    if (isFirstTime) {
      await this.progressRepo.recordFloorAttempt(userId, seasonId, 4, true);

      const starter = await this.ensureStarterCard(userId);
      const gear = await this.grantStarterGear(userId, starter);
      const starterCard = starter ? await this.cardRepo?.findById(starter.cardId) : null;
      const starterCardName = starterCard
        ? `${starterCard.name} [${starterCard.element}]`
        : 'Waifu Vanguard';

      const equipmentGranted = gear.weapon
        ? `${gear.weapon.name} (+${gear.weapon.baseStats?.['attack'] ?? 0} ATK)${gear.weaponEquipped ? ', equipped' : ''}`
        : undefined;
      const consumablesGranted = gear.potion ? `${gear.potionsGranted}x ${gear.potion.name}` : undefined;

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
        starterCardId: starter?.cardId,
        starterCardName,
        equipmentGranted,
        consumablesGranted,
        achievementCode: 'TUTORIAL_COMPLETE',
        message:
          '🎉 **Tutorial Prologue Completed!** You have mastered Elemental Resonance, Skills, Consumables, and Shield Wards!\n' +
          '🎁 **Starter Rewards Dispatched:**\n' +
          `• **Card:** ${starterCardName}\n` +
          (equipmentGranted ? `• **Weapon:** ${equipmentGranted}\n` : '') +
          (consumablesGranted ? `• **Consumables:** ${consumablesGranted}\n` : '') +
          '• **Achievement Unlocked:** `TUTORIAL_COMPLETE`\n\n' +
          '🎓 **Congratulations, Summoner! You have graduated from the Tutorial!**\n' +
          'Would you like to enter **Season 1** now and test your strength against the Infernal Crucible?',
      };
    }

    // Even if already completed, make sure user has their starter card
    await this.ensureStarterCard(userId);

    return {
      success: true,
      isFirstCompletion: false,
      achievementCode: 'TUTORIAL_COMPLETE',
      message:
        '🎓 **You have graduated from the Tutorial!**\n' +
        'Would you like to enter **Season 1** now and test your strength against the Infernal Crucible?',
    };
  }
}

