/**
 * Permissions requested when inviting the bot. Same set as the 1.4.0 invite link, so servers
 * that switch versions grant exactly what they granted before; it deliberately omits
 * Administrator. The dashboard invite and the setup wizard's invite link both use it.
 *
 * This file imports nothing, so the dashboard can load it through `@ririko/discord/permissions`
 * without pulling in discord.js.
 */
export const BOT_INVITE_PERMISSIONS = 626721090433015n;
