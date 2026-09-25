import { PermissionFlagsBits, type Guild, type GuildMember } from 'discord.js';
import {
  DEFAULT_ESCALATION_STEPS,
  type CoreEvents,
  type EscalationStep,
  type EventBus,
} from '@ririko/core';
import type {
  GuildSettingsRepository,
  ModerationRepository,
  ModerationWarning,
} from '@ririko/database';
import { PermissionService } from './permission.service.js';
import { ModerationActionService } from './moderation-action.service.js';
import type { ModerationActionResult } from './types.js';

// The policy shape and defaults are shared with the dashboard and CLI schemas in @ririko/core.
export { DEFAULT_ESCALATION_STEPS, type EscalationStep };

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
    private readonly guildSettingsRepo: Pick<GuildSettingsRepository, 'findById'>,
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
    const expiresAt = expirationDays > 0 ? new Date(Date.now() + expirationDays * 86400000) : null;

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
   * The guild's escalation policy from `guild_settings.escalation_steps` (saved through the
   * dashboard or `ririko guild:config`), or the default policy when it never saved one. An
   * empty policy means warnings never escalate. A database error is not treated as "no policy":
   * applying the defaults could ban members in a guild that turned escalation off.
   */
  async getEscalationPolicy(guildId: string): Promise<EscalationStep[]> {
    const steps = (await this.guildSettingsRepo.findById(guildId))?.escalationSteps;
    return (steps ?? DEFAULT_ESCALATION_STEPS).map((step) => ({ ...step }));
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
      lines.push(
        `\n🚨 **Warning Threshold Reached:** An automated disciplinary action (**${actionText}**) has been enacted.`,
      );
    }

    try {
      await target.send(lines.join('\n'));
      return true;
    } catch {
      return false;
    }
  }
}
