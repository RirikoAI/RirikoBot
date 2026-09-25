import {
  AUTOMOD_ACTIONS,
  AUTOMOD_RULE_DEFAULTS,
  DEFAULT_ESCALATION_STEPS,
  GuildConfigSchemas,
  ValidationError,
  type AutoModConfigurableAction,
  type AutoModRuleTypeName,
  type GuildConfigModule,
  type GuildConfigValues,
} from '@ririko/core';
import {
  withTransaction,
  type AuditLogRepository,
  type DatabaseClient,
  type GuildConfigVersionRepository,
  type GuildSettingsRepository,
  type ModerationRepository,
  type ModerationRule,
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

/**
 * Field errors by top-level field. Errors inside a list keep their row number, which
 * `flatten()` would drop: `Row 3: Timeout steps need a length.`
 */
function fieldErrorsOf(issues: readonly { path: (string | number)[]; message: string }[]) {
  const fieldErrors: Record<string, string[]> = {};
  for (const { path, message } of issues) {
    const [field, row] = path;
    if (typeof field !== 'string') continue;
    (fieldErrors[field] ??= []).push(
      typeof row === 'number' ? `Row ${row + 1}: ${message}` : message,
    );
  }
  return fieldErrors;
}

/** AutoMod settings keys (`mentionSpamEnabled`, ...) and the `moderation_rules.rule_type` each one maps to. */
const AUTOMOD_RULE_KEYS = {
  inviteFilter: 'INVITE_FILTER',
  phishingShield: 'PHISHING_SHIELD',
  mentionSpam: 'MENTION_SPAM',
  burstSpam: 'BURST_SPAM',
} as const satisfies Record<string, AutoModRuleTypeName>;

/** Rules whose `threshold` the bot reads, and the settings key it is edited under. */
const AUTOMOD_LIMIT_KEYS: Partial<Record<AutoModRuleTypeName, string>> = {
  MENTION_SPAM: 'mentionSpamLimit',
  BURST_SPAM: 'burstSpamLimit',
};

function isConfigurableAction(action: string): action is AutoModConfigurableAction {
  return (AUTOMOD_ACTIONS as readonly string[]).includes(action);
}

/**
 * AutoMod settings as the bot runs them: a stored row wins, otherwise the rule's defaults.
 * A stored `ALLOW` (or unknown) action behaves like `DELETE`, because every match deletes the
 * message, so it is shown as `DELETE`.
 */
function readAutoModValues(rules: ModerationRule[]): GuildConfigValues<'automod'> {
  const values: Record<string, unknown> = {};
  for (const [key, ruleType] of Object.entries(AUTOMOD_RULE_KEYS)) {
    // `moderation_rules` has no unique key; like the bot, the last row of a type wins.
    const row = rules.findLast((rule) => rule.ruleType === ruleType);
    const defaults = AUTOMOD_RULE_DEFAULTS[ruleType];
    values[`${key}Enabled`] = row?.isEnabled ?? defaults.isEnabled;
    values[`${key}Action`] = row && isConfigurableAction(row.action) ? row.action : defaults.action;
    values[`${key}ExemptRoleIds`] = row?.exemptRoles ?? [];
    values[`${key}ExemptChannelIds`] = row?.exemptChannels ?? [];
    const limitKey = AUTOMOD_LIMIT_KEYS[ruleType];
    if (limitKey) values[limitKey] = row?.threshold ?? defaults.threshold;
  }
  return values as GuildConfigValues<'automod'>;
}

interface ModuleStore<M extends GuildConfigModule> {
  read(guildId: string, tx?: DatabaseClient): Promise<GuildConfigValues<M>>;
  write(guildId: string, values: GuildConfigValues<M>, tx: DatabaseClient): Promise<void>;
}

export interface GuildConfigServiceDeps {
  db: DatabaseClient;
  guildSettings: GuildSettingsRepository;
  moderation: ModerationRepository;
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
      moderation: {
        read: async (guildId, tx) => {
          const row = await deps.guildSettings.findById(guildId, tx);
          return {
            escalationSteps:
              row?.escalationSteps ?? DEFAULT_ESCALATION_STEPS.map((step) => ({ ...step })),
          };
        },
        write: async (guildId, values, tx) => {
          await deps.guildSettings.upsert({ guildId, escalationSteps: values.escalationSteps }, tx);
        },
      },
      automod: {
        read: async (guildId, tx) => readAutoModValues(await deps.moderation.getRules(guildId, tx)),
        write: async (guildId, values, tx) => {
          const fields = values as Record<string, unknown>;
          for (const [key, ruleType] of Object.entries(AUTOMOD_RULE_KEYS)) {
            const limitKey = AUTOMOD_LIMIT_KEYS[ruleType];
            await deps.moderation.upsertRule(
              {
                guildId,
                ruleType,
                isEnabled: fields[`${key}Enabled`] as boolean,
                action: fields[`${key}Action`] as string,
                // Rules without a limit keep whatever threshold their row already has.
                threshold: limitKey ? (fields[limitKey] as number) : undefined,
                exemptRoles: fields[`${key}ExemptRoleIds`] as string[],
                exemptChannels: fields[`${key}ExemptChannelIds`] as string[],
              },
              tx,
            );
          }
        },
      },
      logging: {
        read: async (guildId, tx) => {
          const row = await deps.guildSettings.findById(guildId, tx);
          return { logChannelId: row?.logChannelId ?? null };
        },
        write: async (guildId, values, tx) => {
          await deps.guildSettings.upsert({ guildId, logChannelId: values.logChannelId }, tx);
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
        throw new GuildConfigValidationError(fieldErrorsOf(parsed.error.issues));
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
