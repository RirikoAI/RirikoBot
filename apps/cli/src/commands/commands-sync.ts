import { DEFAULT_COMMAND_PREFIX, ValidationError } from '@ririko/core';
import {
  createBot,
  createBotServices,
  createCommandControllers,
  registerBotCommands,
} from '@ririko/bot';
import { createDatabaseClient } from '@ririko/database';
import {
  COMMAND_LIMITS,
  CommandRegistry,
  CommandSynchronizer,
  countPayloads,
  createRestClient,
  listBotGuilds,
  type SyncResult,
} from '@ririko/discord';
import type { Command } from 'commander';
import type { REST } from 'discord.js';
import pc from 'picocolors';

const SNOWFLAKE = /^\d{17,20}$/;

export interface SyncTargets {
  global: boolean;
  guildIds: string[];
  allGuilds: boolean;
}

function describeResult(result: SyncResult, guildName?: string): string {
  const where =
    result.scope === 'global'
      ? 'global'
      : `guild ${guildName ? `${guildName} ` : ''}(${result.guildId})`;
  return `${pc.green('✔')} ${pc.bold(where)}: registered ${result.registeredCount} command(s)`;
}

function usageLines(sync: CommandSynchronizer): string[] {
  const global = countPayloads(sync.generatePayloads({ scope: 'global' }));
  const guild = countPayloads(sync.generatePayloads({ scope: 'guild' }));
  const used = (count: number, max: number) => `${count}/${max} (${max - count} free)`;
  return [
    `${pc.bold('global')}: slash ${used(global.chatInput, COMMAND_LIMITS.chatInput)}, message menus ${used(global.message, COMMAND_LIMITS.message)}, user menus ${used(global.user, COMMAND_LIMITS.user)}`,
    `${pc.bold('per server')}: slash ${used(guild.chatInput, COMMAND_LIMITS.chatInput)}`,
    `Nothing registered. Pass ${pc.bold('--global')}, ${pc.bold('--guild <id>')} or ${pc.bold('--all-guilds')} to register commands.`,
  ];
}

/**
 * Replaces the registered commands in each requested scope with the bot's current set. Without
 * a target it only reports how many slots each scope uses. Limits are checked before any write.
 */
export async function runCommandsSync(
  sync: CommandSynchronizer,
  rest: REST,
  applicationId: string,
  targets: SyncTargets,
): Promise<string[]> {
  const invalid = targets.guildIds.filter((id) => !SNOWFLAKE.test(id));
  if (invalid.length > 0) {
    throw new ValidationError(`Not a Discord server ID: ${invalid.join(', ')}`);
  }
  if (!targets.global && !targets.allGuilds && targets.guildIds.length === 0) {
    return usageLines(sync);
  }

  // Build both scopes first, so a limit error stops the run before anything is written.
  sync.generatePayloads({ scope: 'global' });
  sync.generatePayloads({ scope: 'guild' });

  const lines: string[] = [];
  if (targets.global) lines.push(describeResult(await sync.syncGlobal(applicationId)));

  const guilds = new Map<string, string | undefined>(targets.guildIds.map((id) => [id, undefined]));
  if (targets.allGuilds) {
    for (const guild of await listBotGuilds(rest)) guilds.set(guild.id, guild.name);
  }
  for (const [guildId, name] of guilds) {
    try {
      lines.push(describeResult(await sync.syncGuild(applicationId, guildId), name));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      lines.push(pc.red(`✖ guild ${name ? `${name} ` : ''}(${guildId}): ${reason}`));
    }
  }
  if (targets.global) {
    lines.push('Global command changes can take a while to show; press Ctrl+R in Discord.');
  }
  return lines;
}

/**
 * Registers every bot command in a registry, using an in-memory database so building the
 * commands never touches the bot's real data.
 */
async function buildSynchronizer(rest: REST): Promise<{
  sync: CommandSynchronizer;
  close: () => Promise<void>;
}> {
  const prefix = process.env.DEFAULT_PREFIX || DEFAULT_COMMAND_PREFIX;
  const db = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:', autoMigrate: true });
  const { client } = createBot();
  const services = await createBotServices(db, client);
  const registry = new CommandRegistry();
  registerBotCommands(registry, {
    services,
    controllers: createCommandControllers(client, services, prefix),
    helpOptions: { defaultPrefix: prefix },
    prefix,
    version: '',
  });
  return {
    sync: new CommandSynchronizer(rest, registry),
    close: async () => {
      await client.destroy();
      await db.close();
    },
  };
}

export function registerCommandsSyncCommand(program: Command): void {
  program
    .command('commands:sync')
    .description(
      'Register the bot slash and context-menu commands with Discord, globally or per server, without restarting the bot',
    )
    .option('--global', 'Register the global commands (member commands and context menus)')
    .option(
      '--guild <id>',
      'Register the per-server (admin and setup) commands in this server; repeatable',
      (id: string, ids: string[]) => [...ids, id],
      [] as string[],
    )
    .option('--all-guilds', 'Register the per-server commands in every server the bot is in')
    .action(async (flags: { global?: boolean; guild: string[]; allGuilds?: boolean }) => {
      const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
      const applicationId = process.env.DISCORD_CLIENT_ID || process.env.DISCORD_APPLICATION_ID;
      if (!token || !applicationId) {
        throw new ValidationError('DISCORD_TOKEN and DISCORD_CLIENT_ID must be set.');
      }
      const rest = createRestClient(token);
      const { sync, close } = await buildSynchronizer(rest);
      try {
        const lines = await runCommandsSync(sync, rest, applicationId, {
          global: flags.global === true,
          guildIds: flags.guild,
          allGuilds: flags.allGuilds === true,
        });
        for (const line of lines) console.log(line);
      } finally {
        await close();
      }
    });
}
