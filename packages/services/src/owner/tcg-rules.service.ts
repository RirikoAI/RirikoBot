import {
  DEFAULT_TCG_RULES,
  MAX_MARKET_TAX_PERCENT,
  MIN_MARKET_TAX_PERCENT,
  TCG_RULES_KEYS,
  TcgRulesSchema,
  type TcgRules,
  type TcgRulesKey,
} from '@ririko/core';
import {
  withTransaction,
  type AuditLogRepository,
  type DatabaseClient,
  type TcgConfigRepository,
} from '@ririko/database';
import {
  diffFields,
  fieldErrorsOf,
  GuildConfigValidationError,
  type FieldChange,
  type GuildConfigActor,
} from '../guild/guild-config.service.js';

/** The `tcg_system_configs` key each rule is stored under. */
const STORAGE_KEYS: Record<TcgRulesKey, string> = {
  marketTaxPercent: 'market_tax_rate',
  listingExpiryDays: 'listing_expiry_days',
  globalMaxEnergyCap: 'global_max_energy_cap',
  baseEnergyCapacity: 'base_energy_capacity',
  energyScalingPerLevel: 'energy_scaling_per_level',
  dailyEnergyPotionLimit: 'daily_energy_restore_pot_limit',
  maxBonusEnergyCap: 'max_bonus_energy_cap',
  dailyBonusEnergyIncrement: 'daily_bonus_energy_increment',
};

/**
 * Keys no code reads any more: the TCG Manager Role is per guild now (its guild cannot be
 * known), dungeon curves belong to each season, and the daily reset comes from the
 * environment.
 */
export const RETIRED_TCG_CONFIG_KEYS = {
  managerRole: 'tcg_manager_role_id',
  unused: ['dungeon_scaling_model', 'dungeon_growth_rate', 'daily_replenish_cron'],
} as const;

/** How long the bot keeps rules before reading them again. */
export const TCG_RULES_CACHE_MS = 30_000;

export interface TcgRulesServiceDeps {
  db: DatabaseClient;
  repository: TcgConfigRepository;
  audit: AuditLogRepository;
  now?: () => Date;
  cacheMs?: number;
}

/**
 * Stored value for a rule. The market tax is kept as a fraction (0.05), as older bots wrote it.
 */
function toStored(key: TcgRulesKey, value: number): number {
  return key === 'marketTaxPercent' ? value / 100 : value;
}

/** A stored value as a rule, or `undefined` when it is missing or no longer valid. */
function fromStored(key: TcgRulesKey, raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  if (key === 'marketTaxPercent') {
    // Older bots allowed 0% to 50%; clamp to the current range instead of dropping it.
    const percent = Math.round(raw * 100);
    return Math.min(MAX_MARKET_TAX_PERCENT, Math.max(MIN_MARKET_TAX_PERCENT, percent));
  }
  const field = TcgRulesSchema.innerType().shape[key];
  const parsed = field.safeParse(raw);
  return parsed.success ? (parsed.data as number) : undefined;
}

/**
 * The global Waifu TCG rules (market tax and listing expiry, energy capacity, potions and
 * bonus energy). The bot reads them through `getRules`, cached for 30 seconds, so an owner's
 * change reaches running games without a restart. Writes are audited without a guild.
 */
export class TcgRulesService {
  private readonly now: () => Date;
  private readonly cacheMs: number;
  private cached: { rules: TcgRules; at: number } | null = null;

  constructor(private readonly deps: TcgRulesServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.cacheMs = deps.cacheMs ?? TCG_RULES_CACHE_MS;
  }

  /** The rules as stored, with defaults for any rule never saved. */
  async get(tx?: DatabaseClient): Promise<TcgRules> {
    const rules: TcgRules = { ...DEFAULT_TCG_RULES };
    for (const key of TCG_RULES_KEYS) {
      const value = fromStored(key, await this.deps.repository.getConfig(STORAGE_KEYS[key], tx));
      if (value !== undefined) rules[key] = value;
    }
    return rules;
  }

  /** The rules for gameplay, read again at most every 30 seconds. */
  async getRules(): Promise<TcgRules> {
    const at = this.now().getTime();
    if (this.cached && at - this.cached.at < this.cacheMs) return this.cached.rules;
    const rules = await this.get();
    this.cached = { rules, at };
    return rules;
  }

  /**
   * Applies `patch` (any subset of the rules) and returns the saved rules with the fields that
   * changed. Nothing is written when the rules are unchanged.
   */
  async update(
    patch: Record<string, unknown>,
    actor: GuildConfigActor,
  ): Promise<{ values: TcgRules; changes: FieldChange[] }> {
    const result = await withTransaction(this.deps.db, async (tx) => {
      const before = await this.get(tx);
      const parsed = TcgRulesSchema.safeParse({ ...before, ...patch });
      if (!parsed.success) {
        throw new GuildConfigValidationError(fieldErrorsOf(parsed.error.issues), 'TCG rules');
      }
      const values = parsed.data;
      const changes = diffFields(before, values);
      if (changes.length === 0) return { values: before, changes };

      const now = this.now();
      for (const { field } of changes) {
        const key = field as TcgRulesKey;
        await this.deps.repository.setConfig(
          STORAGE_KEYS[key],
          toStored(key, values[key]),
          actor.userId,
          tx,
        );
      }
      await this.deps.audit.create(
        {
          guildId: null,
          actorUserId: actor.userId,
          action: 'owner.tcg_rules.update',
          details: { source: actor.source, changes },
          ipAddress: actor.ipAddress ?? null,
          userAgent: actor.userAgent ?? null,
        },
        now,
        tx,
      );
      return { values, changes };
    });
    if (result.changes.length > 0) this.cached = null;
    return result;
  }

  /**
   * Deletes keys no code reads any more and returns the old global TCG Manager Role, if one was
   * set, so the bot can tell the owner to set it again per server.
   */
  async retireUnusedKeys(): Promise<string | null> {
    const roleId = await this.deps.repository.getConfig<unknown>(
      RETIRED_TCG_CONFIG_KEYS.managerRole,
    );
    for (const key of [RETIRED_TCG_CONFIG_KEYS.managerRole, ...RETIRED_TCG_CONFIG_KEYS.unused]) {
      await this.deps.repository.delete(key);
    }
    return typeof roleId === 'string' && roleId !== '' ? roleId : null;
  }
}
