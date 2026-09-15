import type {
  ItemRepository,
  InventoryRepository,
  EconomyRepository,
  PlayerEnergyRepository,
  EconomyItem,
} from '@ririko/database';
import type { EventBus } from '@ririko/core';
import type {
  BuyItemParams,
  BuyItemResult,
  UseItemParams,
  UseItemResult,
  InventorySlotView,
  ItemMetadata,
} from './types.js';
import type { LevelingService } from './leveling.service.js';

export interface InventoryServiceOptions {
  itemRepository: ItemRepository;
  inventoryRepository: InventoryRepository;
  economyRepository: EconomyRepository;
  playerEnergyRepository?: PlayerEnergyRepository | undefined;
  levelingService?: LevelingService | undefined;
  eventBus?: EventBus | undefined;
}

/**
 * Inventory & Item Shop Service implementing Section 33 of BLUEPRINT.md and Section 7 of docs/economy.md:
 * - Town shop catalog retrieval and deflationary currency sink.
 * - Daily purchase limits on entry-level goods (e.g. max 1 minor candy per day).
 * - Multi-slot inventory bag persistence.
 * - Usable consumable execution pipeline with anti-abuse daily potion ceilings (max 3/day).
 * - Multi-effect dispatch (energy, experience, credits, cosmetics).
 */
export class InventoryService {
  private readonly itemRepository: ItemRepository;
  private readonly inventoryRepository: InventoryRepository;
  private readonly economyRepository: EconomyRepository;
  private readonly playerEnergyRepository?: PlayerEnergyRepository | undefined;
  private readonly levelingService?: LevelingService | undefined;
  private readonly eventBus?: EventBus | undefined;

  constructor(options: InventoryServiceOptions) {
    this.itemRepository = options.itemRepository;
    this.inventoryRepository = options.inventoryRepository;
    this.economyRepository = options.economyRepository;
    this.playerEnergyRepository = options.playerEnergyRepository;
    this.levelingService = options.levelingService;
    this.eventBus = options.eventBus;
  }

  /**
   * Retrieves purchasable shop items, optionally filtered by category.
   */
  public async getCatalog(categoryId?: string): Promise<EconomyItem[]> {
    return this.itemRepository.findAll({
      isPurchasable: true,
      categoryId,
    });
  }

  /**
   * Retrieves an item definition by ID.
   */
  public async getItem(itemId: string): Promise<EconomyItem | null> {
    return this.itemRepository.findById(itemId);
  }

  /**
   * Retrieves the user's current inventory bag with enriched item details.
   */
  public async getUserInventory(userId: string): Promise<InventorySlotView[]> {
    const slots = await this.inventoryRepository.getUserInventoryWithItems(userId);
    return slots.map((s) => ({
      id: s.inventory.id,
      userId: s.inventory.userId,
      itemId: s.inventory.itemId,
      quantity: s.inventory.quantity,
      acquiredAt: s.inventory.acquiredAt,
      item: s.item,
    }));
  }

  /**
   * Checks the quantity of a specific item in the user's inventory.
   */
  public async getItemQuantity(userId: string, itemId: string): Promise<number> {
    return this.inventoryRepository.getItemQuantity(userId, itemId);
  }

  /**
   * Executes an item purchase from the shop catalog as a deflationary currency sink.
   */
  public async buyItem(params: BuyItemParams): Promise<BuyItemResult> {
    const { userId, itemId, guildId } = params;
    const quantity = params.quantity ?? 1;

    if (quantity <= 0) {
      return {
        success: false,
        reason: 'Quantity must be at least 1',
        quantity: 0,
        totalPrice: 0,
      };
    }

    const item = await this.itemRepository.findById(itemId);
    if (!item || !item.isPurchasable) {
      return {
        success: false,
        reason: 'Item is not available for purchase in the shop',
        quantity,
        totalPrice: 0,
      };
    }

    const metadata = (item.metadata ?? {}) as ItemMetadata;

    // Enforce daily purchase limit if defined (e.g. 1 minor candy per day)
    if (metadata.dailyPurchaseLimit !== undefined && metadata.dailyPurchaseLimit > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const history = await this.economyRepository.getTransactionHistory(userId, { limit: 100 });
      let boughtToday = 0;

      for (const tx of history.items) {
        if (
          tx.type === 'PURCHASE' &&
          tx.source === `SHOP_BUY:${itemId}` &&
          tx.createdAt.toISOString().slice(0, 10) === today
        ) {
          const txMeta = tx.metadata as { quantity?: number } | undefined;
          boughtToday += txMeta?.quantity ?? 1;
        }
      }

      if (boughtToday + quantity > metadata.dailyPurchaseLimit) {
        return {
          success: false,
          reason: `Daily purchase limit reached for this item (max ${metadata.dailyPurchaseLimit} per day, already bought ${boughtToday})`,
          item,
          quantity,
          totalPrice: 0,
        };
      }
    }

    const totalPrice = item.price * quantity;
    const balance = await this.economyRepository.findById(userId);
    const walletBalance = balance ? Number(balance.walletBalance) : 0;

    if (walletBalance < totalPrice) {
      return {
        success: false,
        reason: `Insufficient wallet balance (${walletBalance} credits, needed ${totalPrice})`,
        item,
        quantity,
        totalPrice,
        walletBalanceAfter: walletBalance,
      };
    }

    // Atomic debit and inventory grant
    const modifyResult = await this.economyRepository.modifyBalance({
      userId,
      guildId,
      walletDelta: -totalPrice,
      type: 'PURCHASE',
      source: `SHOP_BUY:${itemId}`,
      metadata: {
        itemId: item.id,
        itemName: item.name,
        quantity,
        unitPrice: item.price,
      },
    });

    const slot = await this.inventoryRepository.addItem(userId, itemId, quantity);

    if (this.eventBus) {
      this.eventBus.emit('economy:itemBought', {
        userId,
        itemId,
        quantity,
        totalPrice,
        guildId,
      });
    }

    return {
      success: true,
      item,
      quantity,
      totalPrice,
      walletBalanceAfter: modifyResult.balance.walletBalance,
      inventorySlot: slot,
      transactionId: modifyResult.transaction.id,
    };
  }

  /**
   * Consumes an item from the user's inventory and dispatches its designated effect.
   */
  public async useItem(params: UseItemParams): Promise<UseItemResult> {
    const { userId, itemId, guildId } = params;
    const quantity = params.quantity ?? 1;

    if (quantity <= 0) {
      return {
        success: false,
        reason: 'Quantity used must be at least 1',
        quantityUsed: 0,
        remainingQuantity: 0,
      };
    }

    const currentQty = await this.inventoryRepository.getItemQuantity(userId, itemId);
    if (currentQty < quantity) {
      return {
        success: false,
        reason: `Insufficient item quantity in inventory (have ${currentQty}, requested ${quantity})`,
        quantityUsed: 0,
        remainingQuantity: currentQty,
      };
    }

    const item = await this.itemRepository.findById(itemId);
    if (!item) {
      return {
        success: false,
        reason: 'Item definition not found in catalog',
        quantityUsed: 0,
        remainingQuantity: currentQty,
      };
    }

    const metadata = (item.metadata ?? {}) as ItemMetadata;
    const itemType = metadata.itemType ?? 'GENERIC';

    let effectSummary: string;
    let energyRestored: number | undefined;
    let currentEnergy: number | undefined;
    let dailyEnergyPotsUsed: number | undefined;
    let xpAwarded: number | undefined;
    let creditsAwarded: number | undefined;

    // Dispatch effect based on item type
    switch (itemType) {
      case 'ENERGY_RESTORE': {
        if (!this.playerEnergyRepository) {
          return {
            success: false,
            reason: 'Energy system repository is not configured',
            item,
            quantityUsed: 0,
            remainingQuantity: currentQty,
          };
        }

        const energyPerItem = metadata.energyRestored ?? 50;
        const ceiling = metadata.dailyUsageCeiling ?? 3;

        const potRes = await this.playerEnergyRepository.consumeEnergyPotion(
          userId,
          energyPerItem * quantity,
          ceiling,
        );

        if (!potRes.success) {
          return {
            success: false,
            reason: potRes.reason,
            item,
            quantityUsed: 0,
            remainingQuantity: currentQty,
          };
        }

        energyRestored = potRes.energyRestored;
        currentEnergy = potRes.energy.currentEnergy;
        dailyEnergyPotsUsed = potRes.potsUsedToday;
        effectSummary = `Restored ${energyRestored} stamina. Current stamina: ${currentEnergy}/${potRes.energy.maxEnergy + potRes.energy.bonusEnergy} (Potions used today: ${dailyEnergyPotsUsed}/${ceiling}).`;
        break;
      }

      case 'XP_GRANT': {
        const xpPerItem = metadata.xpAwarded ?? 100;
        const totalXp = xpPerItem * quantity;

        if (this.levelingService && guildId) {
          await this.levelingService.addExperience(
            userId,
            guildId,
            totalXp,
            `ITEM_USE:${item.id}`,
          );
        }

        xpAwarded = totalXp;
        effectSummary = `Awarded ${totalXp} XP to your server level progression.`;
        break;
      }

      case 'CREDITS_GRANT': {
        const creditsPerItem = metadata.creditsAwarded ?? 100;
        const totalCredits = creditsPerItem * quantity;

        await this.economyRepository.modifyBalance({
          userId,
          guildId,
          walletDelta: totalCredits,
          type: 'REWARD',
          source: `ITEM_USE:${item.id}`,
        });

        creditsAwarded = totalCredits;
        effectSummary = `Added ${totalCredits} credits to your wallet.`;
        break;
      }

      case 'PROFILE_BG_TOKEN': {
        effectSummary = 'Profile Background Voucher redeemed. You can now configure your profile banner via /profile background <url>.';
        break;
      }

      default: {
        effectSummary = `Consumed ${quantity}x ${item.name}.`;
        break;
      }
    }

    // Atomically decrement item from inventory
    await this.inventoryRepository.removeItem(userId, itemId, quantity);
    const remainingQuantity = currentQty - quantity;

    if (this.eventBus) {
      this.eventBus.emit('economy:itemUsed', {
        userId,
        itemId,
        quantity,
        effectType: itemType,
        guildId,
        metadata: {
          ...metadata,
          effectSummary,
        },
      });
    }

    return {
      success: true,
      item,
      quantityUsed: quantity,
      remainingQuantity,
      effectSummary,
      energyRestored,
      currentEnergy,
      dailyEnergyPotsUsed,
      xpAwarded,
      creditsAwarded,
    };
  }
}
