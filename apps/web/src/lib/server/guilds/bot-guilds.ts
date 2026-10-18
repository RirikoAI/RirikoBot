import 'server-only';
import type { REST } from '@discordjs/rest';
import { Routes, type RESTGetAPICurrentUserGuildsResult } from 'discord-api-types/v10';
import { TtlCache } from '../ttl-cache';

export const BOT_GUILDS_TTL_MS = 60_000;
const PAGE_SIZE = 200;

/** IDs of every guild the bot is in, read with the bot token and shared by all dashboard users. */
export class BotGuildDirectory {
  private readonly cache: TtlCache<'all', ReadonlySet<string>>;

  constructor(
    private readonly rest: Pick<REST, 'get'>,
    now?: () => number,
  ) {
    this.cache = new TtlCache(BOT_GUILDS_TTL_MS, now);
  }

  guildIds(): Promise<ReadonlySet<string>> {
    return this.cache.get('all', () => this.fetchAll());
  }

  private async fetchAll(): Promise<ReadonlySet<string>> {
    const ids = new Set<string>();
    let after: string | undefined;
    for (;;) {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (after) query.set('after', after);
      const page = (await this.rest.get(Routes.userGuilds(), {
        query,
      })) as RESTGetAPICurrentUserGuildsResult;
      for (const guild of page) ids.add(guild.id);
      const last = page.at(-1);
      if (page.length < PAGE_SIZE || !last) return ids;
      after = last.id;
    }
  }
}
