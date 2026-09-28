import {
  AUTOMOD_ACTIONS,
  AUTOMOD_RULE_DEFAULTS,
  compareCommandOverrides,
  DEFAULT_ESCALATION_STEPS,
  DEFAULT_MUSIC_VOLUME,
  AI_SPEAKING_STYLES,
  AI_TOOL_NAMES,
  allowedAiTools,
  DEFAULT_AI_SPEAKING_STYLE,
  formatAiModelChoice,
  MAX_AI_PERSONA_PROMPT_LENGTH,
  parseAiModelChoice,
  type AiSpeakingStyle,
  IMAGE_PROVIDER_IDS,
  IMAGE_STYLE_PRESET_IDS,
  GuildConfigSchemas,
  ValidationError,
  WAGER_GAME_COMMANDS,
  type AutoModConfigurableAction,
  type AutoModRuleTypeName,
  type AutoVoiceHub,
  type CommandOverride,
  type GameRule,
  type GuildConfigModule,
  type GuildConfigValues,
  DEFAULT_CARD_TEXT_COLOR,
  DEFAULT_FAREWELL_MESSAGE,
  DEFAULT_WELCOME_MESSAGE,
  MAX_WELCOMER_MESSAGE_LENGTH,
  OptionalImageUrlSetting,
  SecurityError,
  type WelcomerCardKind,
} from '@ririko/core';
import { assertPublicUrl } from '../net/remote-image.js';
import {
  AiRepository,
  AuditLogRepository,
  AutoRoleRepository,
  AutoVoiceRepository,
  CommandCatalogRepository,
  CommandSettingsRepository,
  FreeGameRepository,
  GuildConfigVersionRepository,
  GuildSettingsRepository,
  ImageRepository,
  ModerationRepository,
  MusicRepository,
  WelcomerRepository,
  withTransaction,
  type AutoVoiceConfig,
  type CommandSettings,
  type DatabaseClient,
  type ModerationRule,
  type WelcomeConfig,
} from '@ririko/database';

/** Who changed a setting, recorded in `audit_logs`. */
export interface GuildConfigActor {
  userId: string;
  source: 'dashboard' | 'cli' | 'discord';
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
}

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * Thrown when an update fails its schema; `fieldErrors` maps each field to its messages. The
 * owner console's global settings use it too, with their own `subject`.
 */
export class GuildConfigValidationError extends ValidationError {
  constructor(
    readonly fieldErrors: Record<string, string[]>,
    subject = 'guild settings',
  ) {
    const messages = Object.entries(fieldErrors).map(
      ([field, errors]) => `${field}: ${errors.join(' ')}`,
    );
    super(`Invalid ${subject}: ${messages.join('; ')}`, {
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
export function fieldErrorsOf(issues: readonly { path: (string | number)[]; message: string }[]) {
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

/** Stored `command_settings` rows in the shape the schema and the bot use. */
export function toCommandOverrides(rows: readonly CommandSettings[]): CommandOverride[] {
  return rows
    .map((row) => ({
      command: row.commandName,
      channelId: row.channelId,
      enabled: row.isEnabled,
      allowedRoleIds: row.allowedRoles,
      blockedRoleIds: row.blockedRoles,
      cooldownSeconds: row.cooldownOverride,
    }))
    .sort(compareCommandOverrides);
}

function toCommandSettingsRows(overrides: readonly CommandOverride[]) {
  return overrides.map((row) => ({
    commandName: row.command,
    channelId: row.channelId,
    isEnabled: row.enabled,
    cooldownOverride: row.cooldownSeconds,
    allowedRoles: row.allowedRoleIds,
    blockedRoles: row.blockedRoleIds,
  }));
}

function isDefaultOverride(row: CommandOverride): boolean {
  return (
    row.enabled &&
    row.cooldownSeconds === null &&
    row.allowedRoleIds.length === 0 &&
    row.blockedRoleIds.length === 0
  );
}

function isWagerGame(name: string): name is GameRule['command'] {
  return (WAGER_GAME_COMMANDS as readonly string[]).includes(name);
}

/** The games' server-wide on/off state and cooldowns from `command_settings`, sorted by game. */
export function toGameRules(rows: readonly CommandSettings[]): GameRule[] {
  return rows
    .filter((row) => row.channelId === null && isWagerGame(row.commandName))
    .map((row) => ({
      command: row.commandName as GameRule['command'],
      enabled: row.isEnabled,
      cooldownSeconds: row.cooldownOverride,
    }))
    .filter((rule) => !rule.enabled || rule.cooldownSeconds !== null)
    .sort((a, b) => (a.command < b.command ? -1 : a.command > b.command ? 1 : 0));
}

/** Stored `auto_voice_configs` rows in the shape the schema uses, sorted by channel. */
export function toAutoVoiceHubs(rows: readonly AutoVoiceConfig[]): AutoVoiceHub[] {
  return rows
    .map((row) => ({
      channelId: row.parentChannelId,
      nameTemplate: row.channelNameTemplate,
      userLimit: row.userLimit,
      bitrate: row.bitrate,
    }))
    .sort((a, b) => (a.channelId === b.channelId ? 0 : a.channelId < b.channelId ? -1 : 1));
}

/**
 * Welcome or farewell card settings in `guild_welcomer` / `guild_farewell`. Values the bot
 * commands once saved without checks (a named color, a long message) are read back in a form
 * the schema accepts, so they never block saving other fields. A link replaces an upload.
 */
function welcomerCardStore<M extends 'welcome' | 'farewell'>(
  repo: WelcomerRepository,
  kind: M & WelcomerCardKind,
): ModuleStore<M> {
  const get = (guildId: string, tx?: DatabaseClient) =>
    kind === 'welcome' ? repo.getWelcomeConfig(guildId, tx) : repo.getFarewellConfig(guildId, tx);
  const defaultMessage = kind === 'welcome' ? DEFAULT_WELCOME_MESSAGE : DEFAULT_FAREWELL_MESSAGE;
  return {
    read: async (guildId, tx) => {
      const row = await get(guildId, tx);
      const channelId = row?.channelId || null;
      return {
        enabled: Boolean(row?.isEnabled && channelId),
        channelId,
        messageTemplate:
          row?.messageTemplate.trim().slice(0, MAX_WELCOMER_MESSAGE_LENGTH) || defaultMessage,
        textColor: /^#[0-9a-f]{6}$/i.test(row?.textColor ?? '')
          ? row!.textColor.toLowerCase()
          : DEFAULT_CARD_TEXT_COLOR,
        backgroundUrl: /^https?:\/\//i.test(row?.backgroundUrl ?? '') ? row!.backgroundUrl : null,
      } as GuildConfigValues<M>;
    },
    write: async (guildId, values, tx) => {
      const current = await get(guildId, tx);
      const data: WelcomeConfig = {
        guildId,
        // The column is required; an empty channel means the card is not set up.
        channelId: values.channelId ?? '',
        messageTemplate: values.messageTemplate,
        cardTheme: current?.cardTheme ?? 'DEFAULT',
        backgroundUrl: values.backgroundUrl,
        backgroundFile: values.backgroundUrl ? null : (current?.backgroundFile ?? null),
        textColor: values.textColor,
        isEnabled: values.enabled && values.channelId !== null,
      };
      if (kind === 'welcome') await repo.setWelcomeConfig(data, tx);
      else await repo.setFarewellConfig(data, tx);
    },
    // The bot and the dashboard preview fetch the background, so it must be a public address.
    check: async (patch) => {
      const link = OptionalImageUrlSetting.safeParse(patch.backgroundUrl);
      if (!link.success || !link.data) return {};
      try {
        await assertPublicUrl(link.data);
        return {};
      } catch (error) {
        if (!(error instanceof SecurityError)) throw error;
        return {
          backgroundUrl: [
            'Use a link to a public image; local and private addresses are not allowed.',
          ],
        };
      }
    },
  };
}

interface ModuleStore<M extends GuildConfigModule> {
  read(guildId: string, tx?: DatabaseClient): Promise<GuildConfigValues<M>>;
  write(guildId: string, values: GuildConfigValues<M>, tx: DatabaseClient): Promise<void>;
  /**
   * Checks the schema cannot make, such as where a link points. Runs on the submitted fields
   * before the transaction, so no lock is held while it waits on the network.
   */
  check?(patch: Record<string, unknown>): Promise<Record<string, string[]>>;
}

export interface GuildConfigServiceDeps {
  db: DatabaseClient;
  guildSettings: GuildSettingsRepository;
  moderation: ModerationRepository;
  commandSettings: CommandSettingsRepository;
  commandCatalog: CommandCatalogRepository;
  autoRoles: AutoRoleRepository;
  autoVoice: AutoVoiceRepository;
  music: MusicRepository;
  ai: AiRepository;
  images: ImageRepository;
  freeGames: FreeGameRepository;
  welcomer: WelcomerRepository;
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
      commands: {
        read: async (guildId, tx) => ({
          overrides: toCommandOverrides(await deps.commandSettings.listForGuild(guildId, tx)),
        }),
        write: async (guildId, values, tx) => {
          // Only the bot knows its commands; it writes them to the catalog at startup.
          const known = new Set((await deps.commandCatalog.list(tx)).map((entry) => entry.name));
          const unknown = [...new Set(values.overrides.map((row) => row.command))].filter(
            (name) => !known.has(name),
          );
          if (unknown.length > 0) {
            throw new GuildConfigValidationError({
              overrides: [
                known.size === 0
                  ? 'The command list is empty. Start the bot once so it can record its commands.'
                  : `Unknown command: ${unknown.map((name) => `\`${name}\``).join(', ')}.`,
              ],
            });
          }
          await deps.commandSettings.replaceForGuild(
            guildId,
            toCommandSettingsRows(values.overrides),
            tx,
          );
        },
      },
      autoroles: {
        read: async (guildId, tx) => {
          const row = await deps.autoRoles.getGuildAutoRoles(guildId, tx);
          return {
            enabled: row?.isEnabled ?? false,
            humanRoleIds: row?.humanRoleIds ?? [],
            botRoleIds: row?.botRoleIds ?? [],
            verificationRoleId: row?.verificationRoleId ?? null,
          };
        },
        write: async (guildId, values, tx) => {
          // The verification channel and message columns belong to `/autorole send-verify`.
          await deps.autoRoles.upsertGuildAutoRoles(
            {
              guildId,
              isEnabled: values.enabled,
              humanRoleIds: values.humanRoleIds,
              botRoleIds: values.botRoleIds,
              verificationRoleId: values.verificationRoleId,
            },
            tx,
          );
        },
      },
      autovoice: {
        read: async (guildId, tx) => ({
          hubs: toAutoVoiceHubs(await deps.autoVoice.listByGuildId(guildId, tx)),
        }),
        write: async (guildId, values, tx) => {
          const kept = new Set(values.hubs.map((hub) => hub.channelId));
          for (const row of await deps.autoVoice.listByGuildId(guildId, tx)) {
            if (!kept.has(row.parentChannelId)) await deps.autoVoice.delete(row.id, tx);
          }
          for (const hub of values.hubs) {
            await deps.autoVoice.upsert(
              {
                guildId,
                parentChannelId: hub.channelId,
                channelNameTemplate: hub.nameTemplate,
                userLimit: hub.userLimit,
                bitrate: hub.bitrate,
              },
              tx,
            );
          }
        },
      },
      xp: {
        read: async (guildId, tx) => {
          const row = await deps.guildSettings.findById(guildId, tx);
          return {
            levelUpAnnouncements: row?.karmaNotificationsEnabled ?? true,
            levelUpChannelId: row?.levelUpChannelId ?? null,
            xpRatePercent: row?.xpRatePercent ?? 100,
            noXpChannelIds: row?.noXpChannelIds ?? [],
            noXpRoleIds: row?.noXpRoleIds ?? [],
            voiceXpEnabled: row?.voiceXpEnabled ?? false,
          };
        },
        write: async (guildId, values, tx) => {
          const { levelUpAnnouncements, ...rest } = values;
          await deps.guildSettings.upsert(
            { guildId, karmaNotificationsEnabled: levelUpAnnouncements, ...rest },
            tx,
          );
        },
      },
      games: {
        read: async (guildId, tx) => {
          const [row, overrides] = await Promise.all([
            deps.guildSettings.findById(guildId, tx),
            deps.commandSettings.listForGuild(guildId, tx),
          ]);
          return { maxWager: row?.maxGameWager ?? null, rules: toGameRules(overrides) };
        },
        write: async (guildId, values, tx) => {
          await deps.guildSettings.upsert({ guildId, maxGameWager: values.maxWager }, tx);
          const overrides = toCommandOverrides(
            await deps.commandSettings.listForGuild(guildId, tx),
          );
          const isGameServerRow = (row: CommandOverride) =>
            row.channelId === null && isWagerGame(row.command);
          const next = overrides.filter((row) => !isGameServerRow(row));
          // A game's server-wide row keeps its roles (set on the Commands page); only the on/off
          // state and the cooldown come from the Games page.
          for (const command of WAGER_GAME_COMMANDS) {
            const current = overrides.find(
              (row) => isGameServerRow(row) && row.command === command,
            );
            const rule = values.rules.find((entry) => entry.command === command);
            const row: CommandOverride = {
              command,
              channelId: null,
              enabled: rule?.enabled ?? true,
              cooldownSeconds: rule?.cooldownSeconds ?? null,
              allowedRoleIds: current?.allowedRoleIds ?? [],
              blockedRoleIds: current?.blockedRoleIds ?? [],
            };
            if (!isDefaultOverride(row)) next.push(row);
          }
          await deps.commandSettings.replaceForGuild(guildId, toCommandSettingsRows(next), tx);
        },
      },
      music: {
        read: async (guildId, tx) => {
          const [row, channel] = await Promise.all([
            deps.music.getGuildSettings(guildId, tx),
            deps.music.getMusicChannel(guildId, tx),
          ]);
          return {
            defaultVolume: row?.defaultVolume ?? DEFAULT_MUSIC_VOLUME,
            musicChannelId: channel?.channelId ?? null,
            djRoleId: row?.djRoleId ?? null,
            autoLeaveEmpty: row?.autoLeaveEmpty ?? true,
          };
        },
        write: async (guildId, values, tx) => {
          const { musicChannelId, ...settings } = values;
          await deps.music.upsertGuildSettings(guildId, settings, tx);
          const current = await deps.music.getMusicChannel(guildId, tx);
          if (musicChannelId === null) {
            if (current) await deps.music.deleteMusicChannel(guildId, tx);
          } else if (current?.channelId !== musicChannelId) {
            // No message yet: the bot posts the controller when it sees the change.
            await deps.music.setMusicChannel(guildId, musicChannelId, null, tx);
          }
        },
      },
      ai: {
        read: async (guildId, tx) => {
          const [prefs, channelId] = await Promise.all([
            deps.ai.getGuildPreferences(guildId, tx),
            deps.ai.getAiChannel(guildId, tx),
          ]);
          const allowed = allowedAiTools(prefs);
          const style = AI_SPEAKING_STYLES.find(({ id }) => id === prefs?.speakingStyle)?.id;
          return {
            channelId,
            speakingStyle: style ?? DEFAULT_AI_SPEAKING_STYLE,
            // The personality engine uses at most this much of a longer prompt from /aipersona.
            personalityPrompt:
              prefs?.personalityPrompt?.trim().slice(0, MAX_AI_PERSONA_PROMPT_LENGTH) || null,
            tools: AI_TOOL_NAMES.filter((name) => allowed === undefined || allowed.includes(name)),
            model: formatAiModelChoice(prefs?.providerOverride, prefs?.modelOverride),
          };
        },
        write: async (guildId, values, tx) => {
          const choice = parseAiModelChoice(values.model);
          const everyTool = AI_TOOL_NAMES.every((name) => values.tools.includes(name));
          await deps.ai.upsertGuildPreferences(
            guildId,
            {
              speakingStyle: values.speakingStyle satisfies AiSpeakingStyle,
              personalityPrompt: values.personalityPrompt,
              toolsEnabled: values.tools.length > 0,
              // Every tool is stored as the empty list, so tools added later are allowed too.
              allowedTools: everyTool ? [] : values.tools,
              providerOverride: choice?.provider ?? null,
              modelOverride: choice?.model ?? null,
            },
            tx,
          );
          if (values.channelId === null) await deps.ai.removeAiChannel(guildId, tx);
          else await deps.ai.setAiChannel(guildId, values.channelId, tx);
        },
      },
      images: {
        read: async (guildId, tx) => {
          const row = await deps.images.getGuildSettings(guildId, tx);
          const provider = IMAGE_PROVIDER_IDS.find((id) => id === row?.defaultProvider);
          const preset = IMAGE_STYLE_PRESET_IDS.find((id) => id === row?.defaultPreset);
          return {
            defaultProvider: provider ?? null,
            memberDailyLimit: row?.memberDailyLimit ?? null,
            defaultPreset: preset ?? null,
          };
        },
        write: async (guildId, values, tx) => {
          await deps.images.saveGuildSettings({ guildId, ...values }, tx);
        },
      },
      freegames: {
        read: async (guildId, tx) => {
          const target = await deps.freeGames.getGuildChannel(guildId, tx);
          return {
            channelId: target?.channelId ?? null,
            pingRoleId: target?.mentionRoleId ?? null,
          };
        },
        write: async (guildId, values, tx) => {
          // Without a channel nothing is announced, so there is nobody to ping either.
          if (values.channelId === null) {
            await deps.freeGames.removeGuildChannel(guildId, tx);
            return;
          }
          await deps.freeGames.setGuildChannel(
            guildId,
            { channelId: values.channelId, mentionRoleId: values.pingRoleId },
            tx,
          );
        },
      },
      welcome: welcomerCardStore(deps.welcomer, 'welcome'),
      farewell: welcomerCardStore(deps.welcomer, 'farewell'),
      tcg: {
        read: async (guildId, tx) => {
          const row = await deps.guildSettings.findById(guildId, tx);
          return {
            dropsEnabled: row?.tcgDropsEnabled ?? false,
            dropChannelId: row?.tcgDropChannelId ?? null,
            dropMessageThreshold: row?.tcgDropMessageThreshold ?? 50,
            dropStartHour: row?.tcgDropStartHour ?? 8,
            dropEndHour: row?.tcgDropEndHour ?? 23,
            dropClaimTimeoutSeconds: row?.tcgDropClaimTimeoutSeconds ?? 60,
            dropCooldownMinutes: row?.tcgDropCooldownMinutes ?? 5,
            managerRoleId: row?.tcgManagerRoleId ?? null,
          };
        },
        write: async (guildId, values, tx) => {
          await deps.guildSettings.upsert(
            {
              guildId,
              tcgDropsEnabled: values.dropsEnabled,
              tcgDropChannelId: values.dropChannelId,
              tcgDropMessageThreshold: values.dropMessageThreshold,
              tcgDropStartHour: values.dropStartHour,
              tcgDropEndHour: values.dropEndHour,
              tcgDropClaimTimeoutSeconds: values.dropClaimTimeoutSeconds,
              tcgDropCooldownMinutes: values.dropCooldownMinutes,
              tcgManagerRoleId: values.managerRoleId,
            },
            tx,
          );
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
    const checkErrors = (await store.check?.(patch)) ?? {};
    if (Object.keys(checkErrors).length > 0) throw new GuildConfigValidationError(checkErrors);
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
      // Bump first: on Postgres its row lock orders concurrent saves of the same module, so a
      // store that replaces rows (commands) never interleaves two deletes and two inserts.
      await this.deps.versions.bump(guildId, module, now, tx);
      await store.write(guildId, values, tx);
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

/** A `GuildConfigService` with its own repositories on `db` (bot and CLI). */
export function createGuildConfigService(
  db: DatabaseClient,
  options: Pick<GuildConfigServiceDeps, 'defaultPrefix' | 'defaultTimezone' | 'now'>,
): GuildConfigService {
  return new GuildConfigService({
    db,
    guildSettings: new GuildSettingsRepository(db),
    moderation: new ModerationRepository(db),
    commandSettings: new CommandSettingsRepository(db),
    commandCatalog: new CommandCatalogRepository(db),
    autoRoles: new AutoRoleRepository(db),
    autoVoice: new AutoVoiceRepository(db),
    music: new MusicRepository(db),
    ai: new AiRepository(db),
    images: new ImageRepository(db),
    freeGames: new FreeGameRepository(db),
    welcomer: new WelcomerRepository(db),
    versions: new GuildConfigVersionRepository(db),
    audit: new AuditLogRepository(db),
    ...options,
  });
}
