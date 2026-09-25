import {
  EconomyEventType,
  type EconomyEvent,
  type RewardResult,
  type VoiceParticipant,
  type VoiceTrackerConfig,
  type VoiceTickResult,
} from './types.js';
import type { EconomyService } from './economy.service.js';

interface ResolvedVoiceTrackerConfig {
  minQuorum: number;
  intervalSeconds: number;
}

export interface VoiceAccumulatorOptions {
  economyService?: EconomyService | undefined;
  config?: VoiceTrackerConfig | undefined;
  initialTime?: number | undefined;
}

/**
 * Voice Session Accumulator implementing Section 35 of BLUEPRINT.md:
 * - Minimum quorum of 2 unmuted, undeafened human participants.
 * - Disqualifies bots, self-muted, self-deafened, and server-muted members.
 * - Excludes designated AFK channels.
 * - Accrues time in discrete intervals (default: 60s) before firing VOICE_MINUTE events.
 */
export class VoiceSessionAccumulator {
  private readonly economyService?: EconomyService | undefined;
  private readonly config: ResolvedVoiceTrackerConfig;
  private readonly afkChannels = new Set<string>();

  // State
  private readonly participants = new Map<string, VoiceParticipant>();
  private readonly channelMembers = new Map<string, Set<string>>();
  private readonly userActiveSeconds = new Map<string, number>();
  private lastTickAt: number;

  constructor(options: VoiceAccumulatorOptions = {}) {
    this.economyService = options.economyService;
    this.config = {
      minQuorum: options.config?.minQuorum ?? 2,
      intervalSeconds: options.config?.intervalSeconds ?? 60,
    };

    if (options.config?.afkChannelIds) {
      for (const id of options.config.afkChannelIds) {
        this.afkChannels.add(id);
      }
    }

    this.lastTickAt = options.initialTime ?? Date.now();
  }

  /**
   * Designates or removes an AFK channel.
   */
  public setAfkChannel(channelId: string, isAfk = true): void {
    if (isAfk) {
      this.afkChannels.add(channelId);
    } else {
      this.afkChannels.delete(channelId);
    }
  }

  /**
   * Checks if a channel is configured as an AFK channel.
   */
  public isAfkChannel(channelId: string): boolean {
    return this.afkChannels.has(channelId);
  }

  /**
   * Determines if a participant is an unmuted, undeafened human.
   */
  public isParticipantActiveHuman(p: VoiceParticipant): boolean {
    return (
      !p.isBot && !p.isSelfMuted && !p.isSelfDeafened && !p.isServerMuted && !p.isServerDeafened
    );
  }

  /**
   * Updates or registers a participant's voice state.
   * Call with participant = null when user leaves voice.
   */
  public onVoiceStateUpdate(
    participant: VoiceParticipant | null,
    previousChannelId?: string,
  ): void {
    if (!participant) {
      // User left voice
      if (previousChannelId) {
        const members = this.channelMembers.get(previousChannelId);
        if (members) {
          // Find matching participant by previous channel if possible
          for (const [uid, p] of this.participants.entries()) {
            if (p.channelId === previousChannelId) {
              members.delete(uid);
              this.participants.delete(uid);
              this.userActiveSeconds.delete(uid);
              break;
            }
          }
          if (members.size === 0) {
            this.channelMembers.delete(previousChannelId);
          }
        }
      }
      return;
    }

    const { userId, channelId } = participant;

    // Clean up previous channel if user moved
    if (previousChannelId && previousChannelId !== channelId) {
      const prevMembers = this.channelMembers.get(previousChannelId);
      if (prevMembers) {
        prevMembers.delete(userId);
        if (prevMembers.size === 0) {
          this.channelMembers.delete(previousChannelId);
        }
      }
    }

    // Register user in new channel
    let members = this.channelMembers.get(channelId);
    if (!members) {
      members = new Set<string>();
      this.channelMembers.set(channelId, members);
    }
    members.add(userId);

    this.participants.set(userId, {
      ...participant,
      joinedAt: participant.joinedAt ?? Date.now(),
    });
  }

  /**
   * Explicit handler when a user leaves voice by user ID.
   */
  public handleUserLeave(userId: string): void {
    const existing = this.participants.get(userId);
    if (existing) {
      const members = this.channelMembers.get(existing.channelId);
      if (members) {
        members.delete(userId);
        if (members.size === 0) {
          this.channelMembers.delete(existing.channelId);
        }
      }
      this.participants.delete(userId);
      this.userActiveSeconds.delete(userId);
    }
  }

  /**
   * Evaluates voice channels against quorum and accrues XP in discrete intervals.
   */
  public async tick(now = Date.now()): Promise<VoiceTickResult> {
    const deltaSeconds = Math.max(1, Math.round((now - this.lastTickAt) / 1000));
    this.lastTickAt = now;

    let activeCount = 0;
    let eligibleCount = 0;
    const awardedEvents: EconomyEvent[] = [];
    const rewardResults: RewardResult[] = [];

    for (const [channelId, userIds] of this.channelMembers.entries()) {
      // 1. Hard-exclude AFK channels
      if (this.afkChannels.has(channelId)) {
        continue;
      }

      // 2. Gather active humans in channel
      const activeHumansInChannel: VoiceParticipant[] = [];
      for (const uid of userIds) {
        const p = this.participants.get(uid);
        if (p) {
          activeCount++;
          if (this.isParticipantActiveHuman(p)) {
            activeHumansInChannel.push(p);
          }
        }
      }

      // 3. Quorum check (minimum unmuted, undeafened humans)
      if (activeHumansInChannel.length < this.config.minQuorum) {
        // Quorum not met, active humans do not accrue time
        continue;
      }

      eligibleCount += activeHumansInChannel.length;

      // 4. Accrue time for eligible participants
      for (const p of activeHumansInChannel) {
        const accrued = (this.userActiveSeconds.get(p.userId) ?? 0) + deltaSeconds;

        if (accrued >= this.config.intervalSeconds) {
          const minutesEarned = Math.floor(accrued / this.config.intervalSeconds);
          const remainder = accrued % this.config.intervalSeconds;
          this.userActiveSeconds.set(p.userId, remainder);

          const event: EconomyEvent = {
            type: EconomyEventType.VOICE_MINUTE,
            userId: p.userId,
            guildId: p.guildId,
            source: 'VOICE_SESSION',
            metadata: {
              channelId,
              minutesEarned,
              multiplier: minutesEarned,
            },
          };

          awardedEvents.push(event);

          if (this.economyService) {
            const res = await this.economyService.handleEvent(event);
            rewardResults.push(res);
          }
        } else {
          this.userActiveSeconds.set(p.userId, accrued);
        }
      }
    }

    return {
      evaluatedChannels: this.channelMembers.size,
      activeParticipants: activeCount,
      eligibleParticipants: eligibleCount,
      awardedEvents,
      rewardResults: this.economyService ? rewardResults : undefined,
    };
  }

  /**
   * Resets all tracking state.
   */
  public reset(now = Date.now()): void {
    this.participants.clear();
    this.channelMembers.clear();
    this.userActiveSeconds.clear();
    this.lastTickAt = now;
  }

  /**
   * Returns participant count.
   */
  public getParticipantCount(): number {
    return this.participants.size;
  }

  /**
   * Returns participant details by user ID.
   */
  public getParticipant(userId: string): VoiceParticipant | undefined {
    return this.participants.get(userId);
  }

  /**
   * Returns accrued active seconds for a participant.
   */
  public getAccruedSeconds(userId: string): number {
    return this.userActiveSeconds.get(userId) ?? 0;
  }
}
