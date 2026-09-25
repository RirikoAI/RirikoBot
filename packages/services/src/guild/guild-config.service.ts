import {
  GuildConfigSchemas,
  ValidationError,
  type GuildConfigModule,
  type GuildConfigValues,
} from '@ririko/core';
import {
  withTransaction,
  type AuditLogRepository,
  type DatabaseClient,
  type GuildConfigVersionRepository,
  type GuildSettingsRepository,
} from '@ririko/database';

/** Who changed a setting, recorded in `audit_logs`. */
export interface GuildConfigActor {
  userId: string;
  source: 'dashboard' | 'cli';
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
}

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

/** Thrown when an update fails its schema; `fieldErrors` maps each field to its messages. */
export class GuildConfigValidationError extends ValidationError {
  constructor(readonly fieldErrors: Record<string, string[]>) {
    const messages = Object.entries(fieldErrors).map(
      ([field, errors]) => `${field}: ${errors.join(' ')}`,
    );
    super(`Invalid guild settings: ${messages.join('; ')}`, {
      userMessage: messages.join('\n'),
      validationErrors: messages,
    });
  }
}

/** Fields whose values differ, compared by their JSON form so arrays and objects work too. */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldChange[] {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...fields]
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({ field, before: before[field], after: after[field] }));
}

interface ModuleStore<M extends GuildConfigModule> {
  read(guildId: string, tx?: DatabaseClient): Promise<GuildConfigValues<M>>;
  write(guildId: string, values: GuildConfigValues<M>, tx: DatabaseClient): Promise<void>;
}

export interface GuildConfigServiceDeps {
  db: DatabaseClient;
  guildSettings: GuildSettingsRepository;
  versions: GuildConfigVersionRepository;
  audit: AuditLogRepository;
  defaultPrefix: string;
  defaultTimezone?: string;
  now?: () => Date;
}

/**
 * The one write path for guild settings edited outside Discord (dashboard and CLI). Every
 * update validates against the shared schema from `@ririko/core`, writes through the existing
 * repositories, bumps the change feed so the bot drops its cache, and records an audit entry,
 * all in one transaction.
 */
export class GuildConfigService {
  private readonly stores: { [M in GuildConfigModule]: ModuleStore<M> };
  private readonly now: () => Date;

  constructor(private readonly deps: GuildConfigServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    const defaultTimezone = deps.defaultTimezone ?? 'UTC';
    this.stores = {
      general: {
        read: async (guildId, tx) => {
          const row = await deps.guildSettings.findById(guildId, tx);
          return {
            prefix: row?.prefix || deps.defaultPrefix,
            timezone: row?.timezone || defaultTimezone,
          };
        },
        write: async (guildId, values, tx) => {
          await deps.guildSettings.upsert({ guildId, ...values }, tx);
        },
      },
    };
  }

  get<M extends GuildConfigModule>(guildId: string, module: M): Promise<GuildConfigValues<M>> {
    return this.stores[module].read(guildId);
  }

  /**
   * Applies `patch` (any subset of the module's fields) and returns the saved values with the
   * fields that changed. Nothing is written when the values are unchanged.
   */
  async update<M extends GuildConfigModule>(
    guildId: string,
    module: M,
    patch: Record<string, unknown>,
    actor: GuildConfigActor,
  ): Promise<{ values: GuildConfigValues<M>; changes: FieldChange[] }> {
    const store = this.stores[module];
    return withTransaction(this.deps.db, async (tx) => {
      const before = await store.read(guildId, tx);
      const parsed = GuildConfigSchemas[module].safeParse({ ...before, ...patch });
      if (!parsed.success) {
        throw new GuildConfigValidationError(
          parsed.error.flatten((issue) => issue.message).fieldErrors as Record<string, string[]>,
        );
      }
      const values = parsed.data as GuildConfigValues<M>;
      const changes = diffFields(before, values);
      if (changes.length === 0) return { values: before, changes };

      const now = this.now();
      await store.write(guildId, values, tx);
      await this.deps.versions.bump(guildId, module, now, tx);
      await this.deps.audit.create(
        {
          guildId,
          actorUserId: actor.userId,
          action: `guild_config.${module}.update`,
          details: { source: actor.source, changes },
          ipAddress: actor.ipAddress ?? null,
          userAgent: actor.userAgent ?? null,
        },
        now,
        tx,
      );
      return { values, changes };
    });
  }
}
