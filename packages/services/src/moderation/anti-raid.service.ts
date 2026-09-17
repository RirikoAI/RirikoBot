import type { EventBus, CoreEvents } from '@ririko/core';
import type { ModerationRepository } from '@ririko/database';
import type { ModerationActionService } from './moderation-action.service.js';

export type RaidStatus = 'NORMAL' | 'RAID_DETECTED' | 'LOCKDOWN';

export type RaidMitigationAction =
  | 'LOCKDOWN'
  | 'VERIFICATION_GATE'
  | 'ALERT_ONLY';

export interface AntiRaidConfig {
  enabled: boolean;
  joinThreshold: number; // e.g. 10 joins
  windowSeconds: number; // e.g. 10 seconds
  freshAccountAgeHours: number; // e.g. 24 hours
  freshAccountThreshold: number; // e.g. 5 fresh accounts in window
  action: RaidMitigationAction;
  cooldownMinutes: number; // e.g. 10 minutes
}

export interface MemberJoinContext {
  guildId: string;
  userId: string;
  accountCreatedTimestamp: number;
  joinedTimestamp?: number | undefined;
  isBot?: boolean | undefined;
  username?: string | undefined;
}

export interface FlaggedJoinEntry {
  userId: string;
  username?: string | undefined;
  joinedAt: number;
  accountAgeHours: number;
  isFreshAccount: boolean;
}

export interface RaidGuildState {
  status: RaidStatus;
  raidStartedAt?: number | undefined;
  lockdownExpiresAt?: number | undefined;
  flaggedAccounts: FlaggedJoinEntry[];
  totalJoinsInWindow: number;
}

export interface RaidEvaluationResult {
  isRaid: boolean;
  guildId: string;
  status: RaidStatus;
  joinCount: number;
  freshAccountCount: number;
  actionTaken?: RaidMitigationAction | undefined;
  reason?: string | undefined;
  accounts: FlaggedJoinEntry[];
  lockdownExpiresAt?: number | undefined;
}

export class AntiRaidService {
  private static readonly DEFAULT_CONFIG: AntiRaidConfig = {
    enabled: true,
    joinThreshold: 10,
    windowSeconds: 10,
    freshAccountAgeHours: 24,
    freshAccountThreshold: 5,
    action: 'LOCKDOWN',
    cooldownMinutes: 10,
  };

  private readonly guildConfigs = new Map<string, AntiRaidConfig>();
  private readonly guildJoinHistory = new Map<string, FlaggedJoinEntry[]>();
  private readonly guildState = new Map<string, RaidGuildState>();

  constructor(
    private readonly moderationRepo?: ModerationRepository | undefined,
    private readonly moderationActionService?: ModerationActionService | undefined,
    private readonly eventBus?: EventBus<CoreEvents> | undefined,
  ) {}

  /**
   * Sets custom anti-raid config for a guild.
   */
  public setConfig(guildId: string, config: Partial<AntiRaidConfig>): void {
    const existing = this.getConfig(guildId);
    this.guildConfigs.set(guildId, { ...existing, ...config });
  }

  /**
   * Retrieves anti-raid configuration for a guild.
   */
  public getConfig(guildId: string): AntiRaidConfig {
    return this.guildConfigs.get(guildId) ?? { ...AntiRaidService.DEFAULT_CONFIG };
  }

  /**
   * Retrieves current raid state for a guild.
   */
  public getState(guildId: string): RaidGuildState {
    const state = this.guildState.get(guildId);
    if (!state) {
      return {
        status: 'NORMAL',
        flaggedAccounts: [],
        totalJoinsInWindow: 0,
      };
    }

    // Auto-recovery check if lockdown cooldown has expired
    const now = Date.now();
    if (
      state.status === 'LOCKDOWN' &&
      state.lockdownExpiresAt &&
      now >= state.lockdownExpiresAt
    ) {
      state.status = 'NORMAL';
      state.lockdownExpiresAt = undefined;
      state.raidStartedAt = undefined;
      state.flaggedAccounts = [];
    }

    return state;
  }

  /**
   * Manually resolves/lifts a raid lockdown on a guild.
   */
  public resolveRaid(guildId: string): void {
    this.guildState.delete(guildId);
    this.guildJoinHistory.delete(guildId);
  }

  /**
   * Cleans up stale join records older than 5 minutes to prevent memory leaks.
   */
  public cleanup(now = Date.now()): void {
    const maxTtlMs = 5 * 60 * 1000;
    for (const [guildId, history] of this.guildJoinHistory.entries()) {
      const active = history.filter((entry) => now - entry.joinedAt < maxTtlMs);
      if (active.length === 0) {
        this.guildJoinHistory.delete(guildId);
      } else {
        this.guildJoinHistory.set(guildId, active);
      }
    }
  }

  /**
   * Evaluates a member join event against the sliding-window join monitor.
   */
  public async handleMemberJoin(
    join: MemberJoinContext,
  ): Promise<RaidEvaluationResult> {
    const config = this.getConfig(join.guildId);
    if (!config.enabled) {
      return {
        isRaid: false,
        guildId: join.guildId,
        status: 'NORMAL',
        joinCount: 0,
        freshAccountCount: 0,
        accounts: [],
      };
    }

    // Ignore bot joins
    if (join.isBot) {
      return {
        isRaid: false,
        guildId: join.guildId,
        status: this.getState(join.guildId).status,
        joinCount: 0,
        freshAccountCount: 0,
        accounts: [],
      };
    }

    const now = join.joinedTimestamp ?? Date.now();
    const accountAgeHours =
      Math.max(0, now - join.accountCreatedTimestamp) / (1000 * 60 * 60);
    const isFresh = accountAgeHours < config.freshAccountAgeHours;

    const entry: FlaggedJoinEntry = {
      userId: join.userId,
      username: join.username,
      joinedAt: now,
      accountAgeHours: Math.round(accountAgeHours * 10) / 10,
      isFreshAccount: isFresh,
    };

    let history = this.guildJoinHistory.get(join.guildId);
    if (!history) {
      history = [];
      this.guildJoinHistory.set(join.guildId, history);
    }

    // Retain only entries within the sliding window
    const windowMs = config.windowSeconds * 1000;
    history = history.filter((e) => now - e.joinedAt < windowMs);
    history.push(entry);
    this.guildJoinHistory.set(join.guildId, history);

    const joinCount = history.length;
    const freshAccountCount = history.filter((e) => e.isFreshAccount).length;

    // Check raid triggers:
    // 1. Overall join velocity threshold exceeded (e.g. 10 joins in 10s)
    // 2. Fresh account cluster threshold exceeded (e.g. 5 accounts < 24h old in 10s)
    const isVelocityTrigger = joinCount >= config.joinThreshold;
    const isFreshClusterTrigger = freshAccountCount >= config.freshAccountThreshold;

    if (isVelocityTrigger || isFreshClusterTrigger) {
      const reason = isFreshClusterTrigger
        ? `Coordinated mass join detected (${freshAccountCount} fresh accounts created < ${config.freshAccountAgeHours}h ago joined in ${config.windowSeconds}s)`
        : `Mass join velocity threshold exceeded (${joinCount} joins in ${config.windowSeconds}s)`;

      const lockdownExpiresAt = now + config.cooldownMinutes * 60 * 1000;

      const updatedState: RaidGuildState = {
        status: config.action === 'ALERT_ONLY' ? 'RAID_DETECTED' : 'LOCKDOWN',
        raidStartedAt: now,
        lockdownExpiresAt: config.action === 'ALERT_ONLY' ? undefined : lockdownExpiresAt,
        flaggedAccounts: [...history],
        totalJoinsInWindow: joinCount,
      };

      this.guildState.set(join.guildId, updatedState);

      // Emit EventBus notification
      if (this.eventBus) {
        await this.eventBus.emit('moderation:raidDetected', {
          guildId: join.guildId,
          joinCount,
          windowSeconds: config.windowSeconds,
          actionTaken: config.action,
          accounts: history.map((e) => ({
            userId: e.userId,
            accountAgeHours: e.accountAgeHours,
          })),
        });
      }

      // Record audit case if repo is available
      if (this.moderationRepo && config.action !== 'ALERT_ONLY') {
        try {
          await this.moderationRepo.createCase({
            guildId: join.guildId,
            type: 'LOCKDOWN',
            targetUserId: join.userId,
            moderatorUserId: 'ANTI_RAID',
            reason,
            durationSeconds: config.cooldownMinutes * 60,
            metadata: {
              joinCount,
              freshAccountCount,
              flaggedUsers: history.map((e) => e.userId),
            },
          });
        } catch {
          // Graceful fallback on DB case failure
        }
      }

      return {
        isRaid: true,
        guildId: join.guildId,
        status: updatedState.status,
        joinCount,
        freshAccountCount,
        actionTaken: config.action,
        reason,
        accounts: [...history],
        lockdownExpiresAt: updatedState.lockdownExpiresAt,
      };
    }

    return {
      isRaid: false,
      guildId: join.guildId,
      status: this.getState(join.guildId).status,
      joinCount,
      freshAccountCount,
      accounts: [...history],
    };
  }

  /**
   * Generates a Discord embed data object for alerting staff in the log channel.
   */
  public generateAlertEmbed(result: RaidEvaluationResult): {
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp: string;
  } {
    return {
      title: '🚨 Anti-Raid Alert: Raid Activity Detected',
      description:
        result.reason ??
        'An abnormal surge of account joins was detected in this server.',
      color: 0xff0033, // Bright red
      fields: [
        {
          name: 'Total Joins in Window',
          value: `${result.joinCount}`,
          inline: true,
        },
        {
          name: 'Suspicious Fresh Accounts (< 24h)',
          value: `${result.freshAccountCount}`,
          inline: true,
        },
        {
          name: 'Defensive Action Taken',
          value: `**${result.actionTaken ?? 'NONE'}**`,
          inline: true,
        },
        {
          name: 'Flagged Account Samples',
          value:
            result.accounts
              .slice(0, 8)
              .map(
                (a) =>
                  `• <@${a.userId}> (${a.username ?? a.userId}) — Age: ${a.accountAgeHours}h`,
              )
              .join('\n') || 'None',
          inline: false,
        },
        {
          name: 'Status',
          value:
            result.status === 'LOCKDOWN'
              ? `🔒 **Server Lockdown Active** (Auto-recovering <t:${Math.floor((result.lockdownExpiresAt ?? 0) / 1000)}:R>)`
              : '⚠️ **Staff Review Recommended**',
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
    };
  }
}
