import type { GiveawayRepository } from '@ririko/database';
import type {
  Giveaway,
  GiveawayEntry,
  GiveawayCreationOptions,
  GiveawayRequirements,
  MemberEntryInfo,
  EntryValidationResult,
  GiveawayEndResult,
  GiveawayEngineOptions,
} from './types.js';

export class GiveawayEngine {
  private timer: NodeJS.Timeout | null = null;
  private readonly checkIntervalMs: number;
  private readonly rngFn: () => number;
  private readonly onGiveawayEnded?: ((result: GiveawayEndResult) => Promise<void>) | undefined;

  constructor(
    private readonly giveawayRepo: GiveawayRepository,
    options: GiveawayEngineOptions = {},
  ) {
    this.checkIntervalMs = options.checkIntervalMs ?? 15_000;
    this.rngFn = options.rngFn ?? Math.random;
    this.onGiveawayEnded = options.onGiveawayEnded;
  }

  /**
   * Starts the background scheduler:
   * 1. Reconciles all pending expired giveaways immediately upon boot (crash resilience).
   * 2. Runs periodic sweep to end overdue giveaways.
   */
  async start(): Promise<void> {
    await this.tick();

    if (!this.timer) {
      this.timer = setInterval(() => {
        this.tick().catch((err) => {
          console.error('[GiveawayEngine] Error during expiration tick:', err);
        });
      }, this.checkIntervalMs);
    }
  }

  /**
   * Stops the background timer.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Periodic sweep checking for giveaways that have expired and are pending resolution.
   */
  async tick(now: Date = new Date()): Promise<GiveawayEndResult[]> {
    const expiredPending = await this.giveawayRepo.listExpiredPendingGiveaways(now);
    const results: GiveawayEndResult[] = [];

    for (const giveaway of expiredPending) {
      try {
        const result = await this.rollAndEndGiveaway(giveaway.id);
        if (result) {
          results.push(result);
        }
      } catch (err) {
        console.error(`[GiveawayEngine] Failed to resolve giveaway ${giveaway.id}:`, err);
      }
    }

    return results;
  }

  /**
   * Weighted random selection without replacement.
   * Supports deterministic testing via injectable RNG function.
   */
  selectWinners(
    entries: GiveawayEntry[],
    winnerCount: number,
    existingWinnerIds: string[] = [],
    rngFn: () => number = this.rngFn,
  ): string[] {
    const existingSet = new Set(existingWinnerIds);
    const eligible = entries.filter((e) => !existingSet.has(e.userId));

    if (eligible.length === 0 || winnerCount <= 0) {
      return [];
    }

    if (eligible.length <= winnerCount) {
      return eligible.map((e) => e.userId);
    }

    const pool = [...eligible];
    const winners: string[] = [];

    while (winners.length < winnerCount && pool.length > 0) {
      const totalWeight = pool.reduce((sum, item) => sum + Math.max(1, item.bonusMultiplier), 0);
      const threshold = rngFn() * totalWeight;

      let accumulated = 0;
      let selectedIndex = 0;

      for (let i = 0; i < pool.length; i++) {
        accumulated += Math.max(1, pool[i]!.bonusMultiplier);
        if (accumulated >= threshold) {
          selectedIndex = i;
          break;
        }
      }

      const selected = pool[selectedIndex]!;
      winners.push(selected.userId);
      pool.splice(selectedIndex, 1);
    }

    return winners;
  }

  /**
   * Validates if a guild member satisfies giveaway entry requirements
   * and calculates their effective bonus multiplier.
   */
  validateEntry(
    member: MemberEntryInfo,
    requirements?: GiveawayRequirements,
  ): EntryValidationResult {
    if (!requirements) {
      return { allowed: true, bonusMultiplier: member.isBooster ? 2 : 1 };
    }

    const now = Date.now();

    // 1. Account age gate
    if (requirements.minAccountAgeDays && requirements.minAccountAgeDays > 0) {
      const accountAgeMs = now - member.createdTimestamp;
      const requiredMs = requirements.minAccountAgeDays * 86_400_000;
      if (accountAgeMs < requiredMs) {
        const daysRemaining = Math.ceil((requiredMs - accountAgeMs) / 86_400_000);
        return {
          allowed: false,
          reason: `Your Discord account is too new. You need to wait ${daysRemaining} more day(s) to enter.`,
        };
      }
    }

    // 2. Server tenure gate
    if (requirements.minServerTenureDays && requirements.minServerTenureDays > 0) {
      if (!member.joinedTimestamp) {
        return {
          allowed: false,
          reason: 'Could not verify server join date.',
        };
      }
      const tenureMs = now - member.joinedTimestamp;
      const requiredMs = requirements.minServerTenureDays * 86_400_000;
      if (tenureMs < requiredMs) {
        const daysRemaining = Math.ceil((requiredMs - tenureMs) / 86_400_000);
        return {
          allowed: false,
          reason: `You must be a member of this server for at least ${requirements.minServerTenureDays} days. You need ${daysRemaining} more day(s).`,
        };
      }
    }

    // 3. Blacklisted roles check
    if (requirements.blacklistedRoleIds && requirements.blacklistedRoleIds.length > 0) {
      const hasBlacklisted = member.roleIds.some((id) =>
        requirements.blacklistedRoleIds!.includes(id),
      );
      if (hasBlacklisted) {
        return {
          allowed: false,
          reason: 'You hold a role that is restricted from entering this giveaway.',
        };
      }
    }

    // 4. Required roles check
    if (requirements.requiredRoleIds && requirements.requiredRoleIds.length > 0) {
      const hasRequired = member.roleIds.some((id) =>
        requirements.requiredRoleIds!.includes(id),
      );
      if (!hasRequired) {
        return {
          allowed: false,
          reason: 'You do not have the required role to enter this giveaway.',
        };
      }
    }

    // 5. Calculate bonus multiplier
    let multiplier = 1;
    if (member.isBooster) {
      multiplier = Math.max(multiplier, 2);
    }

    if (requirements.bonusRoles && requirements.bonusRoles.length > 0) {
      for (const bonus of requirements.bonusRoles) {
        if (member.roleIds.includes(bonus.roleId)) {
          multiplier = Math.max(multiplier, bonus.multiplier);
        }
      }
    }

    return { allowed: true, bonusMultiplier: multiplier };
  }

  /**
   * Creates and registers a new giveaway.
   */
  async createGiveaway(options: GiveawayCreationOptions): Promise<Giveaway> {
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + options.durationMs);

    return this.giveawayRepo.create({
      id: crypto.randomUUID(),
      guildId: options.guildId,
      channelId: options.channelId,
      messageId: '', // To be filled after message send, or updated
      prize: options.prize,
      winnerCount: Math.max(1, options.winnerCount),
      startsAt,
      endsAt,
      isEnded: false,
      requirements: (options.requirements as Record<string, unknown>) ?? {},
      createdBy: options.createdBy,
    });
  }

  /**
   * Concludes a giveaway, rolls winners atomically, and fires completion hooks.
   */
  async rollAndEndGiveaway(giveawayId: string): Promise<GiveawayEndResult | null> {
    const giveaway = await this.giveawayRepo.findById(giveawayId);
    if (!giveaway || giveaway.isEnded) {
      return null;
    }

    const entries = await this.giveawayRepo.getEntries(giveawayId);
    const winnerIds = this.selectWinners(entries, giveaway.winnerCount, [], this.rngFn);

    await this.giveawayRepo.endGiveaway(giveawayId, winnerIds);

    const result: GiveawayEndResult = {
      giveaway: { ...giveaway, isEnded: true },
      winnerIds,
      isReroll: false,
    };

    if (this.onGiveawayEnded) {
      try {
        await this.onGiveawayEnded(result);
      } catch (err) {
        console.error(`[GiveawayEngine] onGiveawayEnded hook failed for ${giveawayId}:`, err);
      }
    }

    return result;
  }

  /**
   * Rerolls winner(s) for an already ended giveaway, excluding prior winners.
   */
  async reroll(
    giveawayId: string,
    customWinnerCount?: number,
  ): Promise<GiveawayEndResult | null> {
    const giveaway = await this.giveawayRepo.findById(giveawayId);
    if (!giveaway || !giveaway.isEnded) {
      return null;
    }

    const entries = await this.giveawayRepo.getEntries(giveawayId);
    const existingWinners = await this.giveawayRepo.getWinners(giveawayId);
    const existingWinnerIds = existingWinners.map((w) => w.userId);

    const count = customWinnerCount && customWinnerCount > 0
      ? customWinnerCount
      : giveaway.winnerCount;

    const newWinnerIds = this.selectWinners(entries, count, existingWinnerIds, this.rngFn);

    if (newWinnerIds.length > 0) {
      await this.giveawayRepo.recordWinners(giveawayId, newWinnerIds, true);
    }

    return {
      giveaway,
      winnerIds: newWinnerIds,
      isReroll: true,
    };
  }

  /**
   * Formats a rich aesthetic giveaway embed.
   */
  formatGiveawayEmbed(
    giveaway: Giveaway,
    entryCount: number,
    winners?: string[],
  ): {
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    footer: { text: string };
    timestamp: Date;
  } {
    const isEnded = giveaway.isEnded;
    const endsAtUnix = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      {
        name: '👑 Hosted By',
        value: `<@${giveaway.createdBy}>`,
        inline: true,
      },
      {
        name: '🏆 Winners',
        value: `${giveaway.winnerCount}`,
        inline: true,
      },
      {
        name: '🎟️ Entries',
        value: `${entryCount}`,
        inline: true,
      },
    ];

    if (!isEnded) {
      fields.push({
        name: '⏳ Ends In',
        value: `<t:${endsAtUnix}:R> (<t:${endsAtUnix}:f>)`,
        inline: false,
      });

      const reqs = giveaway.requirements as GiveawayRequirements | undefined;
      const reqNotes: string[] = [];
      if (reqs?.minAccountAgeDays) {
        reqNotes.push(`• Min Account Age: **${reqs.minAccountAgeDays} days**`);
      }
      if (reqs?.minServerTenureDays) {
        reqNotes.push(`• Min Server Tenure: **${reqs.minServerTenureDays} days**`);
      }
      if (reqs?.requiredRoleIds && reqs.requiredRoleIds.length > 0) {
        reqNotes.push(`• Required Roles: ${reqs.requiredRoleIds.map((r) => `<@&${r}>`).join(', ')}`);
      }
      if (reqs?.bonusRoles && reqs.bonusRoles.length > 0) {
        reqNotes.push(
          `• Bonus Entries: ${reqs.bonusRoles.map((b) => `<@&${b.roleId}> (${b.multiplier}x)`).join(', ')}`,
        );
      }

      if (reqNotes.length > 0) {
        fields.push({
          name: '📋 Entry Requirements & Perks',
          value: reqNotes.join('\n'),
          inline: false,
        });
      }

      return {
        title: `🎉 GIVEAWAY: ${giveaway.prize}`,
        description: 'Click the button below to enter! May luck be in your favor.',
        color: 0x5865f2, // Blurple
        fields,
        footer: { text: `Giveaway ID: ${giveaway.id}` },
        timestamp: new Date(giveaway.endsAt),
      };
    } else {
      const winnerDisplay = winners && winners.length > 0
        ? winners.map((id) => `<@${id}>`).join(', ')
        : 'None (No eligible entries)';

      fields.push({
        name: '🎉 Winners Announced',
        value: winnerDisplay,
        inline: false,
      });

      return {
        title: `🎉 GIVEAWAY ENDED: ${giveaway.prize}`,
        description: `This giveaway has officially concluded!\n\n**Winner(s)**: ${winnerDisplay}`,
        color: 0x2b2d31, // Dark slate
        fields,
        footer: { text: `Giveaway ID: ${giveaway.id} • Ended` },
        timestamp: new Date(giveaway.endsAt),
      };
    }
  }

  /**
   * Formats the Discord action row button for giveaway entry.
   */
  formatGiveawayButton(
    giveawayId: string,
    isEnded: boolean,
    entryCount: number,
  ): {
    customId: string;
    label: string;
    style: number; // 1 = Primary, 2 = Secondary
    disabled: boolean;
    emoji: { name: string };
  } {
    return {
      customId: `giveaway:enter:${giveawayId}`,
      label: isEnded ? 'Giveaway Ended' : `Enter (${entryCount})`,
      style: isEnded ? 2 : 1,
      disabled: isEnded,
      emoji: { name: '🎉' },
    };
  }
}
