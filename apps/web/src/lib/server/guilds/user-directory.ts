import 'server-only';
import type { REST } from '@discordjs/rest';
import { Routes, type APIUser } from 'discord-api-types/v10';
import { userAvatarUrl } from '../discord-cdn';
import { TtlCache } from '../ttl-cache';

export const USER_NAMES_TTL_MS = 10 * 60_000;
const SNOWFLAKE = /^\d{17,20}$/;

export interface UserSummary {
  id: string;
  /** Display name, falling back to the username. */
  name: string;
  username: string;
  avatarUrl: string;
}

/**
 * Names for user IDs stored in moderation cases and audit logs, read with the bot token. A user
 * Discord cannot return is cached as unknown too, so pages do not refetch it on every view.
 */
export class UserDirectory {
  private readonly cache: TtlCache<string, UserSummary | null>;

  constructor(
    private readonly rest: Pick<REST, 'get'>,
    now?: () => number,
  ) {
    this.cache = new TtlCache(USER_NAMES_TTL_MS, now);
  }

  /** Users by ID. IDs that are not snowflakes (such as `cli:<name>`) or unknown are left out. */
  async lookup(ids: Iterable<string>): Promise<Map<string, UserSummary>> {
    const unique = [...new Set(ids)].filter((id) => SNOWFLAKE.test(id));
    const users = await Promise.all(unique.map((id) => this.cache.get(id, () => this.fetch(id))));
    return new Map(users.flatMap((user) => (user ? [[user.id, user] as const] : [])));
  }

  private async fetch(id: string): Promise<UserSummary | null> {
    try {
      const user = (await this.rest.get(Routes.user(id))) as APIUser;
      return {
        id: user.id,
        name: user.global_name ?? user.username,
        username: user.username,
        avatarUrl: userAvatarUrl(user),
      };
    } catch (error) {
      console.error(`[UserDirectory] Could not read user ${id}:`, error);
      return null;
    }
  }
}
