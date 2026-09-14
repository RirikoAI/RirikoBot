import { AppError, guildSettingsSchema, snowflakeSchema } from '@ririko/core';
import type { GuildSettings } from '@ririko/core';

export function conflict(): AppError {
  return new AppError('CONFLICT', 'Settings changed; reload and retry.');
}

export function validateSave(settings: GuildSettings, expectedRevision: number, actorId: string): GuildSettings {
  const parsed = guildSettingsSchema.safeParse(settings);
  if (!parsed.success || !snowflakeSchema.safeParse(actorId).success || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new AppError('VALIDATION', 'Invalid guild settings or audit actor.');
  }
  if (parsed.data.revision !== expectedRevision) throw conflict();
  const next = guildSettingsSchema.safeParse({ ...parsed.data, revision: expectedRevision + 1 });
  if (!next.success) throw new AppError('VALIDATION', 'The settings revision limit has been reached.');
  return next.data;
}

export function requireMigrated(current: number): void {
  if (current === 0) throw new AppError('MIGRATION_REQUIRED', 'Database schema is not initialized. Run the explicit migrate command first.');
}
