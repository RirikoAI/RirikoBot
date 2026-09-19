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

/** First-clear milestone rewards. Items are catalog codes from equipment/catalog.ts. */
const MILESTONE_REWARDS: Readonly<Record<number, LootRoll>> = {
  10: {
    credits: 2500,
    exp: 100,
    craftingDust: 50,
    items: [{ code: 'WEAPON_OBSIDIAN_KATANA', quantity: 1 }],
  },
  20: {
    credits: 5000,
    exp: 250,
    craftingDust: 150,
    items: [{ code: 'AMULET_MOUNTAIN', quantity: 1 }],
  },
  30: {
    credits: 10000,
    exp: 500,
    craftingDust: 300,
    items: [{ code: 'WEAPON_SOLAR_LANCE', quantity: 1 }],
  },
  40: {
    credits: 20000,
    exp: 1000,
    craftingDust: 600,
    items: [{ code: 'RELIC_CHRONOS_HOURGLASS', quantity: 1 }],
  },
  50: {
    credits: 50000,
    exp: 2500,
    craftingDust: 1500,
    items: [{ code: 'ARMOR_AEGIS_BARRIER', quantity: 1 }],
  },
};

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

  private rollLoot(floorNumber: number, isFirstClear: boolean): LootRoll {
    if (isFirstClear) {
      const milestone = MILESTONE_REWARDS[floorNumber];
      if (milestone) return milestone;
      return {
        credits: floorNumber * 100,
        exp: floorNumber * 15,
        craftingDust: floorNumber * 5,
        items: floorNumber % 5 === 0 ? [{ code: 'POTION_MAJOR_HP', quantity: 1 }] : [],
      };
    }

    return {
      credits: Math.round(floorNumber * 25 + this.rng() * 50),
      exp: Math.round(floorNumber * 5 + this.rng() * 10),
      craftingDust: Math.round(floorNumber * 2 + this.rng() * 5),
      items: this.rng() < 0.3 ? [{ code: 'POTION_MINOR_HP', quantity: 1 }] : [],
    };
  }

  /**
   * Generates and dispatches loot for a cleared floor.
   */
  public async generateAndDispatchLoot(
    userId: string,
    floorNumber: number,
    isFirstClear: boolean,
  ): Promise<DungeonLootResult> {
    const {
      credits,
      exp,
      craftingDust,
      items: rolledItems,
    } = this.rollLoot(floorNumber, isFirstClear);

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
