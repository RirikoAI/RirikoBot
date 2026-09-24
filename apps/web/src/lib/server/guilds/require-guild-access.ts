import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { requireSession } from '../auth/session';
import type { ActiveSession } from '../auth/session-service';
import { getWebServices } from '../services';
import type { ManageableGuild } from './guild-access';

const SNOWFLAKE = /^\d{17,20}$/;

export interface GuildAccess {
  session: ActiveSession;
  guild: ManageableGuild;
}

/**
 * Authorization guard for every guild-scoped page, Server Action and route handler (ADR-013).
 * The guild ID comes from the client and is never trusted: access is re-derived from the
 * user's current Discord permissions and the bot's guild list on each call. Unauthorized and
 * unknown guilds both return 404 so guild IDs cannot be probed. Never move this check into
 * middleware (`proxy.ts`).
 */
export async function requireGuildAccess(guildId: string): Promise<GuildAccess> {
  if (!SNOWFLAKE.test(guildId)) notFound();
  const returnTo = `/dashboard/${guildId}`;
  const session = await requireSession(returnTo);
  const { guildAccess } = await getWebServices();

  const guild = await guildAccess.checkAccess(session, guildId);
  if (guild === null) redirect(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  if (guild === 'denied') notFound();
  return { session, guild };
}
