import type {
  EconomyRepository,
  GameItemRepository,
  UserInventoryItemRepository,
  XpRepository,
} from '@ririko/database';
import { ItemGrantService } from '../equipment/item-grant.service.js';

export interface DungeonLootItem {
  code: string;
  name: string;
  type: string;
  rarity: string;
  quantity: number;
}

export interface DungeonLootResult {
  floorNumber: number;
  isFirstClear: boolean;
  credits: number;
  exp: number;
  craftingDust: number;
  items: DungeonLootItem[];
  message: string;
}

interface LootRoll {
  credits: number;
  exp: number;
  craftingDust: number;
  items: Array<{ code: string; quantity: number }>;
}

export interface WeightedDrop {
  code: string;
  weight: number;
}

/**
 * Loot by floor bracket. Every item is a catalog code. Gear in each bracket is sized to the
 * players expected there (see the balance simulator profiles), so climbing unlocks better gear.
 */
export interface DropBracket {
  fromFloor: number;
  toFloor: number;
  /** Chance of an item roll on a repeat clear. First clears of standard floors always roll. */
  repeatChance: number;
  pool: readonly WeightedDrop[];
  /** Given on a boss floor's first clear when the boss has no signature gear. */
  bossFallbackCode: string;
}

export const DUNGEON_DROP_BRACKETS: readonly DropBracket[] = [
  {
    fromFloor: 1,
    toFloor: 9,
    repeatChance: 0.35,
    bossFallbackCode: 'POTION_MAJOR_HP',
    pool: [
      { code: 'POTION_MINOR_HP', weight: 45 },
      { code: 'POTION_MANA_DRAUGHT', weight: 25 },
      { code: 'WEAPON_SCOUT_BOOMERANG', weight: 8 },
      { code: 'ARMOR_WOODEN_BUCKLER', weight: 8 },
      { code: 'RELIC_EMBER_CHARM', weight: 7 },
      { code: 'RING_COPPER_BAND', weight: 7 },
    ],
  },
  {
    fromFloor: 10,
    toFloor: 19,
    repeatChance: 0.35,
    bossFallbackCode: 'WEAPON_OBSIDIAN_KATANA',
    pool: [
      { code: 'POTION_MINOR_HP', weight: 30 },
      { code: 'POTION_MAJOR_HP', weight: 15 },
      { code: 'POTION_GREATER_MANA', weight: 15 },
      { code: 'WEAPON_OBSIDIAN_KATANA', weight: 6 },
      { code: 'ARMOR_MAGMA_MAIL', weight: 6 },
      { code: 'RELIC_CINDER_LANTERN', weight: 6 },
      { code: 'RING_BLAZING_SUN', weight: 6 },
      { code: 'AMULET_MOUNTAIN', weight: 6 },
      { code: 'TALISMAN_WINDWALKER', weight: 6 },
    ],
  },
  {
    fromFloor: 20,
    toFloor: 29,
    repeatChance: 0.35,
    bossFallbackCode: 'WEAPON_SOLAR_LANCE',
    pool: [
      { code: 'POTION_MAJOR_HP', weight: 35 },
      { code: 'POTION_GREATER_MANA', weight: 20 },
      { code: 'WEAPON_SOLAR_LANCE', weight: 6 },
      { code: 'ARMOR_DRAGONSCALE_PLATE', weight: 6 },
      { code: 'RELIC_PHOENIX_ASH_CENSER', weight: 6 },
      { code: 'RING_SOLAR_FLARE', weight: 6 },
      { code: 'AMULET_OBSIDIAN_HEART', weight: 6 },
      { code: 'TALISMAN_EMBERSTEP', weight: 6 },
    ],
  },
  {
    fromFloor: 30,
    toFloor: 39,
    repeatChance: 0.35,
    bossFallbackCode: 'WEAPON_CRIMSON_CALAMITY',
    pool: [
      { code: 'POTION_MAJOR_HP', weight: 35 },
      { code: 'POTION_GREATER_MANA', weight: 20 },
      { code: 'WEAPON_CRIMSON_CALAMITY', weight: 5 },
      { code: 'ARMOR_AEGIS_BARRIER', weight: 5 },
      { code: 'RELIC_CHRONOS_HOURGLASS', weight: 5 },
      { code: 'RING_INFERNO_CROWN', weight: 5 },
      { code: 'AMULET_MAGMA_CORE', weight: 5 },
      { code: 'TALISMAN_TEMPEST_FEATHER', weight: 5 },
    ],
  },
  {
    fromFloor: 40,
    toFloor: Number.MAX_SAFE_INTEGER,
    repeatChance: 0.35,
    bossFallbackCode: 'ARMOR_ETERNAL_CRUCIBLE',
    pool: [
      { code: 'POTION_MAJOR_HP', weight: 30 },
      { code: 'POTION_ELIXIR_VITALITY', weight: 10 },
      { code: 'POTION_GREATER_MANA', weight: 15 },
      { code: 'ARMOR_ETERNAL_CRUCIBLE', weight: 4 },
      { code: 'RING_SUNFORGED_SIGIL', weight: 4 },
      { code: 'AMULET_PRIMORDIAL_FLAME', weight: 4 },
      { code: 'TALISMAN_ASHEN_WINGS', weight: 4 },
      { code: 'RELIC_PHOENIX_FEATHER', weight: 2 },
      { code: 'WEAPON_WORLD_BREAKER', weight: 1 },
    ],
  },
];

/** Chance that a repeat clear of a boss floor drops the boss's signature gear again. */
export const SIGNATURE_REPEAT_CHANCE = 0.08;

/** Extra credits and dust for the first clear of every 10th floor. */
const MAJOR_FIRST_CLEAR_BONUS: Readonly<Record<number, { credits: number; craftingDust: number }>> =
  {
    10: { credits: 2500, craftingDust: 50 },
    20: { credits: 5000, craftingDust: 150 },
    30: { credits: 10000, craftingDust: 300 },
    40: { credits: 20000, craftingDust: 600 },
    50: { credits: 50000, craftingDust: 1500 },
  };

export function getDropBracket(floorNumber: number): DropBracket {
  return (
    DUNGEON_DROP_BRACKETS.find((b) => floorNumber >= b.fromFloor && floorNumber <= b.toFloor) ??
    DUNGEON_DROP_BRACKETS[DUNGEON_DROP_BRACKETS.length - 1]!
  );
}

export class DungeonLootService {
  private readonly economyRepo: EconomyRepository | undefined;
  private readonly xpRepo: XpRepository | undefined;
  private readonly grants: ItemGrantService | undefined;
  private readonly rng: () => number;

  constructor(
    options: {
      economyRepo?: EconomyRepository | undefined;
      inventoryRepo?: UserInventoryItemRepository | undefined;
      itemRepo?: GameItemRepository | undefined;
      xpRepo?: XpRepository | undefined;
      rng?: (() => number) | undefined;
    } = {},
  ) {
    this.economyRepo = options.economyRepo;
    this.xpRepo = options.xpRepo;
    this.grants =
      options.itemRepo && options.inventoryRepo
        ? new ItemGrantService(options.itemRepo, options.inventoryRepo)
        : undefined;
    this.rng = options.rng ?? Math.random;
  }

  private pickDrop(pool: readonly WeightedDrop[]): string {
    const total = pool.reduce((sum, d) => sum + d.weight, 0);
    let roll = this.rng() * total;
    for (const drop of pool) {
      roll -= drop.weight;
      if (roll < 0) return drop.code;
    }
    return pool[pool.length - 1]!.code;
  }

  private rollLoot(
    floorNumber: number,
    isFirstClear: boolean,
    signatureDropCode?: string,
  ): LootRoll {
    const bracket = getDropBracket(floorNumber);
    const isBossFloor = floorNumber % 5 === 0;
    const items: LootRoll['items'] = [];

    if (isFirstClear) {
      const bonus = MAJOR_FIRST_CLEAR_BONUS[floorNumber];
      if (isBossFloor) {
        items.push({ code: signatureDropCode ?? bracket.bossFallbackCode, quantity: 1 });
      } else {
        items.push({ code: this.pickDrop(bracket.pool), quantity: 1 });
      }
      return {
        credits: bonus?.credits ?? floorNumber * 100,
        exp: floorNumber * 15,
        craftingDust: bonus?.craftingDust ?? floorNumber * 5,
        items,
      };
    }

    if (isBossFloor && signatureDropCode && this.rng() < SIGNATURE_REPEAT_CHANCE) {
      items.push({ code: signatureDropCode, quantity: 1 });
    } else if (this.rng() < bracket.repeatChance) {
      items.push({ code: this.pickDrop(bracket.pool), quantity: 1 });
    }
    return {
      credits: Math.round(floorNumber * 25 + this.rng() * 50),
      exp: Math.round(floorNumber * 5 + this.rng() * 10),
      craftingDust: Math.round(floorNumber * 2 + this.rng() * 5),
      items,
    };
  }

  /**
   * Generates and dispatches loot for a cleared floor. Boss floors drop the boss's signature
   * gear on the first clear (and occasionally on repeats); other floors roll their bracket table.
   */
  public async generateAndDispatchLoot(
    userId: string,
    floorNumber: number,
    isFirstClear: boolean,
    options: { signatureDropCode?: string | undefined } = {},
  ): Promise<DungeonLootResult> {
    const {
      credits,
      exp,
      craftingDust,
      items: rolledItems,
    } = this.rollLoot(floorNumber, isFirstClear, options.signatureDropCode);

    if (this.economyRepo && credits > 0) {
      await this.economyRepo.modifyBalance({
        userId,
        walletDelta: credits,
        type: 'DUNGEON_REWARD',
        source: 'DUNGEON_TOWER',
      });
    }
    if (this.xpRepo && exp > 0) {
      await this.xpRepo.addXp({
        userId,
        guildId: 'global',
        xpDelta: exp,
        source: 'DUNGEON_TOWER',
      });
    }

    if (this.grants && craftingDust > 0) {
      await this.grants.grant(userId, 'CRAFTING_DUST', craftingDust, 'DUNGEON');
    }

    // Only items that actually landed in the inventory are reported.
    const items: DungeonLootItem[] = [];
    if (this.grants) {
      for (const roll of rolledItems) {
        const granted = await this.grants.grant(userId, roll.code, roll.quantity, 'DUNGEON');
        if (!granted) {
          console.warn(`[dungeon-loot] Catalog item ${roll.code} is missing; reward skipped.`);
          continue;
        }
        items.push({
          code: granted.item.code,
          name: granted.item.name,
          type: granted.item.type,
          rarity: granted.item.rarity,
          quantity: granted.quantity,
        });
      }
    }

    const itemSummary =
      items.length > 0
        ? `\n🎁 **Items Received:**\n` +
          items.map((i) => `• ${i.quantity}x ${i.name} [${i.rarity}]`).join('\n')
        : '';

    const message =
      `✨ **Floor ${floorNumber} Cleared!** ${isFirstClear ? '*(FIRST CLEAR MILESTONE!)*' : '*(Repeat Clear)*'}\n` +
      `🪙 **+${credits.toLocaleString()} Credits** | ⚡ **+${exp} EXP** | 🧪 **+${craftingDust} Crafting Dust**` +
      itemSummary;

    return {
      floorNumber,
      isFirstClear,
      credits,
      exp,
      craftingDust,
      items,
      message,
    };
  }
}
