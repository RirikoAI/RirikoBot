/**
 * Writes the bot's command catalog as JSON for the documentation site.
 *
 *   pnpm docs:commands            (writes website/src/data/commands.json)
 *   tsx scripts/export-commands.ts [output-file]
 *
 * It registers the real command definitions the way `ririko commands:sync` does, with an
 * in-memory database and an unconnected Discord client. No token, network or secret is needed,
 * so CI can run it. The workspace packages must be built first (`pnpm build`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_COMMAND_PREFIX } from '../packages/core/src/index.js';
import { createDatabaseClient } from '../packages/database/src/index.js';
import {
  CATEGORY_INFO,
  CommandRegistry,
  resolvePermissionNames,
  type Command,
} from '../packages/discord/src/index.js';
import { createCommandControllers, registerBotCommands } from '../apps/bot/src/command-set.js';
import { createBot } from '../apps/bot/src/index.js';
import { createBotServices } from '../apps/bot/src/services.js';

export interface CatalogOption {
  name: string;
  description: string;
  type: string;
  required: boolean;
  choices: { name: string; value: string | number }[];
}

export interface CatalogCommand {
  name: string;
  category: string;
  description: string;
  aliases: string[];
  usage: string | null;
  examples: string[];
  options: CatalogOption[];
  /** Discord permission names a member needs; empty for everyone. */
  permissions: string[];
  slash: boolean;
  prefix: boolean;
  cooldownSeconds: number;
}

export interface CatalogCategory {
  id: string;
  label: string;
  emoji: string;
  description: string;
}

export interface CommandCatalog {
  prefix: string;
  categories: CatalogCategory[];
  commands: CatalogCommand[];
}

/** Hidden and owner-only commands are not documented for server members. */
export function isDocumented(command: Command): boolean {
  return !command.metadata.isHidden && !command.metadata.isOwnerOnly;
}

export function toCatalogCommand(command: Command): CatalogCommand {
  const { metadata } = command;
  return {
    name: metadata.name,
    category: metadata.category,
    description: metadata.description,
    aliases: metadata.aliases ?? [],
    usage: metadata.usage ?? null,
    examples: metadata.examples ?? [],
    options: (metadata.options ?? []).map((option) => ({
      name: option.name,
      description: option.description,
      type: option.type,
      required: option.required === true,
      choices: option.choices ?? [],
    })),
    permissions: resolvePermissionNames(metadata.userPermissions ?? []),
    slash: metadata.slashEnabled !== false,
    prefix: metadata.prefixEnabled !== false,
    cooldownSeconds: metadata.cooldownSeconds ?? 0,
  };
}

/** The documented commands, sorted by category then name, with the categories that have any. */
export function buildCommandCatalog(
  commands: readonly Command[],
  prefix: string = DEFAULT_COMMAND_PREFIX,
): CommandCatalog {
  const entries = commands
    .filter(isDocumented)
    .map(toCatalogCommand)
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const used = new Set(entries.map((entry) => entry.category));
  const categories = Object.values(CATEGORY_INFO)
    .filter((info) => used.has(info.id))
    .map(({ id, label, emoji, description }) => ({ id, label, emoji, description }));
  return { prefix, categories, commands: entries };
}

/**
 * Registers every bot command in a registry, using an in-memory database so building the
 * commands never touches real data. `close` releases the client and the database.
 */
export async function loadBotCommands(
  prefix: string = DEFAULT_COMMAND_PREFIX,
): Promise<{ registry: CommandRegistry; close: () => Promise<void> }> {
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
    registry,
    close: async () => {
      await client.destroy();
      await db.close();
    },
  };
}

export const DEFAULT_OUTPUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../website/src/data/commands.json',
);

/** Writes the catalog and returns it. */
export async function exportCommands(output: string = DEFAULT_OUTPUT): Promise<CommandCatalog> {
  const prefix = process.env.DEFAULT_PREFIX || DEFAULT_COMMAND_PREFIX;
  const { registry, close } = await loadBotCommands(prefix);
  try {
    const catalog = buildCommandCatalog(registry.getAll(), prefix);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(catalog, null, 2)}\n`);
    return catalog;
  } finally {
    await close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_OUTPUT;
  exportCommands(output)
    .then((catalog) => {
      console.log(`Wrote ${catalog.commands.length} commands to ${output}`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
