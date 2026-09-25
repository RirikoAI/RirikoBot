import type { Client } from 'discord.js';
import type { BotActivityRepository, VoiceChannelActivity } from '@ririko/database';

/** `bot_status.id` of the bot process. */
export const BOT_STATUS_ID = 'bot';
/** How often the bot writes its status and voice activity. */
export const BOT_STATUS_INTERVAL_MS = 30_000;
/** A status older than this means the bot is offline (three missed writes). */
export const BOT_STATUS_STALE_MS = BOT_STATUS_INTERVAL_MS * 3;

export interface BotStatusReporterOptions {
  version: string;
  intervalMs?: number;
  now?: () => number;
}

/**
 * Publishes the bot's live state for the dashboard and health checks: gateway ping, guild count
 * and uptime in `bot_status`, and each guild's active voice channels in `guild_voice_activity`.
 * Voice rows are written only for guilds whose activity changed since the last write.
 */
export class BotStatusReporter {
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly startedAt: Date;
  /** Voice activity last written per guild, serialized. */
  private written = new Map<string, string>();
  private cleared = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly client: Pick<Client, 'ws' | 'guilds'>,
    private readonly repo: Pick<
      BotActivityRepository,
      'saveBotStatus' | 'setVoiceActivity' | 'clearVoiceActivity'
    >,
    private readonly options: BotStatusReporterOptions,
  ) {
    this.intervalMs = options.intervalMs ?? BOT_STATUS_INTERVAL_MS;
    this.now = options.now ?? Date.now;
    this.startedAt = new Date(this.now());
  }

  /** Writes now, then on every interval. Safe to call again after a gateway reconnect. */
  start(): void {
    if (this.timer) return;
    const tick = () => {
      this.tick().catch((err: unknown) => {
        console.error('[BotStatusReporter] Failed to write bot status:', err);
      });
    };
    this.timer = setInterval(tick, this.intervalMs);
    tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    const now = new Date(this.now());
    const ping = this.client.ws.ping;
    await this.repo.saveBotStatus({
      id: BOT_STATUS_ID,
      gatewayPingMs: ping >= 0 ? Math.round(ping) : null,
      guildCount: this.client.guilds.cache.size,
      version: this.options.version,
      startedAt: this.startedAt,
      updatedAt: now,
    });

    // Rows left by an earlier run are unknown to this one, so the first write starts clean.
    if (!this.cleared) {
      await this.repo.clearVoiceActivity();
      this.cleared = true;
    }

    const current = this.voiceActivity();
    for (const [guildId, channels] of current) {
      const serialized = JSON.stringify(channels);
      if (this.written.get(guildId) === serialized) continue;
      await this.repo.setVoiceActivity(guildId, channels, now);
      this.written.set(guildId, serialized);
    }
    for (const guildId of [...this.written.keys()]) {
      if (current.has(guildId)) continue;
      await this.repo.setVoiceActivity(guildId, [], now);
      this.written.delete(guildId);
    }
  }

  /** Voice channels with at least one member who is not a bot, per guild. */
  private voiceActivity(): Map<string, VoiceChannelActivity[]> {
    const activity = new Map<string, VoiceChannelActivity[]>();
    for (const guild of this.client.guilds.cache.values()) {
      const members = new Map<string, number>();
      for (const state of guild.voiceStates.cache.values()) {
        if (!state.channelId || state.member?.user.bot) continue;
        members.set(state.channelId, (members.get(state.channelId) ?? 0) + 1);
      }
      if (members.size === 0) continue;
      activity.set(
        guild.id,
        [...members]
          .map(([channelId, count]) => ({ channelId, members: count }))
          .sort((a, b) => a.channelId.localeCompare(b.channelId)),
      );
    }
    return activity;
  }
}
