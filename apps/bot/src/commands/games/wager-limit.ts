import type { BotServices } from '../../services.js';

/**
 * The refusal to show when `wager` is above the server's maximum wager, or null when the wager
 * is allowed (no wager, no guild, or no limit).
 */
export async function wagerLimitRefusal(
  services: Pick<BotServices, 'guildSettingsService'>,
  guildId: string | null | undefined,
  wager: number | null | undefined,
): Promise<string | null> {
  if (!guildId || !wager || wager <= 0) return null;
  const { maxGameWager } = await services.guildSettingsService.getSettings(guildId);
  if (maxGameWager === null || wager <= maxGameWager) return null;
  return `❌ This server allows wagers of at most **${maxGameWager.toLocaleString()} credits**.`;
}
