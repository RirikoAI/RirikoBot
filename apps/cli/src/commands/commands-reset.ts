import { ValidationError } from '@ririko/core';
import { createRestClient, listBotGuilds } from '@ririko/discord';
import type { Command } from 'commander';
import { Routes, type REST } from 'discord.js';
import pc from 'picocolors';

export interface RegisteredCommands {
  /** Absent for the global scope. */
  guildId?: string;
  guildName?: string;
  names: string[];
}

export interface CommandScan {
  scopes: RegisteredCommands[];
  /** Guilds whose commands could not be read, usually a missing `applications.commands` scope. */
  unreadableGuilds: string[];
}

interface ApiCommand {
  name: string;
}

/**
 * Every application command Discord holds for this application: the global set plus each
 * guild-scoped set in the guilds the bot is in. Scopes with no commands are left out.
 */
export async function scanRegisteredCommands(
  rest: REST,
  applicationId: string,
): Promise<CommandScan> {
  const scopes: RegisteredCommands[] = [];
  const unreadableGuilds: string[] = [];

  const global = (await rest.get(Routes.applicationCommands(applicationId))) as ApiCommand[];
  if (global.length > 0) scopes.push({ names: global.map((c) => c.name) });

  for (const guild of await listBotGuilds(rest)) {
    try {
      const commands = (await rest.get(
        Routes.applicationGuildCommands(applicationId, guild.id),
      )) as ApiCommand[];
      if (commands.length > 0) {
        scopes.push({
          guildId: guild.id,
          guildName: guild.name,
          names: commands.map((c) => c.name),
        });
      }
    } catch {
      unreadableGuilds.push(guild.id);
    }
  }

  return { scopes, unreadableGuilds };
}

/** Replaces each scope's command set with an empty one. */
export async function clearRegisteredCommands(
  rest: REST,
  applicationId: string,
  scopes: readonly RegisteredCommands[],
): Promise<void> {
  for (const scope of scopes) {
    const route = scope.guildId
      ? Routes.applicationGuildCommands(applicationId, scope.guildId)
      : Routes.applicationCommands(applicationId);
    await rest.put(route, { body: [] });
  }
}

function scopeLabel(scope: RegisteredCommands): string {
  return scope.guildId ? `guild ${scope.guildName ?? ''} (${scope.guildId})`.trim() : 'global';
}

/**
 * Removes every slash and context-menu command this application has registered, so stale
 * commands from older bot versions disappear. Without `confirm` it only reports what it found.
 */
export async function runCommandsReset(
  rest: REST,
  applicationId: string,
  confirm: boolean,
): Promise<string[]> {
  const { scopes, unreadableGuilds } = await scanRegisteredCommands(rest, applicationId);
  const lines = scopes.map(
    (scope) =>
      `${pc.bold(scopeLabel(scope))}: ${scope.names.length} command(s) — ${scope.names.join(', ')}`,
  );
  if (unreadableGuilds.length > 0) {
    lines.push(
      pc.yellow(
        `Could not read commands in ${unreadableGuilds.length} guild(s): ${unreadableGuilds.join(', ')}`,
      ),
    );
  }

  if (scopes.length === 0) {
    lines.push('No registered commands found.');
    return lines;
  }
  if (!confirm) {
    lines.push(`Run again with ${pc.bold('--yes')} to remove them.`);
    return lines;
  }

  await clearRegisteredCommands(rest, applicationId, scopes);
  lines.push(
    `${pc.green('✔')} Removed commands from ${scopes.length} scope(s). Run ${pc.bold('ririko commands:sync --global --all-guilds')} to register the current commands.`,
  );
  return lines;
}

export function registerCommandsResetCommand(program: Command): void {
  program
    .command('commands:reset')
    .description(
      'Remove every registered slash/context-menu command (global and per guild) so the bot can register a clean set',
    )
    .option('--yes', 'Remove the commands; without it the command only lists them')
    .action(async (flags: { yes?: boolean }) => {
      const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
      const applicationId = process.env.DISCORD_CLIENT_ID || process.env.DISCORD_APPLICATION_ID;
      if (!token || !applicationId) {
        throw new ValidationError('DISCORD_TOKEN and DISCORD_CLIENT_ID must be set.');
      }
      const lines = await runCommandsReset(
        createRestClient(token),
        applicationId,
        flags.yes === true,
      );
      for (const line of lines) console.log(line);
    });
}
