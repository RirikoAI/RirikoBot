import {
  DatabaseError,
  DEFAULT_RESET_SCHEDULE,
  getResetDayKey,
  type ResetSchedule,
} from '@ririko/core';
import type {
  EconomyRepository,
  GameItem,
  GameItemRepository,
  UserInventoryItemRepository,
} from '@ririko/database';
import { ItemGrantService } from './item-grant.service.js';
import { DAILY_ROTATION_POOL } from './catalog.js';

/** Number of drop-only items the shop stocks each day. */
export const DAILY_ROTATION_SIZE = 2;
/** Price multiplier for rotation stock, which is otherwise drop-only. */
export const DAILY_ROTATION_MARKUP = 1.5;

export interface TcgShopReceipt {
  success: boolean;
  item: GameItem;
  quantity: number;
  totalPrice: number;
  walletBalanceAfter: number;
  /** New inventory rows (one per equipment piece; the stack row for consumables). */
  inventoryItemIds: string[];
}

/** Reset-day key, e.g. "2026-09-20": the shop rotation key. */
export function shopDayKey(date: Date, schedule: ResetSchedule = DEFAULT_RESET_SCHEDULE): string {
  return getResetDayKey(date, schedule);
}

/** Deterministic pick of today's rotation codes: the same for every player on the same day. */
export function pickDailyRotation(dayKey: string, pool: readonly string[], size: number): string[] {
  let hash = 2166136261;
  for (const ch of dayKey) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  const remaining = [...pool];
  const picked: string[] = [];
  while (picked.length < size && remaining.length > 0) {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507) >>> 0;
    picked.push(remaining.splice(hash % remaining.length, 1)[0]!);
  }
  return picked;
}

export class TcgShopService {
  private readonly grants: ItemGrantService;

  constructor(
    private readonly itemRepo: GameItemRepository,
    inventoryRepo: UserInventoryItemRepository,
    private readonly economyRepo: EconomyRepository,
    private readonly resetSchedule: ResetSchedule = DEFAULT_RESET_SCHEDULE,
  ) {
    this.grants = new ItemGrantService(itemRepo, inventoryRepo);
  }

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
   * Today's drop-only rotation stock, priced at DAILY_ROTATION_MARKUP × list price and limited
   * to one purchase per order.
   */
  async getDailyRotation(now: Date = new Date()): Promise<GameItem[]> {
    const codes = pickDailyRotation(
      shopDayKey(now, this.resetSchedule),
      DAILY_ROTATION_POOL,
      DAILY_ROTATION_SIZE,
    );
    const items: GameItem[] = [];
    for (const code of codes) {
      const item = await this.itemRepo.findByCode(code);
      if (item) {
        items.push({
          ...item,
          shopPrice: Math.round(item.shopPrice * DAILY_ROTATION_MARKUP),
          maxDailyPurchases: 1,
        });
      }
    }
    return items;
  }

  /**
   * Purchases an item from the Town Item Shop using wallet credits.
   * Drop-only items can be bought only while they are in today's rotation.
   * Audited via double-entry financial ledger ('SHOP_BUY').
   */
  async buyItem(
    userId: string,
    itemCodeOrId: string,
    quantity = 1,
    guildId?: string,
    now: Date = new Date(),
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
      const rotation = (await this.getDailyRotation(now)).find((r) => r.id === item!.id);
      if (!rotation) {
        throw new DatabaseError(
          `${item.name} is a superior drop and cannot be purchased with credits`,
        );
      }
      item = rotation;
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
    const granted = await this.grants.grantItem(userId, item, quantity, 'SHOP');

    return {
      success: true,
      item,
      quantity,
      totalPrice,
      walletBalanceAfter: Number(balanceResult.balance.walletBalance),
      inventoryItemIds: granted.inventoryItems.map((inv) => inv.id),
    };
  }
}
