import { Routes, type REST } from 'discord.js';

/** Discord's page size limit for `GET /users/@me/guilds`. */
const GUILD_PAGE_SIZE = 200;

export interface BotGuild {
  id: string;
  name: string;
}

/** Every guild the bot's token is in, following Discord's pagination. */
export async function listBotGuilds(rest: REST): Promise<BotGuild[]> {
  const guilds: BotGuild[] = [];
  let after: string | undefined;
  for (;;) {
    const query = new URLSearchParams({ limit: String(GUILD_PAGE_SIZE) });
    if (after) query.set('after', after);
    const page = (await rest.get(Routes.userGuilds(), { query })) as BotGuild[];
    guilds.push(...page.map(({ id, name }) => ({ id, name })));
    if (page.length < GUILD_PAGE_SIZE) return guilds;
    after = page[page.length - 1]?.id;
  }
}
