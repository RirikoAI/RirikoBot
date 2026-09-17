import {
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
  type Collection,
} from 'discord.js';
import type { EventBus, CoreEvents } from '@ririko/core';
import type { ModerationRepository } from '@ririko/database';
import { PermissionService } from './permission.service.js';

export interface PurgeFilterOptions {
  userId?: string | undefined;
  botsOnly?: boolean | undefined;
  humansOnly?: boolean | undefined;
  invitesOnly?: boolean | undefined;
  linksOnly?: boolean | undefined;
  attachmentsOnly?: boolean | undefined;
}

export interface PurgeParams {
  guild: Guild;
  invoker: GuildMember;
  channel: GuildTextBasedChannel;
  count: number;
  filters?: PurgeFilterOptions | undefined;
  reason?: string | undefined;
}

export interface PurgeResult {
  success: boolean;
  channelId: string;
  requestedCount: number;
  deletedCount: number;
  skippedOlderThan14Days: number;
  caseNumber?: number | undefined;
  caseId?: string | undefined;
  error?: string | undefined;
}

const DISCORD_INVITE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|io|me|li)|discord(?:app)?\.com\/invite)\/[a-zA-Z0-9_-]+/i;

const URL_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+/i;

export class PurgeService {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly modRepo?: ModerationRepository | undefined,
    private readonly eventBus?: EventBus<CoreEvents> | undefined,
  ) {}

  /**
   * Purges messages matching optional filters while respecting Discord 14-day API bulk-delete limits.
   */
  async purgeMessages(params: PurgeParams): Promise<PurgeResult> {
    const {
      guild,
      invoker,
      channel,
      count,
      filters = {},
      reason = 'Bulk message purge',
    } = params;

    // 1. Validate permissions
    const permCheck = await this.permissionService.validate({
      guild,
      invoker,
      channel,
      requiredInvokerPermissions: [PermissionFlagsBits.ManageMessages],
      requiredBotPermissions: [
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });

    if (!permCheck.allowed) {
      return {
        success: false,
        channelId: channel.id,
        requestedCount: count,
        deletedCount: 0,
        skippedOlderThan14Days: 0,
        error: permCheck.message,
      };
    }

    // Clamp count to Discord API bounds
    const clampedCount = Math.min(Math.max(count, 1), 100);

    // 2. Fetch recent messages
    // If filters are specified, fetch up to 100 to find enough matching messages
    const hasFilter =
      filters.userId ||
      filters.botsOnly ||
      filters.humansOnly ||
      filters.invitesOnly ||
      filters.linksOnly ||
      filters.attachmentsOnly;

    const fetchLimit = hasFilter ? 100 : clampedCount;

    let fetched: Collection<string, Message>;
    try {
      fetched = await channel.messages.fetch({ limit: fetchLimit });
    } catch (err: unknown) {
      return {
        success: false,
        channelId: channel.id,
        requestedCount: clampedCount,
        deletedCount: 0,
        skippedOlderThan14Days: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // 3. Filter messages according to options
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const matchingMessages: Message[] = [];
    let skippedOlderThan14Days = 0;

    for (const msg of fetched.values()) {
      if (matchingMessages.length >= clampedCount) {
        break;
      }

      // Check Discord 14-day bulk-delete limit
      if (msg.createdTimestamp < fourteenDaysAgo) {
        skippedOlderThan14Days++;
        continue;
      }

      // Filter: Specific user
      if (filters.userId && msg.author.id !== filters.userId) {
        continue;
      }

      // Filter: Bots only
      if (filters.botsOnly && !msg.author.bot) {
        continue;
      }

      // Filter: Humans only
      if (filters.humansOnly && msg.author.bot) {
        continue;
      }

      // Filter: Invites only
      if (filters.invitesOnly && !DISCORD_INVITE_REGEX.test(msg.content)) {
        continue;
      }

      // Filter: Links only
      if (filters.linksOnly && !URL_REGEX.test(msg.content)) {
        continue;
      }

      // Filter: Attachments only
      if (filters.attachmentsOnly && msg.attachments.size === 0) {
        continue;
      }

      matchingMessages.push(msg);
    }

    if (matchingMessages.length === 0) {
      return {
        success: true,
        channelId: channel.id,
        requestedCount: clampedCount,
        deletedCount: 0,
        skippedOlderThan14Days,
      };
    }

    // 4. Execute bulk delete
    let deletedCount: number;
    try {
      const deleted = await channel.bulkDelete(matchingMessages, true);
      deletedCount = deleted.size;
    } catch (err: unknown) {
      return {
        success: false,
        channelId: channel.id,
        requestedCount: clampedCount,
        deletedCount: 0,
        skippedOlderThan14Days,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // 5. Record Case in Database
    let caseRecord = null;
    if (this.modRepo && deletedCount > 0) {
      try {
        caseRecord = await this.modRepo.createCase({
          guildId: guild.id,
          type: 'PURGE',
          targetUserId: filters.userId ?? 'CHANNEL_PURGE',
          moderatorUserId: invoker.id,
          reason,
          metadata: {
            channelId: channel.id,
            deletedCount,
            skippedOlderThan14Days,
            filters,
          },
        });
      } catch (err: unknown) {
        console.error('[PurgeService] Failed to record purge case in database:', err);
      }
    }

    // 6. Emit EventBus Notification
    if (this.eventBus && deletedCount > 0) {
      this.eventBus.emit('moderation:actionExecuted', {
        guildId: guild.id,
        action: 'PURGE',
        targetUserId: filters.userId,
        moderatorUserId: invoker.id,
        reason,
        caseNumber: caseRecord?.caseNumber,
        caseId: caseRecord?.id,
        metadata: {
          channelId: channel.id,
          deletedCount,
          skippedOlderThan14Days,
          filters,
        },
      });
    }

    return {
      success: true,
      channelId: channel.id,
      requestedCount: clampedCount,
      deletedCount,
      skippedOlderThan14Days,
      caseNumber: caseRecord?.caseNumber,
      caseId: caseRecord?.id,
    };
  }
}
