import type { EnhancementResult } from '@ririko/services';
import type { BotServices } from '../../services.js';

/**
 * Enhances a gear piece by one level: the enhancement service spends the Crafting Dust, then the
 * credit cost is debited through the economy ledger. Returns the result and the dust left.
 */
export async function enhanceGear(
  services: BotServices,
  userId: string,
  userItemId: string,
  context: { guildId?: string | undefined; itemCode?: string | undefined } = {},
): Promise<EnhancementResult & { dustLeft: number }> {
  const balance = await services.economyRepo.getOrCreateBalance(userId);
  const result = await services.enhancementService.enhance(
    userId,
    userItemId,
    BigInt(balance.walletBalance),
  );

  if (result.creditsSpent > 0) {
    await services.economyRepo.modifyBalance({
      userId,
      walletDelta: -result.creditsSpent,
      type: 'ENHANCE_ITEM',
      source: 'TCG_FORGE',
      metadata: { itemCode: context.itemCode, newLevel: result.newLevel },
      guildId: context.guildId,
    });
  }

  return { ...result, dustLeft: await services.enhancementService.getDustBalance(userId) };
}
