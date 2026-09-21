import type { CardRarity } from '../types.js';
import type { UserInventoryItemRepository, WaifuCardRepository } from '@ririko/database';
import type { ItemGrantService } from '../equipment/item-grant.service.js';

export const CRAFTING_DUST_YIELD: Record<CardRarity, number> = {
  COMMON: 10,
  UNCOMMON: 25,
  RARE: 75,
  SUPER_RARE: 200,
  ULTRA_RARE: 500,
  SECRET_RARE: 1200,
  SIR: 3000,
  MYTHIC: 10000,
};

export interface DismantleResult {
  success: boolean;
  dustAwarded?: number;
  /** Gear that was on the card and went back to the inventory. */
  gearReturned?: number;
  cardName?: string;
  rarity?: CardRarity;
  error?: string;
}

export class CardDismantleService {
  constructor(
    private readonly cardRepo: WaifuCardRepository,
    private readonly inventoryRepo: UserInventoryItemRepository,
    private readonly grants?: ItemGrantService | undefined,
  ) {}

  /**
   * Dismantles a user card into Crafting Dust according to docs/waifu-tcg.md:L166.
   * Protects favorite cards and active/equipped cards.
   */
  async dismantleCard(userId: string, userCardId: string): Promise<DismantleResult> {
    const userCard = await this.cardRepo.findUserCardById(userCardId);
    if (!userCard) {
      return { success: false, error: 'Card not found in your collection.' };
    }

    if (userCard.userId !== userId) {
      return { success: false, error: 'You do not own this card.' };
    }

    if (userCard.isFavorite) {
      return {
        success: false,
        error: 'This card is marked as favorite and protected from dismantling. Unfavorite it first with /card favorite.',
      };
    }

    if (userCard.state !== 'IDLE') {
      return {
        success: false,
        error: `Cannot dismantle a card in state '${userCard.state}'. Please unequip or cancel active trades/market listings first.`,
      };
    }

    const baseCard = await this.cardRepo.findById(userCard.cardId);
    const rarity = (baseCard?.rarity as CardRarity) ?? 'COMMON';
    const dustAwarded = CRAFTING_DUST_YIELD[rarity] ?? 10;

    // Return the card's gear to the inventory, delete the card, then pay out the dust
    const gearReturned = (await this.inventoryRepo.unequipAllForUser(userId, userCardId)).length;
    await this.cardRepo.deleteUserCard(userCardId);
    await this.grants?.grant(userId, 'CRAFTING_DUST', dustAwarded, 'DISMANTLE');

    return {
      success: true,
      dustAwarded,
      gearReturned,
      cardName: baseCard?.name ?? 'Unknown Waifu',
      rarity,
    };
  }
}
