import { DatabaseError } from '@ririko/core';
import type {
  EconomyRepository,
  GameItem,
  GameItemRepository,
  UserInventoryItemRepository,
} from '@ririko/database';

export interface TcgShopReceipt {
  success: boolean;
  item: GameItem;
  quantity: number;
  totalPrice: number;
  walletBalanceAfter: number;
}

export class TcgShopService {
  constructor(
    private readonly itemRepo: GameItemRepository,
    private readonly inventoryRepo: UserInventoryItemRepository,
    private readonly economyRepo: EconomyRepository,
  ) {}

  /**
   * Retrieves all items currently stocked in the Town Item Shop.
   */
  async getCatalog(type?: string): Promise<GameItem[]> {
    return this.itemRepo.findAll({
      isShopBuyable: true,
      type: type ? type.toUpperCase() : undefined,
    });
  }

  /**
   * Purchases an item from the Town Item Shop using wallet credits.
   * Audited via double-entry financial ledger ('SHOP_BUY').
   */
  async buyItem(
    userId: string,
    itemCodeOrId: string,
    quantity = 1,
    guildId?: string,
  ): Promise<TcgShopReceipt> {
    if (quantity <= 0) {
      throw new DatabaseError('Quantity must be at least 1');
    }

    // 1. Locate item in catalog
    let item = await this.itemRepo.findByCode(itemCodeOrId);
    if (!item) {
      item = await this.itemRepo.findById(itemCodeOrId);
    }
    if (!item) {
      throw new DatabaseError(`Item '${itemCodeOrId}' not found in town shop catalog`);
    }
    if (!item.isShopBuyable) {
      throw new DatabaseError(`${item.name} is a superior drop and cannot be purchased with credits`);
    }

    // 2. Check daily purchase limits (e.g. Daily Energy Biscuit: max 1/day)
    if (item.maxDailyPurchases > 0 && quantity > item.maxDailyPurchases) {
      throw new DatabaseError(
        `Purchase quantity exceeds daily limit of ${item.maxDailyPurchases} for ${item.name}`,
      );
    }

    // 3. Check wallet balance and execute financial debit
    const totalPrice = item.shopPrice * quantity;
    const balanceResult = await this.economyRepo.modifyBalance({
      userId,
      walletDelta: -totalPrice,
      type: 'SHOP_BUY',
      source: 'TCG_TOWN_SHOP',
      metadata: { itemCode: item.code, itemName: item.name, quantity },
      guildId,
    });

    // 4. Provision item into user inventory
    if (item.type === 'CONSUMABLE') {
      const existing = await this.inventoryRepo.findByUser(userId, { state: 'IDLE' });
      const matchingSlot = existing.find((inv) => inv.itemId === item!.id);

      if (matchingSlot) {
        await this.inventoryRepo.update(matchingSlot.id, {
          quantity: matchingSlot.quantity + quantity,
        });
      } else {
        await this.inventoryRepo.create({
          userId,
          itemId: item.id,
          quantity,
          slot: 'NONE',
          state: 'IDLE',
          obtainedFrom: 'SHOP',
        });
      }
    } else {
      // For Equipment and Accessories: each item is a distinct instance with its own enhancement level
      for (let i = 0; i < quantity; i++) {
        await this.inventoryRepo.create({
          userId,
          itemId: item.id,
          quantity: 1,
          enhancementLevel: 0,
          slot: 'NONE',
          state: 'IDLE',
          obtainedFrom: 'SHOP',
        });
      }
    }

    return {
      success: true,
      item,
      quantity,
      totalPrice,
      walletBalanceAfter: Number(balanceResult.balance.walletBalance),
    };
  }
}
