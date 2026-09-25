import type { XpRepository, UserRepository, GuildSettingsRepository } from '@ririko/database';
import type { EventBus } from '@ririko/core';
import type { LevelProgress, LevelUpEvent, AddXpServiceResult, KarmaProfile } from './types.js';
import type { BankingService } from './banking.service.js';

export interface LevelingServiceOptions {
  xpRepository: XpRepository;
  userRepository?: UserRepository | undefined;
  guildSettingsRepository?: GuildSettingsRepository | undefined;
  bankingService?: BankingService | undefined;
  eventBus?: EventBus | undefined;
}

/**
 * Leveling & Karma Service implementing Section 33 of BLUEPRINT.md and Section 6 of docs/economy.md:
 * - Mathematical formula: Delta XP = 5L^2 + 50L + 100.
 * - Closed-form total XP cumulative summation.
 * - Bidirectional exact level & progress calculation.
 * - Level-up threshold events and notification filtering (user opt-out & server opt-out).
 * - Legacy Karma profile tracking and management.
 */
export class LevelingService {
  private readonly xpRepository: XpRepository;
  private readonly userRepository?: UserRepository | undefined;
  private readonly guildSettingsRepository?: GuildSettingsRepository | undefined;
  private readonly bankingService?: BankingService | undefined;
  private readonly eventBus?: EventBus | undefined;

  constructor(options: LevelingServiceOptions) {
    this.xpRepository = options.xpRepository;
    this.userRepository = options.userRepository;
    this.guildSettingsRepository = options.guildSettingsRepository;
    this.bankingService = options.bankingService;
    this.eventBus = options.eventBus;
  }

  /**
   * Calculates the XP required to advance from `level` to `level + 1`.
   * Formula: Delta XP = 5L^2 + 50L + 100
   */
  public getXpForLevel(level: number): number {
    const validLevel = Math.max(0, Math.floor(level));
    return 5 * validLevel * validLevel + 50 * validLevel + 100;
  }

  /**
   * Calculates the cumulative total XP required to reach `level` from 0.
   * Closed-form summation: sum_{k=0}^{L-1} (5k^2 + 50k + 100)
   * = 5 * (L - 1) * L * (2L - 1) / 6 + 25 * (L - 1) * L + 100 * L
   */
  public getTotalXpForLevel(level: number): number {
    const validLevel = Math.max(0, Math.floor(level));
    if (validLevel === 0) return 0;

    const L = validLevel;
    const sumSquares = Math.floor(((L - 1) * L * (2 * L - 1)) / 6);
    const sumLinear = Math.floor(((L - 1) * L) / 2);

    return 5 * sumSquares + 50 * sumLinear + 100 * L;
  }

  /**
   * Computes the exact level, XP progress within level, and next milestone from total cumulative XP.
   */
  public getLevelProgress(totalXp: number): LevelProgress {
    const validXp = Math.max(0, Math.floor(totalXp));

    if (validXp <= 0) {
      return {
        level: 0,
        currentLevelXp: 0,
        xpForNextLevel: 100,
        totalXpForCurrentLevel: 0,
        totalXpForNextLevel: 100,
        progressPercent: 0,
      };
    }

    // Binary search for exact level in [0, 100000]
    let low = 0;
    let high = 100000;
    let level = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const reqXp = this.getTotalXpForLevel(mid);

      if (reqXp <= validXp) {
        level = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const totalXpForCurrentLevel = this.getTotalXpForLevel(level);
    const currentLevelXp = validXp - totalXpForCurrentLevel;
    const xpForNextLevel = this.getXpForLevel(level);
    const totalXpForNextLevel = totalXpForCurrentLevel + xpForNextLevel;
    const progressPercent = Number(
      Math.min(100, Math.max(0, (currentLevelXp / xpForNextLevel) * 100)).toFixed(2),
    );

    return {
      level,
      currentLevelXp,
      xpForNextLevel,
      totalXpForCurrentLevel,
      totalXpForNextLevel,
      progressPercent,
    };
  }

  /**
   * Adds experience points to a user's account, computes level progression,
   * publishes level-up events, and checks notification permissions.
   */
  public async addExperience(
    userId: string,
    guildId: string,
    xpAmount: number,
    source: string,
  ): Promise<AddXpServiceResult> {
    if (xpAmount <= 0) {
      const current = await this.xpRepository.getOrCreateAccount(userId, guildId);
      const currentXp = Number(current.xp);
      const progress = this.getLevelProgress(currentXp);

      return {
        userId,
        guildId,
        xpAdded: 0,
        totalXp: currentXp,
        progress,
        didLevelUp: false,
        previousLevel: progress.level,
        newLevel: progress.level,
        levelsGained: 0,
        shouldNotify: false,
        eventId: '',
      };
    }

    // 1. Fetch current account and level
    const current = await this.xpRepository.getOrCreateAccount(userId, guildId);
    const oldTotalXp = Number(current.xp);
    const oldProgress = this.getLevelProgress(oldTotalXp);

    // 2. Compute new state
    const newTotalXp = oldTotalXp + xpAmount;
    const newProgress = this.getLevelProgress(newTotalXp);
    const didLevelUp = newProgress.level > oldProgress.level;
    const levelsGained = newProgress.level - oldProgress.level;

    // 3. Atomically persist XP and new level
    const result = await this.xpRepository.addXp({
      userId,
      guildId,
      xpDelta: xpAmount,
      source,
      newLevel: newProgress.level,
    });

    // 4. Synchronize bank capacity with new level if bankingService is available
    if (didLevelUp && this.bankingService) {
      await this.bankingService.syncBankCapacity(userId, newProgress.level);
    }

    // 5. Evaluate notification preferences
    let shouldNotify = false;
    if (didLevelUp) {
      let userOptIn = true;
      let serverOptIn = true;

      if (this.userRepository) {
        const user = await this.userRepository.findById(userId);
        if (user) {
          userOptIn = user.notifyLevelUp;
        }
      }

      if (this.guildSettingsRepository) {
        const settings = await this.guildSettingsRepository.findById(guildId);
        if (settings) {
          serverOptIn = settings.karmaNotificationsEnabled;
        }
      }

      shouldNotify = userOptIn && serverOptIn;

      // 6. Publish LEVEL_UP event
      if (this.eventBus) {
        const eventPayload: LevelUpEvent = {
          userId,
          guildId,
          previousLevel: oldProgress.level,
          newLevel: newProgress.level,
          levelsGained,
          totalXp: newTotalXp,
          shouldNotify,
        };

        this.eventBus.emit('leveling:levelUp', eventPayload);
      }
    }

    return {
      userId,
      guildId,
      xpAdded: xpAmount,
      totalXp: newTotalXp,
      progress: newProgress,
      didLevelUp,
      previousLevel: oldProgress.level,
      newLevel: newProgress.level,
      levelsGained,
      shouldNotify,
      eventId: result.event.id,
    };
  }

  /**
   * Retrieves a user's Karma profile and notification preferences.
   */
  public async getKarmaProfile(userId: string, guildId: string): Promise<KarmaProfile> {
    const account = await this.xpRepository.getOrCreateAccount(userId, guildId);

    let userNotificationsEnabled = true;
    let serverNotificationsEnabled = true;

    if (this.userRepository) {
      const user = await this.userRepository.findById(userId);
      if (user) {
        userNotificationsEnabled = user.notifyLevelUp;
      }
    }

    if (this.guildSettingsRepository) {
      const settings = await this.guildSettingsRepository.findById(guildId);
      if (settings) {
        serverNotificationsEnabled = settings.karmaNotificationsEnabled;
      }
    }

    return {
      userId,
      guildId,
      karma: account.karma,
      userNotificationsEnabled,
      serverNotificationsEnabled,
    };
  }

  /**
   * Updates an individual user's level-up notification preference.
   */
  public async setUserNotifications(userId: string, enabled: boolean): Promise<boolean> {
    if (!this.userRepository) return enabled;
    const existing = await this.userRepository.findById(userId);
    if (existing) {
      await this.userRepository.update(userId, { notifyLevelUp: enabled });
    } else {
      await this.userRepository.create({
        id: userId,
        username: `user_${userId}`,
        notifyLevelUp: enabled,
      });
    }
    return enabled;
  }

  /**
   * Updates a server's level-up and karma broadcast notification preference.
   */
  public async setServerNotifications(guildId: string, enabled: boolean): Promise<boolean> {
    if (!this.guildSettingsRepository) return enabled;
    await this.guildSettingsRepository.update(guildId, {
      karmaNotificationsEnabled: enabled,
    });
    return enabled;
  }

  /**
   * Awards or adjusts Karma for a user in a guild.
   */
  public async awardKarma(userId: string, guildId: string, karmaDelta: number): Promise<number> {
    const updated = await this.xpRepository.addKarma(userId, guildId, karmaDelta);
    return updated.karma;
  }
}
