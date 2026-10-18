import type { UserCard, WaifuCardRepository } from '@ririko/database';

/**
 * Resolves a UserCard from user input using a robust fallback chain:
 * 1. Exact UUID match (`user_cards.id`)
 * 2. Short hex ID prefix match (e.g. first 8 characters `137b8c24`)
 * 3. Album index number (e.g. `1`, `2`, `3` corresponding to 1-based collection order)
 * 4. Character name case-insensitive substring match (e.g. "Harribel", "Megumin", "Tanya")
 * 5. Serial number match (e.g. `#0001`, `#42`, `42`, `#0001/1000`)
 */
export async function resolveUserCard(
  cardRepo: WaifuCardRepository,
  userId: string,
  query: string | undefined | null,
): Promise<UserCard | null> {
  if (!query) return null;
  const trimmed = query.trim();
  if (!trimmed) return null;

  // 1. Direct UUID match
  const direct = await cardRepo.findUserCardById(trimmed);
  if (direct && direct.userId === userId) {
    return direct;
  }

  // Fetch the user's cards
  const userCards = await cardRepo.listUserCards(userId, { limit: 200 });
  if (userCards.length === 0) return null;

  const lower = trimmed.toLowerCase();

  // 2. Short ID prefix match (e.g. "137b8c24")
  const prefixMatches = userCards.filter((uc) => uc.id.toLowerCase().startsWith(lower));
  if (prefixMatches.length === 1) {
    return prefixMatches[0]!;
  }

  // 3. Album index number: if player types 1, 2, 3 (or #1, #2, #3)
  const indexMatch = trimmed.match(/^#?(\d+)$/);
  if (indexMatch) {
    const idx = parseInt(indexMatch[1]!, 10);
    if (idx >= 1 && idx <= userCards.length) {
      return userCards[idx - 1] ?? null;
    }
  }

  // 4. Character name match (case-insensitive substring)
  const nameMatches: UserCard[] = [];
  for (const uc of userCards) {
    const base = await cardRepo.findById(uc.cardId);
    if (base && base.name.toLowerCase().includes(lower)) {
      nameMatches.push(uc);
    }
  }
  if (nameMatches.length === 1) {
    return nameMatches[0]!;
  }

  // 5. Serial number match (e.g. #0042, 42, #0042/1000)
  const serialParse = trimmed.match(/^#?0*(\d+)(?:\/\d+)?$/);
  if (serialParse) {
    const serialNum = parseInt(serialParse[1]!, 10);
    const bySerial = userCards.filter((uc) => uc.serialNumber === serialNum);
    if (bySerial.length === 1) {
      return bySerial[0]!;
    }
  }

  // If there were multiple name matches, return the first one as fallback
  if (nameMatches.length > 1) {
    return nameMatches[0]!;
  }

  return null;
}
