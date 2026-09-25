import type { Guild, GuildMember } from 'discord.js';

export type AutoModRuleType =
  | 'INVITE_FILTER'
  | 'PHISHING_SHIELD'
  | 'MENTION_SPAM'
  | 'BURST_SPAM';

export type AutoModAction =
  | 'ALLOW'
  | 'DELETE'
  | 'WARN'
  | 'TIMEOUT'
  | 'KICK'
  | 'BAN';

export interface ModerationContext {
  guildId: string;
  channelId: string;
  userId: string;
  content: string;
  messageId?: string | undefined;
  memberRoles?: string[] | undefined;
  memberPermissions?: string[] | undefined;
  isBot?: boolean | undefined;
  isOwner?: boolean | undefined;
  createdTimestamp?: number | undefined;
  mentions?: {
    users?: number | undefined;
    roles?: number | undefined;
    everyone?: boolean | undefined;
  } | undefined;
  rawMessage?: {
    delete: () => Promise<unknown>;
    author?: { id: string; bot: boolean } | undefined;
    id?: string | undefined;
  } | undefined;
  /** Needed for WARN, TIMEOUT, KICK and BAN; without them a match only deletes the message. */
  guild?: Guild | undefined;
  member?: GuildMember | undefined;
}

export interface RuleEvaluationResult {
  matched: boolean;
  ruleType: AutoModRuleType;
  action: AutoModAction;
  reason?: string | undefined;
  matchedContent?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface AutoModRuleConfig {
  ruleType: AutoModRuleType;
  isEnabled: boolean;
  action: AutoModAction;
  threshold?: number | undefined;
  exemptRoles?: string[] | undefined;
  exemptChannels?: string[] | undefined;
  whitelist?: string[] | undefined;
  blacklist?: string[] | undefined;
  timeoutDurationSeconds?: number | undefined;
  warnSeverity?: number | undefined;
}

export interface AutoModRule {
  readonly ruleType: AutoModRuleType;
  readonly name: string;
  evaluate(
    context: ModerationContext,
    config?: AutoModRuleConfig | undefined,
  ): Promise<RuleEvaluationResult>;
}

export interface AutoModExecutionResult {
  matched: boolean;
  ruleType?: AutoModRuleType | undefined;
  actionTaken?: AutoModAction | undefined;
  deleted: boolean;
  punished: boolean;
  reason?: string | undefined;
  error?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}
