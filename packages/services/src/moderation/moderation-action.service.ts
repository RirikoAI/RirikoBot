import {
  PermissionFlagsBits,
  type GuildMember,
  type TextChannel,
} from 'discord.js';
import type { EventBus, CoreEvents } from '@ririko/core';
import type { ModerationRepository } from '@ririko/database';
import { PermissionService } from './permission.service.js';
import type {
  ModerationActionResult,
  KickParams,
  BanParams,
  SoftbanParams,
  UnbanParams,
  TimeoutParams,
  UntimeoutParams,
  NicknameParams,
  LockChannelParams,
  UnlockChannelParams,
} from './types.js';

export class ModerationActionService {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly moderationRepo?: ModerationRepository | undefined,
    private readonly eventBus?: EventBus<CoreEvents> | undefined,
  ) {}

  /**
   * Kicks a member from the guild after verifying permissions and role hierarchy.
   */
  async kick(params: KickParams): Promise<ModerationActionResult> {
    const { guild, invoker, target, reason = 'No reason provided', sendDm = true } = params;

    // 1. Permission & Role Hierarchy Check
    const permCheck = await this.permissionService.validate({
      guild,
      invoker,
      target,
      requiredInvokerPermissions: [PermissionFlagsBits.KickMembers],
      requiredBotPermissions: [PermissionFlagsBits.KickMembers],
    });

    if (!permCheck.allowed) {
      return {
        success: false,
        action: 'KICK',
        guildId: guild.id,
        targetUserId: target.id,
        reason,
        error: permCheck.message,
      };
    }

    // 2. DM Notification (Graceful fallback)
    let dmSent = false;
    if (sendDm) {
      dmSent = await this.trySendDm(
        target,
        `You have been kicked from **${guild.name}**.\n**Reason:** ${reason}`,
      );
    }

    // 3. Execute Kick
    const auditReason = this.formatAuditReason(invoker, reason);
    try {
      await target.kick(auditReason);
    } catch (err: unknown) {
      return {
        success: false,
        action: 'KICK',
        guildId: guild.id,
        targetUserId: target.id,
        reason,
        dmSent,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // 4. Record Case in Database
    const caseRecord = await this.recordCase({
      guildId: guild.id,
      type: 'KICK',
      targetUserId: target.id,
      moderatorUserId: invoker.id,
      reason,
    });

    // 5. Emit EventBus Notification
    this.emitEvent('moderation:actionExecuted', {
      guildId: guild.id,
      action: 'KICK',
      targetUserId: target.id,
      moderatorUserId: invoker.id,
      reason,
      caseNumber: caseRecord?.caseNumber,
      caseId: caseRecord?.id,
    });

    return {
      success: true,
      action: 'KICK',
      guildId: guild.id,
      targetUserId: target.id,
      caseNumber: caseRecord?.caseNumber,
      caseId: caseRecord?.id,
      reason,
      dmSent,
    };
  }

  /**
   * Permanently bans a user from the guild with optional message history purge.
   */
  async ban(params: BanParams): Promise<ModerationActionResult> {
    const { guild, invoker, target, reason = 'No reason provided', sendDm = true } = params;
    const targetUserId = typeof target === 'string' ? target : target.id;
    const targetMember = typeof target === 'string' ? null : target;

    // 1. Permission & Role Hierarchy Check
    const permCheck = await this.permissionService.validate({
      guild,
      invoker,
      target: targetMember,
      skipHierarchyCheck: targetMember === null,
      requiredInvokerPermissions: [PermissionFlagsBits.BanMembers],
      requiredBotPermissions: [PermissionFlagsBits.BanMembers],
    });

    if (!permCheck.allowed) {
      return {
        success: false,
        action: 'BAN',
        guildId: guild.id,
        targetUserId,
        reason,
        error: permCheck.message,
      };
    }

    // 2. DM Notification
    let dmSent = false;
    if (sendDm && targetMember) {
      dmSent = await this.trySendDm(
        targetMember,
        `You have been banned from **${guild.name}**.\n**Reason:** ${reason}`,
      );
    }

    // 3. Execute Ban
    const deleteMessageSeconds =
      params.deleteMessageSeconds ??
      (params.deleteMessageDays !== undefined ? params.deleteMessageDays * 86400 : 0);
    const auditReason = this.formatAuditReason(invoker, reason);

    try {
      await guild.members.ban(targetUserId, {
        reason: auditReason,
        deleteMessageSeconds,
      });
    } catch (err: unknown) {
      return {
        success: false,
        action: 'BAN',
        guildId: guild.id,
        targetUserId,
        reason,
        dmSent,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // 4. Record Case
    const caseRecord = await this.recordCase({
      guildId: guild.id,
      type: 'BAN',
      targetUserId,
      moderatorUserId: invoker.id,
      reason,
      metadata: { deleteMessageSeconds },
    });

    // 5. Emit Event
    this.emitEvent('moderation:actionExecuted', {
      guildId: guild.id,
      action: 'BAN',
      targetUserId,
      moderatorUserId: invoker.id,
      reason,
      caseNumber: caseRecord?.caseNumber,
      caseId: caseRecord?.id,
      metadata: { deleteMessageSeconds },
    });

    return {
      success: true,
      action: 'BAN',
      guildId: guild.id,
      targetUserId,
      caseNumber: caseRecord?.caseNumber,
      caseId: caseRecord?.id,
      reason,
      dmSent,
    };
  }

  /**
   * Softbans a member: bans to purge messages (1-7 days) and immediately unbans.
   */
  async softban(params: SoftbanParams): Promise<ModerationActionResult> {
    const {
      guild,
      invoker,
      target,
      reason = 'No reason provided',
      deleteMessageDays = 1,
      sendDm = true,
    } = params;

    // 1. Permission Check
    const permCheck = await this.permissionService.validate({
      guild,
      invoker,
      target,
      requiredInvokerPermissions: [PermissionFlagsBits.BanMembers],
      requiredBotPermissions: [PermissionFlagsBits.BanMembers],
    });

    if (!permCheck.allowed) {
      return {
        success: false,
        action: 'SOFTBAN',
        guildId: guild.id,
        targetUserId: target.id,
        reason,
        error: permCheck.message,
      };
    }

    // 2. DM Notification
    let dmSent = false;
    if (sendDm) {
      dmSent = await this.trySendDm(
        target,
        `You have been softbanned from **${guild.name}** (kicked and message history purged).\n**Reason:** ${reason}`,
      );
    }

    // 3. Execute Ban then Unban
    const deleteMessageSeconds = Math.min(Math.max(deleteMessageDays, 1), 7) * 86400;
    const auditReason = `[Softban by ${this.getInvokerTag(invoker)}] ${reason}`;

    try {
      await guild.members.ban(target.id, {
        reason: auditReason,
        deleteMessageSeconds,
      });
      await guild.members.unban(
        target.id,
        `[Softban auto-unban by ${this.getInvokerTag(invoker)}] ${reason}`,
      );
    } catch (err: unknown) {
      return {
        success: false,
        action: 'SOFTBAN',
        guildId: guild.id,
        targetUserId: target.id,
        reason,
        dmSent,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // 4. Record Case
    const caseRecord = await this.recordCase({
      guildId: guild.id,
      type: 'SOFTBAN',
      targetUserId: target.id,
      moderatorUserId: invoker.id,
      reason,
      metadata: { deleteMessageDays },
    });

    // 5. Emit Event
    this.emitEvent('moderation:actionExecuted', {
      guildId: guild.id,
      action: 'SOFTBAN',
      targetUserId: target.id,
      moderatorUserId: invoker.id,
      reason,
      caseNumber: caseRecord?.caseNumber,
      caseId: caseRecord?.id,
    });

    return {
      success: true,
      action: 'SOFTBAN',
      guildId: guild.id,
      targetUserId: target.id,
      caseNumber: caseRecord?.caseNumber,
      caseId: caseRecord?.id,
      reason,
      dmSent,
    };
  }

  /**
   * Revokes an existing ban for a user ID.
   */
  async unban(params: UnbanParams): Promise<ModerationActionResult> {
    const { guild, invoker, targetUserId, reason = 'No reason provided' } = params;

    // 1. Permission Check
    const permCheck = await this.permissionService.validate({
      guild,
      invoker,
      skipHierarchyCheck: true,
      requiredInvokerPermissions: [PermissionFlagsBits.BanMembers],
      requiredBotPermissions: [PermissionFlagsBits.BanMembers],
    });

    if (!permCheck.allowed) {
      return {
        success: false,
        action: 'UNBAN',
        guildId: guild.id,
        targetUserId,
        reason,
        error: permCheck.message,
      };
    }

    // 2. Execute Unban
    const auditReason = `[Unban by ${this.getInvokerTag(invoker)}] ${reason}`;
    try {
      await guild.members.unban(targetUserId, auditReason);
    } catch (err: unknown) {
      return {
        success: false,
        action: 'UNBAN',
        guildId: guild.id,
        targetUserId,
        reason,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // 3. Record Case
    const caseRecord = await this.recordCase({
      guildId: guild.id,
      type: 'UNBAN',
      targetUserId,
      moderatorUserId: invoker.id,
      reason,
    });

    // 4. Emit Event
    this.emitEvent('moderation:actionExecuted', {
      guildId: guild.id,
      action: 'UNBAN',
      targetUserId,
      moderatorUserId: invoker.id,
      reason,
      caseNumber: caseRecord?.caseNumber,
      caseId: caseRecord?.id,
    });

    return {
      success: true,
      action: 'UNBAN',
      guildId: guild.id,
      targetUserId,
      caseNumber: caseRecord?.caseNumber,
      caseId: caseRecord?.id,
      reason,
    };
  }

  /**
   * Applies a communication timeout (mute) to a member.
   */
  async timeout(params: TimeoutParams): Promise<ModerationActionResult> {
    const {
      guild,
      invoker,
      target,
      durationSeconds,
      reason = 'No reason provided',
      sendDm = true,
    } = params;

    // 1. Permission Check
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
        action: 'TIMEOUT',
        guildId: guild.id,
        targetUserId: target.id,
        reason,
        error: permCheck.message,
      };
    }

    // Validate duration bounds (max 28 days = 2,419,200s, min 1s)
    const clampedDuration = Math.min(Math.max(durationSeconds, 1), 2419200);
    const durationMs = clampedDuration * 1000;

    // 2. DM Notification
    let dmSent = false;
    if (sendDm) {
      dmSent = await this.trySendDm(
        target,
        `You have been timed out in **${guild.name}** for ${this.formatDuration(clampedDuration)}.\n**Reason:** ${reason}`,
      );
    }

    // 3. Execute Timeout
    const auditReason = this.formatAuditReason(invoker, reason);
    try {
      await target.timeout(durationMs, auditReason);
    } catch (err: unknown) {
      return {
        success: false,
        action: 'TIMEOUT',
        guildId: guild.id,
        targetUserId: target.id,
        reason,
        dmSent,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // 4. Record Case
    const caseRecord = await this.recordCase({
      guildId: guild.id,
      type: 'TIMEOUT',
      targetUserId: target.id,
      moderatorUserId: invoker.id,
      reason,
      durationSeconds: clampedDuration,
    });

    // 5. Emit Event
    this.emitEvent('moderation:actionExecuted', {
      guildId: guild.id,
      action: 'TIMEOUT',
      targetUserId: target.id,
      moderatorUserId: invoker.id,
      reason,
      durationSeconds: clampedDuration,
      caseNumber: caseRecord?.caseNumber,
      caseId: caseRecord?.id,
    });

    return {
      success: true,
      action: 'TIMEOUT',
      guildId: guild.id,
      targetUserId: target.id,
      caseNumber: caseRecord?.caseNumber,
      caseId: caseRecord?.id,
      reason,
      dmSent,
      data: { durationSeconds: clampedDuration },
    };
  }

  /**
   * Removes an active communication timeout from a member.
   */
  async untimeout(params: UntimeoutParams): Promise<ModerationActionResult> {
    const { guild, invoker, target, reason = 'No reason provided' } = params;

    // 1. Permission Check
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
        action: 'UNTIMEOUT',
        guildId: guild.id,
        targetUserId: target.id,
        reason,
        error: permCheck.message,
      };
    }

    // 2. Execute Timeout Removal
    const auditReason = `[Untimeout by ${this.getInvokerTag(invoker)}] ${reason}`;
    try {
      await target.timeout(null, auditReason);
    } catch (err: unknown) {
      return {
        success: false,
        action: 'UNTIMEOUT',
        guildId: guild.id,
        targetUserId: target.id,
        reason,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // 3. Emit Event
    this.emitEvent('moderation:actionExecuted', {
      guildId: guild.id,
      action: 'UNTIMEOUT',
      targetUserId: target.id,
      moderatorUserId: invoker.id,
      reason,
    });

    return {
      success: true,
      action: 'UNTIMEOUT',
      guildId: guild.id,
      targetUserId: target.id,
      reason,
    };
  }

  /**
   * Changes or resets a member's nickname.
   */
  async setNickname(params: NicknameParams): Promise<ModerationActionResult> {
    const { guild, invoker, target, nickname, reason = 'Moderated nickname' } = params;

    // 1. Permission Check
    const permCheck = await this.permissionService.validate({
      guild,
      invoker,
      target,
      requiredInvokerPermissions: [PermissionFlagsBits.ManageNicknames],
      requiredBotPermissions: [PermissionFlagsBits.ManageNicknames],
    });

    if (!permCheck.allowed) {
      return {
        success: false,
        action: 'NICK',
        guildId: guild.id,
        targetUserId: target.id,
        reason,
        error: permCheck.message,
      };
    }

    // 2. Execute Nickname Edit
    const auditReason = `[Nickname moderated by ${this.getInvokerTag(invoker)}] ${reason}`;
    try {
      await target.setNickname(nickname, auditReason);
    } catch (err: unknown) {
      return {
        success: false,
        action: 'NICK',
        guildId: guild.id,
        targetUserId: target.id,
        reason,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // 3. Emit Event
    this.emitEvent('moderation:actionExecuted', {
      guildId: guild.id,
      action: 'NICK',
      targetUserId: target.id,
      moderatorUserId: invoker.id,
      reason,
      metadata: { newNickname: nickname },
    });

    return {
      success: true,
      action: 'NICK',
      guildId: guild.id,
      targetUserId: target.id,
      reason,
      data: { nickname },
    };
  }

  /**
   * Locks a channel by revoking SendMessages for @everyone.
   */
  async lockChannel(params: LockChannelParams): Promise<ModerationActionResult> {
    const { guild, invoker, channel, reason = 'Channel locked by staff' } = params;

    // 1. Permission Check
    const permCheck = await this.permissionService.validate({
      guild,
      invoker,
      channel,
      requiredInvokerPermissions: [PermissionFlagsBits.ManageChannels],
      requiredBotPermissions: [PermissionFlagsBits.ManageChannels],
    });

    if (!permCheck.allowed) {
      return {
        success: false,
        action: 'LOCK',
        guildId: guild.id,
        channelId: channel.id,
        reason,
        error: permCheck.message,
      };
    }

    // 2. Execute Lock Overwrite
    const auditReason = `[Lock by ${this.getInvokerTag(invoker)}] ${reason}`;
    try {
      const textChannel = channel as TextChannel;
      if (textChannel.permissionOverwrites && typeof textChannel.permissionOverwrites.edit === 'function') {
        await textChannel.permissionOverwrites.edit(
          guild.roles.everyone,
          { SendMessages: false },
          { reason: auditReason },
        );
      } else {
        throw new Error('Channel does not support permission overwrites.');
      }
    } catch (err: unknown) {
      return {
        success: false,
        action: 'LOCK',
        guildId: guild.id,
        channelId: channel.id,
        reason,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // 3. Emit Event
    this.emitEvent('moderation:actionExecuted', {
      guildId: guild.id,
      action: 'LOCK',
      moderatorUserId: invoker.id,
      reason,
      metadata: { channelId: channel.id },
    });

    return {
      success: true,
      action: 'LOCK',
      guildId: guild.id,
      channelId: channel.id,
      reason,
    };
  }

  /**
   * Unlocks a channel by resetting SendMessages for @everyone.
   */
  async unlockChannel(params: UnlockChannelParams): Promise<ModerationActionResult> {
    const { guild, invoker, channel, reason = 'Channel unlocked by staff' } = params;

    // 1. Permission Check
    const permCheck = await this.permissionService.validate({
      guild,
      invoker,
      channel,
      requiredInvokerPermissions: [PermissionFlagsBits.ManageChannels],
      requiredBotPermissions: [PermissionFlagsBits.ManageChannels],
    });

    if (!permCheck.allowed) {
      return {
        success: false,
        action: 'UNLOCK',
        guildId: guild.id,
        channelId: channel.id,
        reason,
        error: permCheck.message,
      };
    }

    // 2. Execute Unlock Overwrite
    const auditReason = `[Unlock by ${this.getInvokerTag(invoker)}] ${reason}`;
    try {
      const textChannel = channel as TextChannel;
      if (textChannel.permissionOverwrites && typeof textChannel.permissionOverwrites.edit === 'function') {
        await textChannel.permissionOverwrites.edit(
          guild.roles.everyone,
          { SendMessages: null },
          { reason: auditReason },
        );
      } else {
        throw new Error('Channel does not support permission overwrites.');
      }
    } catch (err: unknown) {
      return {
        success: false,
        action: 'UNLOCK',
        guildId: guild.id,
        channelId: channel.id,
        reason,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // 3. Emit Event
    this.emitEvent('moderation:actionExecuted', {
      guildId: guild.id,
      action: 'UNLOCK',
      moderatorUserId: invoker.id,
      reason,
      metadata: { channelId: channel.id },
    });

    return {
      success: true,
      action: 'UNLOCK',
      guildId: guild.id,
      channelId: channel.id,
      reason,
    };
  }

  // --- Internal Helpers ---

  private async trySendDm(target: GuildMember, content: string): Promise<boolean> {
    try {
      await target.send(content);
      return true;
    } catch {
      return false;
    }
  }

  private formatAuditReason(invoker: GuildMember, reason: string): string {
    return `[${this.getInvokerTag(invoker)}] ${reason}`;
  }

  private getInvokerTag(invoker: GuildMember): string {
    return invoker.user?.tag ?? invoker.user?.username ?? invoker.id;
  }

  private formatDuration(seconds: number): string {
    if (seconds >= 86400) {
      const days = Math.floor(seconds / 86400);
      return `${days}d`;
    }
    if (seconds >= 3600) {
      const hours = Math.floor(seconds / 3600);
      return `${hours}h`;
    }
    if (seconds >= 60) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m`;
    }
    return `${seconds}s`;
  }

  private async recordCase(params: {
    guildId: string;
    type: string;
    targetUserId: string;
    moderatorUserId: string;
    reason: string;
    durationSeconds?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
  }) {
    if (!this.moderationRepo) return null;
    try {
      const caseRecord = await this.moderationRepo.createCase({
        guildId: params.guildId,
        type: params.type,
        targetUserId: params.targetUserId,
        moderatorUserId: params.moderatorUserId,
        reason: params.reason,
        durationSeconds: params.durationSeconds,
        metadata: params.metadata,
      });

      this.emitEvent('moderation:caseCreated', {
        guildId: params.guildId,
        caseNumber: caseRecord.caseNumber,
        type: params.type,
        targetUserId: params.targetUserId,
        moderatorUserId: params.moderatorUserId,
        reason: params.reason,
        durationSeconds: params.durationSeconds,
      });

      return caseRecord;
    } catch (err: unknown) {
      console.error('[ModerationActionService] Failed to record case in database:', err);
      return null;
    }
  }

  private emitEvent<K extends keyof CoreEvents>(event: K, payload: CoreEvents[K]): void {
    if (this.eventBus) {
      this.eventBus.emit(event, payload);
    }
  }
}
