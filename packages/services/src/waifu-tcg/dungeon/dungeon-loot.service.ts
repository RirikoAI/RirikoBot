import type {
  EconomyRepository,
  UserInventoryItemRepository,
  XpRepository,
} from '@ririko/database';

export interface DungeonLootItem {
  id: string;
  name: string;
  type: 'EQUIPMENT' | 'ACCESSORY' | 'CONSUMABLE' | 'TICKET' | 'TITLE';
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

export class DungeonLootService {
  private readonly economyRepo: EconomyRepository | undefined;
  private readonly inventoryRepo: UserInventoryItemRepository | undefined;
  private readonly xpRepo: XpRepository | undefined;
  private readonly rng: () => number;

  constructor(
    options: {
      economyRepo?: EconomyRepository | undefined;
      inventoryRepo?: UserInventoryItemRepository | undefined;
      xpRepo?: XpRepository | undefined;
      rng?: (() => number) | undefined;
    } = {},
  ) {
    this.economyRepo = options.economyRepo;
    this.inventoryRepo = options.inventoryRepo;
    this.xpRepo = options.xpRepo;
    this.rng = options.rng ?? Math.random;
  }

  /**
   * Generates and dispatches loot for a cleared floor.
   */
  public async generateAndDispatchLoot(
    userId: string,
    floorNumber: number,
    isFirstClear: boolean,
  ): Promise<DungeonLootResult> {
    const items: DungeonLootItem[] = [];
    let credits: number;
    let exp: number;
    let craftingDust: number;

    if (isFirstClear) {
      // First-Clear Milestone or Standard Rewards
      switch (floorNumber) {
        case 10:
          credits = 2500;
          exp = 100;
          craftingDust = 50;
          items.push({
            id: 'weap_iron_greatsword',
            name: 'Iron Greatsword (+50 ATK, Tier 1 Perk)',
            type: 'EQUIPMENT',
            rarity: 'RARE',
            quantity: 1,
          });
          break;

        case 20:
          credits = 5000;
          exp = 250;
          craftingDust = 150;
          items.push({
            id: 'item_summon_ticket',
            name: 'Waifu Summon Ticket',
            type: 'TICKET',
            rarity: 'RARE',
            quantity: 1,
          });
          items.push({
            id: 'relic_chrono_fragment',
            name: 'Chrono Fragment (+75 HP, +15 DEF)',
            type: 'EQUIPMENT',
            rarity: 'RARE',
            quantity: 1,
          });
          break;

        case 30:
          credits = 10000;
          exp = 500;
          craftingDust = 300;
          items.push({
            id: 'item_summon_ticket',
            name: 'Waifu Summon Ticket',
            type: 'TICKET',
            rarity: 'RARE',
            quantity: 2,
          });
          items.push({
            id: 'weap_glacial_edge',
            name: 'Glacial Edge (+120 ATK, Glacial Counter Perk)',
            type: 'EQUIPMENT',
            rarity: 'SECRET_RARE',
            quantity: 1,
          });
          break;

        case 40:
          credits = 20000;
          exp = 1000;
          craftingDust = 600;
          items.push({
            id: 'item_summon_ticket',
            name: 'Waifu Summon Ticket',
            type: 'TICKET',
            rarity: 'RARE',
            quantity: 3,
          });
          items.push({
            id: 'acc_prismatic_ring',
            name: 'Prismatic Ring (+10% All Stats)',
            type: 'ACCESSORY',
            rarity: 'ULTRA_RARE',
            quantity: 1,
          });
          break;

        case 50:
          credits = 50000;
          exp = 2500;
          craftingDust = 1500;
          items.push({
            id: 'item_summon_ticket',
            name: 'Waifu Summon Ticket',
            type: 'TICKET',
            rarity: 'RARE',
            quantity: 5,
          });
          items.push({
            id: 'title_tower_vanquisher',
            name: 'Title: Tower Vanquisher',
            type: 'TITLE',
            rarity: 'MYTHIC',
            quantity: 1,
          });
          items.push({
            id: 'armor_glacial_aegis',
            name: 'Glacial Aegis (+800 HP, +250 DEF, Freeze Immunity)',
            type: 'EQUIPMENT',
            rarity: 'ULTRA_RARE',
            quantity: 1,
          });
          break;

        default:
          credits = floorNumber * 100;
          exp = floorNumber * 15;
          craftingDust = floorNumber * 5;
          if (floorNumber % 5 === 0) {
            items.push({
              id: 'potion_hp_major',
              name: 'Major HP Potion (+500 HP)',
              type: 'CONSUMABLE',
              rarity: 'RARE',
              quantity: 1,
            });
          }
          break;
      }
    } else {
      // Repeat Floor Clear Loot
      credits = Math.round(floorNumber * 25 + this.rng() * 50);
      exp = Math.round(floorNumber * 5 + this.rng() * 10);
      craftingDust = Math.round(floorNumber * 2 + this.rng() * 5);

      if (this.rng() < 0.3) {
        items.push({
          id: 'potion_hp_minor',
          name: 'Minor HP Potion (+250 HP)',
          type: 'CONSUMABLE',
          rarity: 'COMMON',
          quantity: 1,
        });
      }
    }

    // Dispatch rewards if repos are present
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
    if (this.inventoryRepo && items.length > 0) {
      for (const it of items) {
        await this.inventoryRepo.create({
          userId,
          itemId: it.id,
          slot: it.type === 'ACCESSORY' ? 'ACCESSORY' : it.type === 'EQUIPMENT' ? 'WEAPON' : 'CONSUMABLE',
          quantity: it.quantity,
          obtainedFrom: 'DUNGEON',
          state: 'IDLE',
        });
      }
    }

    const itemSummary =
      items.length > 0
        ? `\n🎁 **Items Received:**\n` + items.map((i) => `• ${i.quantity}x ${i.name} [${i.rarity}]`).join('\n')
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
