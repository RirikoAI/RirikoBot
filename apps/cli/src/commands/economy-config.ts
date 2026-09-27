import {
  ECONOMY_CONFIG_KEYS,
  EconomyConfigSchema,
  isEconomyConfigKey,
  ValidationError,
} from '@ririko/core';
import {
  AuditLogRepository,
  createDatabaseClient,
  EconomyConfigRepository,
  type DatabaseClient,
} from '@ririko/database';
import { GuildConfigValidationError } from '@ririko/services/guild';
import { EconomyConfigService } from '@ririko/services/owner';
import type { Command } from 'commander';
import pc from 'picocolors';
import { cliActor } from './guild-config.js';

/**
 * `ririko economy:config [key] [value]`: no key lists the global economy values, a key alone
 * prints its value, and a key with a value sets it through the same schema, service and audit
 * trail as the owner console. Returns the lines to print.
 */
export async function runEconomyConfig(
  service: EconomyConfigService,
  key?: string,
  value?: string,
): Promise<string[]> {
  const values = await service.get();

  if (key === undefined) {
    const keyWidth = Math.max(...ECONOMY_CONFIG_KEYS.map((name) => name.length));
    return [
      pc.bold('Global economy settings'),
      ...ECONOMY_CONFIG_KEYS.map(
        (name) =>
          `  ${pc.cyan(name.padEnd(keyWidth))} ${String(values[name]).padEnd(12)} ${pc.gray(EconomyConfigSchema.shape[name].description ?? '')}`,
      ),
    ];
  }

  if (!isEconomyConfigKey(key)) {
    throw new ValidationError(`Unknown setting "${key}".`, {
      validationErrors: [`Valid keys: ${ECONOMY_CONFIG_KEYS.join(', ')}`],
    });
  }
  if (value === undefined) return [String(values[key])];

  try {
    const { changes } = await service.update(
      { [key]: value },
      { userId: cliActor(), source: 'cli' },
    );
    const change = changes.find((candidate) => candidate.field === key);
    return change
      ? [`${pc.green('✔')} ${key}: ${String(change.before)} → ${String(change.after)}`]
      : [`${key} is already ${value.trim()}; nothing changed.`];
  } catch (error) {
    if (error instanceof GuildConfigValidationError) {
      throw new ValidationError(
        `Invalid value for ${key}: ${error.fieldErrors[key]?.join(' ') ?? error.message}`,
      );
    }
    throw error;
  }
}

export function createEconomyConfigService(db: DatabaseClient): EconomyConfigService {
  return new EconomyConfigService({
    db,
    repository: new EconomyConfigRepository(db),
    audit: new AuditLogRepository(db),
  });
}

export function registerEconomyConfigCommand(program: Command): void {
  program
    .command('economy:config')
    .description(
      'List, read or set the global economy values: daily reward and bank capacity (same validation and audit trail as the owner console)',
    )
    .argument('[key]', `Setting name, e.g. dailyBaseReward; omit to list all`)
    .argument('[value]', 'New whole-number value; omit to print the current one')
    .action(async (key?: string, value?: string) => {
      const db = await createDatabaseClient({
        dialect: (process.env.DATABASE_DIALECT || 'sqlite') as 'sqlite' | 'postgres',
        url: process.env.DATABASE_URL || './data/ririko.sqlite',
      });
      try {
        const lines = await runEconomyConfig(createEconomyConfigService(db), key, value);
        console.log(lines.join('\n'));
      } finally {
        await db.close();
      }
    });
}
