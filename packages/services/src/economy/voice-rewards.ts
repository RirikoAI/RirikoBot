import type { EconomyService } from './economy.service.js';
import type { LevelingService } from './leveling.service.js';
import type { VoiceSessionAccumulator } from './voice-accumulator.js';
import type { EconomyEvent } from './types.js';

/** A guild's XP settings (`guild_settings`), as the bot caches them. */
export interface GuildXpRules {
  xpRatePercent: number;
  noXpChannelIds: readonly string[];
  noXpRoleIds: readonly string[];
  voiceXpEnabled: boolean;
  levelUpChannelId: string | null;
}

/**
 * False when any of `channelIds` (a channel and, for threads, its parent) is a no-XP channel or
 * the member holds a no-XP role.
 */
export function earnsXp(
  rules: Pick<GuildXpRules, 'noXpChannelIds' | 'noXpRoleIds'>,
  channelIds: readonly (string | null | undefined)[],
  roleIds: readonly string[],
): boolean {
  if (channelIds.some((id) => id && rules.noXpChannelIds.includes(id))) return false;
  return !roleIds.some((id) => rules.noXpRoleIds.includes(id));
}

/** Applies a guild's XP rate (100 is normal) to a base amount. */
export function scaleXp(xp: number, ratePercent: number): number {
  return Math.max(0, Math.round((xp * ratePercent) / 100));
}

export interface VoiceLevelUp {
  guildId: string;
  userId: string;
  /** The guild's level-up channel. */
  channelId: string;
  newLevel: number;
}

export interface VoiceRewardServiceOptions {
  accumulator: VoiceSessionAccumulator;
  economyService: EconomyService;
  levelingService: LevelingService;
  getRules: (guildId: string) => Promise<GuildXpRules>;
  /** The member's role IDs, or an empty list when the member is not cached. */
  getMemberRoleIds: (guildId: string, userId: string) => readonly string[];
  /** Called for level-ups the member and guild want announced, when the guild has a level-up channel. */
  onLevelUp?: ((levelUp: VoiceLevelUp) => Promise<void>) | undefined;
  intervalMs?: number | undefined;
}

/**
 * Pays voice credits and XP once a minute. The accumulator decides who was active (quorum,
 * mute state, AFK channel); this applies each guild's settings: nothing is paid unless the guild
 * turned voice rewards on, and no-XP channels, no-XP roles and the XP rate apply as for messages.
 */
export class VoiceRewardService {
  private readonly options: VoiceRewardServiceOptions;
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(options: VoiceRewardServiceOptions) {
    this.options = options;
    this.intervalMs = options.intervalMs ?? 60_000;
  }

  /** Starts the loop; calling it again (after a gateway reconnect) keeps the running loop. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch((err: unknown) => {
        console.error('[VoiceRewards] Tick failed:', err);
      });
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Runs one accrual round and returns how many members were paid. Overlapping calls are skipped. */
  async tick(now = Date.now()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const { awardedEvents } = await this.options.accumulator.tick(now);
      let paid = 0;
      for (const event of awardedEvents) {
        try {
          if (await this.reward(event)) paid++;
        } catch (err) {
          console.error(`[VoiceRewards] Could not reward ${event.userId}:`, err);
        }
      }
      return paid;
    } finally {
      this.running = false;
    }
  }

  private async reward(event: EconomyEvent): Promise<boolean> {
    const { guildId, userId } = event;
    if (!guildId) return false;
    const rules = await this.options.getRules(guildId);
    if (!rules.voiceXpEnabled) return false;
    const channelId =
      typeof event.metadata?.channelId === 'string' ? event.metadata.channelId : null;
    const roleIds = this.options.getMemberRoleIds(guildId, userId);
    if (!earnsXp(rules, [channelId], roleIds)) return false;

    const reward = await this.options.economyService.handleEvent(event);
    if (!reward.awarded) return false;

    const xp = scaleXp(reward.xp, rules.xpRatePercent);
    if (xp <= 0) return true;
    const result = await this.options.levelingService.addExperience(
      userId,
      guildId,
      xp,
      'VOICE_SESSION',
    );
    if (
      result.didLevelUp &&
      result.shouldNotify &&
      rules.levelUpChannelId &&
      this.options.onLevelUp
    ) {
      await this.options.onLevelUp({
        guildId,
        userId,
        channelId: rules.levelUpChannelId,
        newLevel: result.newLevel,
      });
    }
    return true;
  }
}
