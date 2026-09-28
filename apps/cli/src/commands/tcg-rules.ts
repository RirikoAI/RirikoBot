import { isTcgRulesKey, TCG_RULES_KEYS, TcgRulesSchema, ValidationError } from '@ririko/core';
import {
  AuditLogRepository,
  createDatabaseClient,
  TcgConfigRepository,
  type DatabaseClient,
} from '@ririko/database';
import { GuildConfigValidationError } from '@ririko/services/guild';
import { TcgRulesService } from '@ririko/services/owner';
import type { Command } from 'commander';
import pc from 'picocolors';
import { cliActor } from './guild-config.js';

/**
 * `ririko tcg:rules [key] [value]`: no key lists the global Waifu TCG rules, a key alone prints
 * its value, and a key with a value sets it through the same schema, service and audit trail
 * as the owner console. Returns the lines to print.
 */
export async function runTcgRules(
  service: TcgRulesService,
  key?: string,
  value?: string,
): Promise<string[]> {
  const values = await service.get();

  if (key === undefined) {
    const keyWidth = Math.max(...TCG_RULES_KEYS.map((name) => name.length));
    const shape = TcgRulesSchema.innerType().shape;
    return [
      pc.bold('Global Waifu TCG rules'),
      ...TCG_RULES_KEYS.map(
        (name) =>
          `  ${pc.cyan(name.padEnd(keyWidth))} ${String(values[name]).padEnd(6)} ${pc.gray(shape[name].description ?? '')}`,
      ),
    ];
  }

  if (!isTcgRulesKey(key)) {
    throw new ValidationError(`Unknown rule "${key}".`, {
      validationErrors: [`Valid keys: ${TCG_RULES_KEYS.join(', ')}`],
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
      const messages = Object.values(error.fieldErrors).flat();
      throw new ValidationError(`Invalid value for ${key}: ${messages.join(' ')}`);
    }
    throw error;
  }
}

export function createTcgRulesService(db: DatabaseClient): TcgRulesService {
  return new TcgRulesService({
    db,
    repository: new TcgConfigRepository(db),
    audit: new AuditLogRepository(db),
  });
}

export function registerTcgRulesCommand(program: Command): void {
  program
    .command('tcg:rules')
    .description(
      'List, read or set the global Waifu TCG rules: market tax and listing expiry, energy and potions (same validation and audit trail as the owner console)',
    )
    .argument('[key]', 'Rule name, e.g. marketTaxPercent; omit to list all')
    .argument('[value]', 'New whole-number value; omit to print the current one')
    .action(async (key?: string, value?: string) => {
      const db = await createDatabaseClient({
        dialect: (process.env.DATABASE_DIALECT || 'sqlite') as 'sqlite' | 'postgres',
        url: process.env.DATABASE_URL || './data/ririko.sqlite',
      });
      try {
        const lines = await runTcgRules(createTcgRulesService(db), key, value);
        console.log(lines.join('\n'));
      } finally {
        await db.close();
      }
    });
}
