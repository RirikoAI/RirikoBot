import { DEFAULT_ECONOMY_CONFIG, EconomyConfigSchema, type EconomyConfig } from '@ririko/core';
import {
  withTransaction,
  type AuditLogRepository,
  type DatabaseClient,
  type EconomyConfigRepository,
} from '@ririko/database';
import {
  diffFields,
  fieldErrorsOf,
  GuildConfigValidationError,
  type FieldChange,
  type GuildConfigActor,
} from '../guild/guild-config.service.js';

export interface EconomyConfigServiceDeps {
  db: DatabaseClient;
  repository: EconomyConfigRepository;
  audit: AuditLogRepository;
  now?: () => Date;
}

/**
 * The global economy values (daily reward, streak bonus, bank capacity). Reads go to the
 * database on every call, so the bot picks up an owner's change on the next `/daily` or
 * deposit without a restart or a change signal. Writes are audited without a guild.
 */
export class EconomyConfigService {
  private readonly now: () => Date;

  constructor(private readonly deps: EconomyConfigServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async get(tx?: DatabaseClient): Promise<EconomyConfig> {
    const row = await this.deps.repository.get(tx);
    if (!row) return { ...DEFAULT_ECONOMY_CONFIG };
    return {
      dailyBaseReward: row.dailyBaseReward,
      dailyStreakBonusPercent: row.dailyStreakBonusPercent,
      dailyMaxStreakBonusPercent: row.dailyMaxStreakBonusPercent,
      bankBaseCapacity: row.bankBaseCapacity,
      bankCapacityPerLevel: row.bankCapacityPerLevel,
    };
  }

  /**
   * Applies `patch` (any subset of the values) and returns the saved values with the fields
   * that changed. Nothing is written when the values are unchanged.
   */
  async update(
    patch: Record<string, unknown>,
    actor: GuildConfigActor,
  ): Promise<{ values: EconomyConfig; changes: FieldChange[] }> {
    return withTransaction(this.deps.db, async (tx) => {
      const before = await this.get(tx);
      const parsed = EconomyConfigSchema.safeParse({ ...before, ...patch });
      if (!parsed.success) {
        throw new GuildConfigValidationError(
          fieldErrorsOf(parsed.error.issues),
          'economy settings',
        );
      }
      const values = parsed.data;
      const changes = diffFields(before, values);
      if (changes.length === 0) return { values: before, changes };

      const now = this.now();
      await this.deps.repository.save(values, actor.userId, now, tx);
      await this.deps.audit.create(
        {
          guildId: null,
          actorUserId: actor.userId,
          action: 'owner.economy_config.update',
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
