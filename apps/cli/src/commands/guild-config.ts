import { userInfo } from 'node:os';
import {
  DEFAULT_COMMAND_PREFIX,
  GUILD_CONFIG_MODULES,
  GuildConfigSchemas,
  isGuildConfigModule,
  ValidationError,
  type GuildConfigModule,
} from '@ririko/core';
import {
  AuditLogRepository,
  CommandCatalogRepository,
  CommandSettingsRepository,
  createDatabaseClient,
  GuildConfigVersionRepository,
  GuildSettingsRepository,
  ModerationRepository,
  type DatabaseClient,
} from '@ririko/database';
import { GuildConfigService, GuildConfigValidationError } from '@ririko/services/guild';
import type { Command } from 'commander';
import pc from 'picocolors';

const SNOWFLAKE = /^\d{17,20}$/;

interface ConfigKey {
  key: string;
  module: GuildConfigModule;
  field: string;
  description: string;
}

/** Every dashboard-configurable key as `module.field`, from the shared schemas. */
export function listConfigKeys(): ConfigKey[] {
  return GUILD_CONFIG_MODULES.flatMap((module) =>
    Object.entries(GuildConfigSchemas[module].shape).map(([field, schema]) => ({
      key: `${module}.${field}`,
      module,
      field,
      description: schema.description ?? '',
    })),
  );
}

function resolveKey(key: string): ConfigKey {
  const [module, field] = key.split('.');
  const match = listConfigKeys().find((entry) => entry.key === key);
  if (!module || !field || !isGuildConfigModule(module) || !match) {
    throw new ValidationError(`Unknown setting "${key}".`, {
      validationErrors: [
        `Valid keys: ${listConfigKeys()
          .map((entry) => entry.key)
          .join(', ')}`,
      ],
    });
  }
  return match;
}

/**
 * A setting value in the form `guild:config` accepts back: ID lists comma separated, rows as
 * JSON, and nothing (an empty string) for an unset ID.
 */
export function formatConfigValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value) && value.every((item) => typeof item === 'string'))
    return value.join(',');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** `cli:<os user>` so audit entries show who ran the command. */
function cliActor(): string {
  try {
    return `cli:${userInfo().username}`;
  } catch {
    return 'cli';
  }
}

/**
 * `ririko guild:config <guild_id> [key] [value]`: no key lists every setting, a key alone
 * prints its value, and a key with a value sets it through the same schema, service and audit
 * trail as the dashboard. Returns the lines to print.
 */
export async function runGuildConfig(
  service: GuildConfigService,
  guildId: string,
  key?: string,
  value?: string,
): Promise<string[]> {
  if (!SNOWFLAKE.test(guildId)) {
    throw new ValidationError(`"${guildId}" is not a Discord guild ID.`);
  }

  if (key === undefined) {
    const lines = [pc.bold(`Settings for guild ${guildId}`)];
    const keyWidth = Math.max(...listConfigKeys().map((entry) => entry.key.length));
    for (const module of GUILD_CONFIG_MODULES) {
      const values: Record<string, unknown> = await service.get(guildId, module);
      for (const entry of listConfigKeys().filter((candidate) => candidate.module === module)) {
        lines.push(
          `  ${pc.cyan(entry.key.padEnd(keyWidth))} ${(formatConfigValue(values[entry.field]) || '(none)').padEnd(24)} ${pc.gray(entry.description)}`,
        );
      }
    }
    return lines;
  }

  const entry = resolveKey(key);
  if (value === undefined) {
    const values: Record<string, unknown> = await service.get(guildId, entry.module);
    return [formatConfigValue(values[entry.field])];
  }

  try {
    const { changes } = await service.update(
      guildId,
      entry.module,
      { [entry.field]: value },
      { userId: cliActor(), source: 'cli' },
    );
    const change = changes.find((candidate) => candidate.field === entry.field);
    return change
      ? [
          `${pc.green('✔')} ${entry.key}: ${formatConfigValue(change.before) || '(none)'} → ${formatConfigValue(change.after) || '(none)'}`,
        ]
      : [`${entry.key} is already ${value.trim()}; nothing changed.`];
  } catch (error) {
    if (error instanceof GuildConfigValidationError) {
      throw new ValidationError(
        `Invalid value for ${entry.key}: ${error.fieldErrors[entry.field]?.join(' ') ?? error.message}`,
      );
    }
    throw error;
  }
}

export function createGuildConfigService(db: DatabaseClient): GuildConfigService {
  return new GuildConfigService({
    db,
    guildSettings: new GuildSettingsRepository(db),
    moderation: new ModerationRepository(db),
    commandSettings: new CommandSettingsRepository(db),
    commandCatalog: new CommandCatalogRepository(db),
    versions: new GuildConfigVersionRepository(db),
    audit: new AuditLogRepository(db),
    defaultPrefix: process.env.DEFAULT_PREFIX || DEFAULT_COMMAND_PREFIX,
  });
}

export function registerGuildConfigCommand(program: Command): void {
  program
    .command('guild:config')
    .description(
      'List, read or set dashboard guild settings (same validation and audit trail as the dashboard)',
    )
    .argument('<guild_id>', 'Discord guild ID')
    .argument('[key]', 'Setting as module.field, e.g. general.prefix; omit to list all')
    .argument(
      '[value]',
      'New value; omit to print the current one. Flags take true/false, ID lists are comma separated, rows are JSON, and "" clears a channel',
    )
    .action(async (guildId: string, key?: string, value?: string) => {
      const db = await createDatabaseClient({
        dialect: (process.env.DATABASE_DIALECT || 'sqlite') as 'sqlite' | 'postgres',
        url: process.env.DATABASE_URL || './data/ririko.sqlite',
      });
      try {
        const lines = await runGuildConfig(createGuildConfigService(db), guildId, key, value);
        console.log(lines.join('\n'));
      } finally {
        await db.close();
      }
    });
}
