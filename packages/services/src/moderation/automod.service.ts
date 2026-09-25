import {
  AUTOMOD_RULE_DEFAULTS,
  AUTOMOD_TIMEOUT_SECONDS,
  type CoreEvents,
  type EventBus,
} from '@ririko/core';
import type { ModerationRepository } from '@ririko/database';
import type {
  AutoModAction,
  AutoModExecutionResult,
  AutoModRule,
  AutoModRuleConfig,
  AutoModRuleType,
  ModerationContext,
  RuleEvaluationResult,
} from './automod.types.js';
import {
  InviteFilterRule,
  PhishingShieldRule,
  MentionSpamRule,
  BurstSpamRule,
} from './rules/index.js';
import type { ModerationActionService } from './moderation-action.service.js';
import type { WarningEscalationService } from './warning-escalation.service.js';

interface CachedRuleConfigs {
  configs: Map<AutoModRuleType, AutoModRuleConfig>;
  cachedAt: number;
}

export class AutoModService {
  private readonly rules = new Map<AutoModRuleType, AutoModRule>();
  private readonly ruleCache = new Map<string, CachedRuleConfigs>();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly moderationRepo?: ModerationRepository | undefined,
    private readonly moderationActionService?: ModerationActionService | undefined,
    private readonly warningEscalationService?: WarningEscalationService | undefined,
    private readonly eventBus?: EventBus<CoreEvents> | undefined,
  ) {
    // Register default built-in rules
    this.registerRule(new PhishingShieldRule());
    this.registerRule(new InviteFilterRule());
    this.registerRule(new MentionSpamRule());
    this.registerRule(new BurstSpamRule());
  }

  /**
   * Registers or replaces an AutoMod rule in the pipeline.
   */
  public registerRule(rule: AutoModRule): void {
    this.rules.set(rule.ruleType, rule);
  }

  /**
   * Returns all registered rules.
   */
  public getRegisteredRules(): AutoModRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Invalidates cached rule configs for a guild or all guilds.
   */
  public invalidateRuleCache(guildId?: string): void {
    if (guildId) {
      this.ruleCache.delete(guildId);
    } else {
      this.ruleCache.clear();
    }
  }

  /**
   * Directly sets an in-memory rule config for a guild (useful for testing and instant overrides).
   */
  public setRuleConfig(guildId: string, config: AutoModRuleConfig): void {
    let cached = this.ruleCache.get(guildId);
    if (!cached) {
      cached = { configs: new Map(), cachedAt: Date.now() };
      this.ruleCache.set(guildId, cached);
    }
    cached.configs.set(config.ruleType, config);
  }

  /**
   * Gets default configuration for a given rule type.
   */
  public getDefaultConfig(ruleType: AutoModRuleType): AutoModRuleConfig {
    // Shared with the dashboard, which shows these values for rules a guild never saved.
    const config: AutoModRuleConfig = { ruleType, ...AUTOMOD_RULE_DEFAULTS[ruleType] };
    return ruleType === 'INVITE_FILTER' ? { ...config, whitelist: [] } : config;
  }

  /**
   * Loads configurations for all rules in a guild, using TTL cache with DB fallback.
   */
  public async getGuildRuleConfigs(
    guildId: string,
  ): Promise<Map<AutoModRuleType, AutoModRuleConfig>> {
    const cached = this.ruleCache.get(guildId);
    const now = Date.now();

    if (cached && now - cached.cachedAt < AutoModService.CACHE_TTL_MS) {
      return cached.configs;
    }

    const configs = new Map<AutoModRuleType, AutoModRuleConfig>();

    // Load from DB if repo is available
    if (this.moderationRepo) {
      try {
        const dbRules = await this.moderationRepo.getRules(guildId);
        for (const dbRule of dbRules) {
          const ruleType = dbRule.ruleType as AutoModRuleType;
          configs.set(ruleType, {
            ruleType,
            isEnabled: dbRule.isEnabled,
            action: (dbRule.action as AutoModAction) ?? 'DELETE',
            threshold: dbRule.threshold,
            exemptRoles: (dbRule.exemptRoles as string[]) ?? [],
            exemptChannels: (dbRule.exemptChannels as string[]) ?? [],
          });
        }
      } catch {
        // Fallback to defaults on DB error
      }
    }

    // Fill missing rules with defaults
    for (const ruleType of this.rules.keys()) {
      if (!configs.has(ruleType)) {
        configs.set(ruleType, this.getDefaultConfig(ruleType));
      }
    }

    this.ruleCache.set(guildId, { configs, cachedAt: now });
    return configs;
  }

  /**
   * Checks whether the context author or channel is exempt from moderation for this rule.
   */
  public isExempt(context: ModerationContext, config: AutoModRuleConfig): boolean {
    // 1. Bots are always ignored by AutoMod
    if (context.isBot) {
      return true;
    }

    // 2. Guild Owner is always exempt
    if (context.isOwner) {
      return true;
    }

    // 3. Members with administrative or moderation permissions bypass AutoMod
    if (context.memberPermissions) {
      const exemptPerms = [
        'Administrator',
        'ManageGuild',
        'ManageMessages',
        'ModerateMembers',
        'BanMembers',
      ];
      if (context.memberPermissions.some((p) => exemptPerms.includes(p))) {
        return true;
      }
    }

    // 4. Exempt channels
    if (
      config.exemptChannels &&
      config.exemptChannels.length > 0 &&
      config.exemptChannels.includes(context.channelId)
    ) {
      return true;
    }

    // 5. Exempt roles
    if (
      config.exemptRoles &&
      config.exemptRoles.length > 0 &&
      context.memberRoles &&
      context.memberRoles.some((roleId) => config.exemptRoles?.includes(roleId))
    ) {
      return true;
    }

    return false;
  }

  /**
   * Evaluates a message against all registered rules in priority order.
   * Priority:
   * 1. PHISHING_SHIELD (critical malicious threat)
   * 2. INVITE_FILTER (unauthorized advertising)
   * 3. MENTION_SPAM (mass ping disruption)
   * 4. BURST_SPAM (chat flooding)
   *
   * Short-circuits on the first rule violation detected.
   */
  public async evaluate(context: ModerationContext): Promise<RuleEvaluationResult | null> {
    const configs = await this.getGuildRuleConfigs(context.guildId);

    const priorityOrder: AutoModRuleType[] = [
      'PHISHING_SHIELD',
      'INVITE_FILTER',
      'MENTION_SPAM',
      'BURST_SPAM',
    ];

    for (const ruleType of priorityOrder) {
      const rule = this.rules.get(ruleType);
      if (!rule) continue;

      const config = configs.get(ruleType) ?? this.getDefaultConfig(ruleType);

      // Skip disabled rules
      if (!config.isEnabled) {
        continue;
      }

      // Check exemptions
      if (this.isExempt(context, config)) {
        continue;
      }

      const result = await rule.evaluate(context, config);
      if (result.matched) {
        return result;
      }
    }

    return null;
  }

  /**
   * Processes an incoming message context through the complete AutoMod pipeline:
   * 1. Evaluates rules
   * 2. Executes appropriate action (delete message, warn, timeout)
   * 3. Dispatches EventBus notifications
   */
  public async processMessage(context: ModerationContext): Promise<AutoModExecutionResult> {
    const evaluation = await this.evaluate(context);

    if (!evaluation || !evaluation.matched) {
      return {
        matched: false,
        deleted: false,
        punished: false,
      };
    }

    let deleted = false;
    let punished = false;
    let error: string | undefined;

    // 1. Delete message if action is DELETE, or if punitive action warrants deletion
    if (context.rawMessage && typeof context.rawMessage.delete === 'function') {
      try {
        await context.rawMessage.delete();
        deleted = true;
      } catch (err) {
        // Message might already have been deleted or missing permissions
        error = err instanceof Error ? err.message : String(err);
      }
    }

    // 2. Execute punitive action if required
    const action = evaluation.action;
    const reason = evaluation.reason ?? `AutoMod: ${evaluation.ruleType} violation`;

    if (action !== 'ALLOW' && action !== 'DELETE') {
      try {
        const caseReason = evaluation.reason ? `AutoMod: ${evaluation.reason}` : reason;
        const outcome = await this.punish(context, action, caseReason);
        punished = outcome.success;
        if (outcome.error) error = outcome.error;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    }

    // 3. Dispatch EventBus event
    if (this.eventBus) {
      await this.eventBus.emit('moderation:automodViolation', {
        guildId: context.guildId,
        channelId: context.channelId,
        userId: context.userId,
        ruleType: evaluation.ruleType,
        action: evaluation.action,
        reason,
        matchedContent: evaluation.matchedContent,
        messageId: context.messageId,
      });
    }

    return {
      matched: true,
      ruleType: evaluation.ruleType,
      actionTaken: evaluation.action,
      deleted,
      punished,
      reason,
      error,
      metadata: evaluation.metadata,
    };
  }

  /**
   * Runs a punitive action through the same services moderators use, with Ririko's own member
   * as the actor, so permission and role-hierarchy checks apply and a moderation case is
   * recorded. WARN goes through the escalation policy like `/warn`.
   */
  private async punish(
    context: ModerationContext,
    action: 'WARN' | 'TIMEOUT' | 'KICK' | 'BAN',
    reason: string,
  ): Promise<{ success: boolean; error?: string | undefined }> {
    const { guild, member } = context;
    if (!guild || !member) {
      return { success: false, error: `No guild member available for ${action}` };
    }
    const bot = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!bot) return { success: false, error: 'Bot member unavailable' };

    if (action === 'WARN') {
      if (!this.warningEscalationService) {
        return { success: false, error: 'Warning escalation service unavailable' };
      }
      const result = await this.warningEscalationService.issueWarning({
        guild,
        invoker: bot,
        target: member,
        reason,
        severity: 1,
      });
      return { success: result.success, error: result.error };
    }

    if (!this.moderationActionService) {
      return { success: false, error: 'Moderation action service unavailable' };
    }
    const params = { guild, invoker: bot, target: member, reason };
    const result =
      action === 'TIMEOUT'
        ? await this.moderationActionService.timeout({
            ...params,
            durationSeconds: AUTOMOD_TIMEOUT_SECONDS,
          })
        : action === 'KICK'
          ? await this.moderationActionService.kick(params)
          : await this.moderationActionService.ban(params);
    return { success: result.success, error: result.error };
  }
}
