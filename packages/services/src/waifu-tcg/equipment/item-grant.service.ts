import type {
  DatabaseClient,
  GameItem,
  GameItemRepository,
  UserInventoryItem,
  UserInventoryItemRepository,
} from '@ririko/database';

/**
 * Item keys that older reward code wrote instead of real catalog codes.
 * Kept so existing achievement rows and inventory rows still resolve to real items.
 */
export const LEGACY_ITEM_CODE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  item_novice_blade: 'WEAPON_NOVICE_BLADE',
  potion_hp_minor: 'POTION_MINOR_HP',
  potion_hp_major: 'POTION_MAJOR_HP',
  potion_mana_minor: 'POTION_MANA_DRAUGHT',
  potion_energy_grand: 'RESTORE_GRAND_STAMINA_FLASK',
  celestial_ambrosia: 'RESTORE_CELESTIAL_AMBROSIA',
  weap_iron_greatsword: 'WEAPON_OBSIDIAN_KATANA',
  relic_chrono_fragment: 'AMULET_MOUNTAIN',
  weap_glacial_edge: 'WEAPON_SOLAR_LANCE',
  acc_prismatic_ring: 'RELIC_CHRONOS_HOURGLASS',
  armor_glacial_aegis: 'ARMOR_AEGIS_BARRIER',
});

export interface ItemGrantResult {
  item: GameItem;
  quantity: number;
  inventoryItems: UserInventoryItem[];
}

/**
 * Single entry point for putting catalog items into a user's inventory.
 * Consumables stack into one IDLE row; equipment and accessories get one row per instance
 * so each piece keeps its own enhancement level.
 */
export class ItemGrantService {
  constructor(
    private readonly itemRepo: GameItemRepository,
    private readonly inventoryRepo: UserInventoryItemRepository,
  ) {}

  /** Resolves a catalog code, a legacy alias, or a game_items id to the item definition. */
  async resolveItem(key: string, tx?: DatabaseClient): Promise<GameItem | null> {
    const code = LEGACY_ITEM_CODE_ALIASES[key] ?? key;
    return (await this.itemRepo.findByCode(code, tx)) ?? (await this.itemRepo.findById(key, tx));
  }

  /** Grants an item by code (or alias). Returns null when no such item exists in the catalog. */
  async grant(
    userId: string,
    key: string,
    quantity: number,
    obtainedFrom: string,
    tx?: DatabaseClient,
  ): Promise<ItemGrantResult | null> {
    const item = await this.resolveItem(key, tx);
    if (!item) return null;
    return this.grantItem(userId, item, quantity, obtainedFrom, tx);
  }

  async grantItem(
    userId: string,
    item: GameItem,
    quantity: number,
    obtainedFrom: string,
    tx?: DatabaseClient,
  ): Promise<ItemGrantResult> {
    if (quantity <= 0) return { item, quantity: 0, inventoryItems: [] };

    if (item.type === 'CONSUMABLE') {
      const idle = await this.inventoryRepo.findByUser(userId, { state: 'IDLE' }, tx);
      const stack = idle.find((inv) => inv.itemId === item.id);
      const row = stack
        ? await this.inventoryRepo.update(stack.id, { quantity: stack.quantity + quantity }, tx)
        : await this.inventoryRepo.create(
            { userId, itemId: item.id, quantity, slot: 'NONE', state: 'IDLE', obtainedFrom },
            tx,
          );
      return { item, quantity, inventoryItems: [row] };
    }

    const inventoryItems: UserInventoryItem[] = [];
    for (let i = 0; i < quantity; i++) {
      inventoryItems.push(
        await this.inventoryRepo.create(
          {
            userId,
            itemId: item.id,
            quantity: 1,
            enhancementLevel: 0,
            slot: 'NONE',
            state: 'IDLE',
            obtainedFrom,
          },
          tx,
        ),
      );
    }
    return { item, quantity, inventoryItems };
  }

  /**
   * Re-points inventory rows written with legacy alias ids at the real catalog items.
   * Idempotent: once repaired, no rows carry the alias ids. Returns rows repaired.
   */
  async repairLegacyInventoryRows(): Promise<number> {
    let repaired = 0;
    for (const [alias, code] of Object.entries(LEGACY_ITEM_CODE_ALIASES)) {
      const item = await this.itemRepo.findByCode(code);
      if (!item) continue;
      repaired += await this.inventoryRepo.remapItemId(alias, item.id);
    }
    return repaired;
  }
}
