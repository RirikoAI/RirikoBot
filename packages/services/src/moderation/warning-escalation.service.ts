import {
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
} from 'discord.js';
import type { EventBus, CoreEvents } from '@ririko/core';
import type {
  ModerationRepository,
  ModerationWarning,
} from '@ririko/database';
import { PermissionService } from './permission.service.js';
import { ModerationActionService } from './moderation-action.service.js';
import type { ModerationActionResult } from './types.js';

export interface EscalationStep {
  warnThreshold: number;
  action: 'WARN' | 'TIMEOUT' | 'KICK' | 'BAN';
  durationSeconds?: number | undefined;
}

export const DEFAULT_ESCALATION_STEPS: EscalationStep[] = [
  { warnThreshold: 1, action: 'WARN' },
  { warnThreshold: 2, action: 'WARN' },
  { warnThreshold: 3, action: 'TIMEOUT', durationSeconds: 600 }, // 10 minutes
  { warnThreshold: 4, action: 'TIMEOUT', durationSeconds: 3600 }, // 1 hour
  { warnThreshold: 5, action: 'TIMEOUT', durationSeconds: 86400 }, // 24 hours
  { warnThreshold: 6, action: 'BAN' }, // Permanent server ban
];

export interface IssueWarningParams {
  guild: Guild;
  invoker: GuildMember;
  target: GuildMember;
  reason: string;
  severity?: number | undefined;
  expirationDays?: number | undefined;
  sendDm?: boolean | undefined;
}

export interface WarningIssueResult {
  success: boolean;
  warning?: ModerationWarning | undefined;
  caseNumber?: number | undefined;
  caseId?: string | undefined;
  totalActiveWarnings: number;
  cumulativeScore: number;
  escalationTriggered?: EscalationStep | undefined;
  escalationResult?: ModerationActionResult | undefined;
  dmSent?: boolean | undefined;
  error?: string | undefined;
}

export interface EscalationEvaluation {
  activeCount: number;
  cumulativeScore: number;
  triggeredStep?: EscalationStep | undefined;
  nextStep?: EscalationStep | undefined;
  pointsToNextStep?: number | undefined;
}

export class WarningEscalationService {
  constructor(
    private readonly modRepo: ModerationRepository,
    private readonly permissionService: PermissionService,
    private readonly moderationActionService: ModerationActionService,
    private readonly eventBus?: EventBus<CoreEvents> | undefined,
  ) {}

  /**
   * Issues a formal warning, calculates cumulative weighted score, and executes
   * any triggered punitive escalation steps.
   */
  async issueWarning(params: IssueWarningParams): Promise<WarningIssueResult> {
    const {
      guild,
      invoker,
      target,
      reason,
      severity = 1,
      expirationDays = 30,
      sendDm = true,
    } = params;

    // 1. Permission and Role Hierarchy Check
    const permCheck = await this.permissionService.validate({
      guild,
      invoker,
      target,
      requiredInvokerPermissions: [PermissionFlagsBits.ModerateMembers],
      requiredBotPermissions: [PermissionFlagsBits.ModerateMembers],
    });

    if (!permCheck.allowed) {
      return {
        success: false,
        totalActiveWarnings: 0,
        cumulativeScore: 0,
        error: permCheck.message,
      };
    }

    // 2. Compute Expiration Date (Sliding window)
    const expiresAt =
      expirationDays > 0 ? new Date(Date.now() + expirationDays * 86400000) : null;

    // 3. Persist Warning Record
    const warning = await this.modRepo.createWarning({
      guildId: guild.id,
      userId: target.id,
      moderatorId: invoker.id,
      reason,
      severity,
      expiresAt,
    });

    // 4. Retrieve Active Warnings & Calculate Cumulative Score
    const activeWarnings = await this.modRepo.getActiveWarnings(guild.id, target.id);
    const cumulativeScore = this.calculateWarningScore(activeWarnings);

    // 5. Evaluate Escalation Policy
    const policy = await this.getEscalationPolicy(guild.id);
    const escalationStep = this.findMatchingEscalationStep(policy, cumulativeScore);

    // 6. Execute Escalation Action if beyond WARN
    let escalationResult: ModerationActionResult | undefined;
    if (escalationStep && escalationStep.action !== 'WARN') {
      escalationResult = await this.executeEscalationAction(
        guild,
        invoker,
        target,
        escalationStep,
        activeWarnings.length,
        cumulativeScore,
        reason,
      );
    }

    // 7. Send Direct Message Notification
    let dmSent = false;
    if (sendDm) {
      dmSent = await this.sendWarningDm(
        target,
        guild.name,
        reason,
        severity,
        activeWarnings.length,
        cumulativeScore,
        expiresAt,
        escalationStep,
      );
    }

    // 8. Persist Case Record in Database
    let caseRecord = null;
    try {
      caseRecord = await this.modRepo.createCase({
        guildId: guild.id,
        type: 'WARN',
        targetUserId: target.id,
        moderatorUserId: invoker.id,
        reason,
        metadata: {
          severity,
          cumulativeScore,
          warningId: warning.id,
          escalationAction: escalationStep?.action,
        },
      });
    } catch (err: unknown) {
      console.error('[WarningEscalationService] Failed to persist case record:', err);
    }

    // 9. Dispatch EventBus Notifications
    if (this.eventBus) {
      this.eventBus.emit('moderation:warningIssued', {
        guildId: guild.id,
        userId: target.id,
        moderatorId: invoker.id,
        reason,
        severity,
        totalActiveWarnings: activeWarnings.length,
      });

      this.eventBus.emit('moderation:actionExecuted', {
        guildId: guild.id,
        action: 'WARN',
        targetUserId: target.id,
        moderatorUserId: invoker.id,
        reason,
        caseNumber: caseRecord?.caseNumber,
        caseId: caseRecord?.id,
        metadata: {
          severity,
          cumulativeScore,
          escalationAction: escalationStep?.action,
        },
      });
    }

    return {
      success: true,
      warning,
      caseNumber: caseRecord?.caseNumber,
      caseId: caseRecord?.id,
      totalActiveWarnings: activeWarnings.length,
      cumulativeScore,
      escalationTriggered: escalationStep,
      escalationResult,
      dmSent,
    };
  }

  /**
   * Evaluates current user standing against the guild escalation policy.
   */
  async evaluateEscalation(
    guildId: string,
    userId: string,
    additionalSeverity: number = 0,
  ): Promise<EscalationEvaluation> {
    const activeWarnings = await this.modRepo.getActiveWarnings(guildId, userId);
    const cumulativeScore = this.calculateWarningScore(activeWarnings) + additionalSeverity;
    const policy = await this.getEscalationPolicy(guildId);

    const triggeredStep = this.findMatchingEscalationStep(policy, cumulativeScore);

    // Find next upcoming step
    const sortedAsc = [...policy].sort((a, b) => a.warnThreshold - b.warnThreshold);
    const nextStep = sortedAsc.find((s) => s.warnThreshold > cumulativeScore);
    const pointsToNextStep = nextStep ? nextStep.warnThreshold - cumulativeScore : undefined;

    return {
      activeCount: activeWarnings.length + (additionalSeverity > 0 ? 1 : 0),
      cumulativeScore,
      triggeredStep,
      nextStep,
      pointsToNextStep,
    };
  }

  /**
   * Retrieves active warnings for a member.
   */
  async getActiveWarnings(guildId: string, userId: string): Promise<ModerationWarning[]> {
    return this.modRepo.getActiveWarnings(guildId, userId);
  }

  /**
   * Calculates total weighted score from an array of warnings.
   */
  calculateWarningScore(warnings: ModerationWarning[]): number {
    return warnings.reduce((sum, w) => sum + (w.severity ?? 1), 0);
  }

  /**
   * Retrieves the escalation policy for a guild, falling back to defaults.
   */
  async getEscalationPolicy(guildId: string): Promise<EscalationStep[]> {
    try {
      const rule = await this.modRepo.getRuleByType(guildId, 'ESCALATION_POLICY');
      if (rule && rule.exemptRoles && Array.isArray(rule.exemptRoles) && rule.exemptRoles.length > 0) {
        // Saved policy in rule metadata/field if available
        const parsed = (rule.exemptRoles as unknown) as EscalationStep[];
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0]?.warnThreshold === 'number') {
          return parsed;
        }
      }
    } catch {
      // Fall through to default policy
    }
    return [...DEFAULT_ESCALATION_STEPS];
  }

  /**
   * Configures a custom escalation policy for a guild.
   */
  async setEscalationPolicy(guildId: string, steps: EscalationStep[]): Promise<void> {
    const sorted = [...steps].sort((a, b) => a.warnThreshold - b.warnThreshold);
    await this.modRepo.upsertRule({
      guildId,
      ruleType: 'ESCALATION_POLICY',
      action: 'WARN',
      threshold: sorted.length,
      isEnabled: true,
      exemptRoles: (sorted as unknown) as string[],
    });
  }

  /**
   * Clears (deactivates) all active warnings for a user.
   */
  async clearWarnings(
    guildId: string,
    userId: string,
    moderatorId: string,
    reason: string = 'Warnings cleared by staff',
  ): Promise<number> {
    const cleared = await this.modRepo.clearUserWarnings(guildId, userId);

    if (cleared > 0 && this.eventBus) {
      this.eventBus.emit('moderation:actionExecuted', {
        guildId,
        action: 'WARN',
        targetUserId: userId,
        moderatorUserId: moderatorId,
        reason: `[Cleared ${cleared} warning(s)] ${reason}`,
        metadata: { clearedCount: cleared },
      });
    }

    return cleared;
  }

  // --- Internal Helpers ---

  private findMatchingEscalationStep(
    policy: EscalationStep[],
    score: number,
  ): EscalationStep | undefined {
    const sortedDesc = [...policy].sort((a, b) => b.warnThreshold - a.warnThreshold);
    return sortedDesc.find((step) => score >= step.warnThreshold);
  }

  private async executeEscalationAction(
    guild: Guild,
    invoker: GuildMember,
    target: GuildMember,
    step: EscalationStep,
    warningCount: number,
    score: number,
    baseReason: string,
  ): Promise<ModerationActionResult | undefined> {
    const escalationReason = `[Auto-Escalation: Warning #${warningCount} (Score ${score})] ${baseReason}`;

    switch (step.action) {
      case 'TIMEOUT':
        return this.moderationActionService.timeout({
          guild,
          invoker,
          target,
          durationSeconds: step.durationSeconds ?? 600,
          reason: escalationReason,
          sendDm: false, // Notification handled comprehensively in sendWarningDm
        });

      case 'KICK':
        return this.moderationActionService.kick({
          guild,
          invoker,
          target,
          reason: escalationReason,
          sendDm: false,
        });

      case 'BAN':
        return this.moderationActionService.ban({
          guild,
          invoker,
          target,
          reason: escalationReason,
          sendDm: false,
        });

      default:
        return undefined;
    }
  }

  private async sendWarningDm(
    target: GuildMember,
    guildName: string,
    reason: string,
    severity: number,
    activeCount: number,
    cumulativeScore: number,
    expiresAt: Date | null,
    escalation?: EscalationStep | undefined,
  ): Promise<boolean> {
    const lines: string[] = [
      `⚠️ **You have received a formal warning in ${guildName}**`,
      `**Reason:** ${reason}`,
      `**Severity:** ${severity}`,
      `**Active Warnings:** ${activeCount} (Weighted Score: ${cumulativeScore})`,
    ];

    if (expiresAt) {
      lines.push(`**Expires:** <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`);
    }

    if (escalation && escalation.action !== 'WARN') {
      let actionText: string = escalation.action;
      if (escalation.action === 'TIMEOUT' && escalation.durationSeconds) {
        actionText = `TIMEOUT (${Math.floor(escalation.durationSeconds / 60)} minutes)`;
      }
      lines.push(`\n🚨 **Warning Threshold Reached:** An automated disciplinary action (**${actionText}**) has been enacted.`);
    }

    try {
      await target.send(lines.join('\n'));
      return true;
    } catch {
      return false;
    }
  }
}
