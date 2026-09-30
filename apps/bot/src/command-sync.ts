import { listBotGuilds, type CommandSynchronizer } from '@ririko/discord';
import { Events, type Client, type Guild, type REST } from 'discord.js';

export interface StartupSyncOptions {
  sync: CommandSynchronizer;
  rest: REST;
  applicationId: string;
  /** Registers the per-server commands in this guild only, instead of every guild. */
  devGuildId?: string | undefined;
  log?: Pick<Console, 'log' | 'error'>;
}

/**
 * `SYNC_COMMANDS=true`: registers the global commands, then the per-server commands in the dev
 * guild or in every guild the bot is in. A failure is logged and startup continues.
 */
export async function syncCommandsOnStartup({
  sync,
  rest,
  applicationId,
  devGuildId,
  log = console,
}: StartupSyncOptions): Promise<void> {
  try {
    const global = await sync.syncGlobal(applicationId);
    log.log(`✓ Registered ${global.registeredCount} global commands.`);
  } catch (err) {
    log.error('✖ Failed to register global commands:', err);
  }

  let guildIds: string[];
  try {
    guildIds = devGuildId ? [devGuildId] : (await listBotGuilds(rest)).map((g) => g.id);
  } catch (err) {
    log.error('✖ Failed to list servers for per-server commands:', err);
    return;
  }
  let registered = 0;
  for (const guildId of guildIds) {
    try {
      await sync.syncGuild(applicationId, guildId);
      registered++;
    } catch (err) {
      log.error(`✖ Failed to register per-server commands in guild ${guildId}:`, err);
    }
  }
  log.log(`✓ Registered per-server commands in ${registered}/${guildIds.length} server(s).`);
}

/** Registers the per-server commands in each server the bot joins. */
export function registerGuildJoinCommandSync(
  client: Client,
  sync: CommandSynchronizer,
  applicationId: string,
  log: Pick<Console, 'error'> = console,
): void {
  client.on(Events.GuildCreate, (guild: Guild) => {
    sync.syncGuild(applicationId, guild.id).catch((err: unknown) => {
      log.error(`✖ Failed to register per-server commands in new guild ${guild.id}:`, err);
    });
  });
}
