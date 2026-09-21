import type { DatabaseClient, UserCard, UserInventoryItemRepository } from '@ririko/database';

const SLOT_NAMES: Record<string, string> = {
  WEAPON: 'Weapon',
  ARMOR: 'Armor',
  RELIC: 'Relic',
  RING: 'Ring',
  AMULET: 'Amulet',
  TALISMAN: 'Talisman',
};

/** Card states in which gear may be equipped: the card is not locked in a trade or listing. */
export const GEAR_EQUIPPABLE_CARD_STATES: readonly string[] = ['IDLE', 'EQUIPPED'];

/** Slots of `card` holding gear owned by the card's owner, e.g. ['Weapon', 'Ring']. */
export async function listEquippedSlots(
  inventoryRepo: UserInventoryItemRepository,
  card: Pick<UserCard, 'id' | 'userId'>,
  tx?: DatabaseClient,
): Promise<string[]> {
  const pieces = await inventoryRepo.findEquippedByCard(card.id, tx);
  return pieces
    .filter((piece) => piece.userId === card.userId)
    .map((piece) => SLOT_NAMES[piece.slot] ?? piece.slot);
}

/**
 * Only empty cards change hands: gear never moves with a card. Throws a player-facing message
 * that names the occupied slots and how to empty them.
 */
export async function assertCardHasNoGear(
  inventoryRepo: UserInventoryItemRepository,
  card: Pick<UserCard, 'id' | 'userId'>,
  action: 'sold' | 'traded',
  cardName?: string | undefined,
  tx?: DatabaseClient,
): Promise<void> {
  const slots = await listEquippedSlots(inventoryRepo, card, tx);
  if (slots.length === 0) return;
  const label = cardName ? `${cardName} (\`${card.id}\`)` : `Card \`${card.id}\``;
  throw new Error(
    `🔒 ${label} still has gear equipped in: ${slots.join(', ')}. ` +
      `Gear never moves with a card, so only cards with all 6 gear slots empty can be ${action}. ` +
      `Unequip everything with \`/card action:unequip-all id:${card.id}\` or the **Unequip All** button in \`/loadout\`, then try again.`,
  );
}
