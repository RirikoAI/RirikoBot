import 'server-only';
import type { RESTAPIPartialCurrentUserGuild } from 'discord-api-types/v10';
import { DiscordApiError, type DiscordOAuthClient } from '../auth/discord-oauth';
import type { ActiveSession, SessionService } from '../auth/session-service';
import { TtlCache } from '../ttl-cache';
import { canManageGuild } from './permissions';

/**
 * How long a user's guild list and permissions are reused. Losing Manage Server on Discord takes
 * effect on the dashboard within this window.
 */
export const USER_GUILDS_TTL_MS = 30_000;

export interface ManageableGuild {
  id: string;
  name: string;
  icon: string | null;
  /** False when the user manages the guild but has not invited the bot yet. */
  botPresent: boolean;
}

export interface GuildAccessDeps {
  sessions: Pick<SessionService, 'getDiscordAccessToken' | 'end'>;
  oauth: Pick<DiscordOAuthClient, 'getCurrentUserGuilds'>;
  /** IDs of every guild the bot is in (cached by the caller). */
  botGuildIds: () => Promise<ReadonlySet<string>>;
  now?: () => number;
}

/**
 * Guild discovery and authorization for the dashboard (ADR-013, decision 6). Every call
 * re-derives access from Discord data that is at most `USER_GUILDS_TTL_MS` old; nothing is
 * granted from client input or from an earlier page load.
 */
export class GuildAccessService {
  private readonly userGuilds: TtlCache<string, RESTAPIPartialCurrentUserGuild[] | null>;

  constructor(private readonly deps: GuildAccessDeps) {
    this.userGuilds = new TtlCache(USER_GUILDS_TTL_MS, deps.now);
  }

  /**
   * Guilds the user may manage, bot guilds first. Returns null when the Discord grant is gone
   * and the session has ended, so the caller must send the user through login again.
   */
  async listManageableGuilds(session: ActiveSession): Promise<ManageableGuild[] | null> {
    const [guilds, botGuildIds] = await Promise.all([
      this.userGuilds.get(session.id, () => this.fetchUserGuilds(session)),
      this.deps.botGuildIds(),
    ]);
    if (!guilds) return null;

    return guilds
      .filter(canManageGuild)
      .map((guild) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        botPresent: botGuildIds.has(guild.id),
      }))
      .sort((a, b) => Number(b.botPresent) - Number(a.botPresent) || a.name.localeCompare(b.name));
  }

  /**
   * The guild when the user may manage it and the bot is in it; otherwise `'denied'`.
   * `null` means the session has ended.
   */
  async checkAccess(
    session: ActiveSession,
    guildId: string,
  ): Promise<ManageableGuild | 'denied' | null> {
    const guilds = await this.listManageableGuilds(session);
    if (!guilds) return null;
    const guild = guilds.find((candidate) => candidate.id === guildId);
    return guild?.botPresent ? guild : 'denied';
  }

  private async fetchUserGuilds(
    session: ActiveSession,
  ): Promise<RESTAPIPartialCurrentUserGuild[] | null> {
    const accessToken = await this.deps.sessions.getDiscordAccessToken(session);
    if (!accessToken) return null;
    try {
      return await this.deps.oauth.getCurrentUserGuilds(accessToken);
    } catch (error) {
      // 401: the user deauthorized the app on Discord before the token expired.
      if (error instanceof DiscordApiError && error.status === 401) {
        await this.deps.sessions.end(session);
        return null;
      }
      throw error;
    }
  }
}
