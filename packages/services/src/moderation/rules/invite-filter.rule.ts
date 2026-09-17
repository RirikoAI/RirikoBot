import type {
  AutoModRule,
  AutoModRuleConfig,
  ModerationContext,
  RuleEvaluationResult,
} from '../automod.types.js';

export class InviteFilterRule implements AutoModRule {
  readonly ruleType = 'INVITE_FILTER' as const;
  readonly name = 'Discord Invite Filter';

  /**
   * Comprehensive regex matching discord invite URLs:
   * - discord.gg/<code|vanity>
   * - discord.com/invite/<code|vanity>
   * - discordapp.com/invite/<code|vanity>
   * - discord.me/<code|vanity>
   * - discord.io/<code|vanity>
   * - discord.li/<code|vanity>
   */
  private static readonly INVITE_REGEX =
    /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|io|me|li)|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9-]{2,32})/gi;

  async evaluate(
    context: ModerationContext,
    config?: AutoModRuleConfig,
  ): Promise<RuleEvaluationResult> {
    const text = context.content;
    if (!text || text.trim().length === 0) {
      return {
        matched: false,
        ruleType: this.ruleType,
        action: 'ALLOW',
      };
    }

    const whitelist = new Set(
      (config?.whitelist ?? []).map((w) => w.trim().toLowerCase()),
    );

    // Reset regex index for stateful global regex
    InviteFilterRule.INVITE_REGEX.lastIndex = 0;

    const matches: Array<{ fullMatch: string; code: string }> = [];
    let match: RegExpExecArray | null;

    while ((match = InviteFilterRule.INVITE_REGEX.exec(text)) !== null) {
      const fullMatch = match[0];
      const code = match[1] ?? '';
      matches.push({ fullMatch, code });
    }

    if (matches.length === 0) {
      return {
        matched: false,
        ruleType: this.ruleType,
        action: 'ALLOW',
      };
    }

    // Check if any invite code is NOT whitelisted
    for (const item of matches) {
      const normalizedCode = item.code.toLowerCase();
      if (!whitelist.has(normalizedCode)) {
        return {
          matched: true,
          ruleType: this.ruleType,
          action: config?.action ?? 'DELETE',
          reason: `Unauthorized Discord invite link detected (${item.code})`,
          matchedContent: item.fullMatch,
          metadata: {
            inviteCode: item.code,
            fullMatch: item.fullMatch,
            totalInvitesFound: matches.length,
          },
        };
      }
    }

    // All found invites were whitelisted
    return {
      matched: false,
      ruleType: this.ruleType,
      action: 'ALLOW',
      metadata: {
        whitelistedInvites: matches.map((m) => m.code),
      },
    };
  }
}
