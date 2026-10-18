import type { CommandContext } from '@ririko/discord';
import { DEFAULT_COMMAND_PREFIX } from '@ririko/discord';
import type { BotServices } from '../../services.js';

/**
 * Resolves the active command prefix for the current command context.
 *
 * Precedence:
 * 1. `ctx.invokedPrefix` if invoked as a prefix command and not '/'
 * 2. Guild configured prefix via `guildSettingsService.getPrefix` (with in-memory cache)
 * 3. `process.env.DEFAULT_PREFIX` or `DEFAULT_COMMAND_PREFIX` ('!') in DMs or if unconfigured.
 */
export async function resolveContextPrefix(
  ctx: CommandContext,
  services?: Pick<BotServices, 'guildSettingsService'>,
  fallback: string = process.env.DEFAULT_PREFIX || DEFAULT_COMMAND_PREFIX,
): Promise<string> {
  if (ctx.invokedPrefix && ctx.invokedPrefix !== '/') {
    return ctx.invokedPrefix;
  }

  if (ctx.guildId && services?.guildSettingsService) {
    try {
      return await services.guildSettingsService.getPrefix(ctx.guildId, fallback);
    } catch {
      return fallback;
    }
  }

  return fallback;
}
