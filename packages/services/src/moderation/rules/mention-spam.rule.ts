import type {
  AutoModRule,
  AutoModRuleConfig,
  ModerationContext,
  RuleEvaluationResult,
} from '../automod.types.js';

export class MentionSpamRule implements AutoModRule {
  readonly ruleType = 'MENTION_SPAM' as const;
  readonly name = 'Mention Spam Detector';

  private static readonly DEFAULT_THRESHOLD = 5;

  private static readonly USER_MENTION_REGEX = /<@!?(\d+)>/g;
  private static readonly ROLE_MENTION_REGEX = /<@&(\d+)>/g;
  private static readonly EVERYONE_HERE_REGEX = /@(everyone|here)\b/gi;

  /**
   * Counts the total number of mentions in text (user, role, everyone/here).
   */
  public countMentions(text: string): {
    userMentions: number;
    roleMentions: number;
    everyoneMentions: number;
    total: number;
  } {
    const userMatches = text.match(MentionSpamRule.USER_MENTION_REGEX) ?? [];
    const roleMatches = text.match(MentionSpamRule.ROLE_MENTION_REGEX) ?? [];
    const everyoneMatches = text.match(MentionSpamRule.EVERYONE_HERE_REGEX) ?? [];

    return {
      userMentions: userMatches.length,
      roleMentions: roleMatches.length,
      everyoneMentions: everyoneMatches.length,
      total: userMatches.length + roleMatches.length + everyoneMatches.length,
    };
  }

  async evaluate(
    context: ModerationContext,
    config?: AutoModRuleConfig,
  ): Promise<RuleEvaluationResult> {
    const threshold = config?.threshold ?? MentionSpamRule.DEFAULT_THRESHOLD;
    const text = context.content ?? '';

    // Calculate total mentions combining structured context and regex parsing
    let totalMentions = 0;
    let userCount = 0;
    let roleCount = 0;
    let everyoneCount = 0;

    if (context.mentions) {
      userCount = context.mentions.users ?? 0;
      roleCount = context.mentions.roles ?? 0;
      everyoneCount = context.mentions.everyone ? 1 : 0;
      totalMentions = userCount + roleCount + everyoneCount;
    }

    // Also parse raw text if structured mentions aren't populated or are fewer than regex matches
    const textCounts = this.countMentions(text);
    if (textCounts.total > totalMentions) {
      userCount = textCounts.userMentions;
      roleCount = textCounts.roleMentions;
      everyoneCount = textCounts.everyoneMentions;
      totalMentions = textCounts.total;
    }

    if (totalMentions > threshold) {
      return {
        matched: true,
        ruleType: this.ruleType,
        action: config?.action ?? 'DELETE',
        reason: `Mass mention detected (${totalMentions} mentions exceeds threshold of ${threshold})`,
        metadata: {
          totalMentions,
          threshold,
          userMentions: userCount,
          roleMentions: roleCount,
          everyoneMentions: everyoneCount,
        },
      };
    }

    return {
      matched: false,
      ruleType: this.ruleType,
      action: 'ALLOW',
      metadata: {
        totalMentions,
        threshold,
      },
    };
  }
}
