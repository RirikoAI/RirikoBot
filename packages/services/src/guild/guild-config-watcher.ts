import type { EventBus } from '@ririko/core';
import type { GuildConfigVersionRepository } from '@ririko/database';

export interface GuildConfigWatcherOptions {
  /** How often the change feed is polled. */
  intervalMs?: number;
  /**
   * How far back each poll looks. Rows are compared by version, so the overlap absorbs writes
   * committed out of timestamp order and small clock differences between writer processes.
   */
  overlapMs?: number;
  now?: () => number;
}

/**
 * Turns the `guild_config_versions` change feed into `guild:configChanged` events, so the bot
 * process drops cached settings that the dashboard or CLI changed in another process.
 */
export class GuildConfigWatcher {
  private readonly intervalMs: number;
  private readonly overlapMs: number;
  private readonly now: () => number;
  /** Last seen version per `guildId/module`, kept for the overlap window. */
  private readonly seen = new Map<string, { version: number; updatedAt: number }>();
  private timer: NodeJS.Timeout | null = null;
  private since: number;

  constructor(
    private readonly repo: GuildConfigVersionRepository,
    private readonly eventBus: EventBus,
    options: GuildConfigWatcherOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? 5_000;
    this.overlapMs = options.overlapMs ?? 60_000;
    this.now = options.now ?? Date.now;
    // Caches are empty at startup, so only changes from now on matter.
    this.since = this.now();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        console.error('[GuildConfigWatcher] Failed to poll guild config changes:', err);
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Emits one event per guild module whose version changed since it was last seen. */
  async tick(): Promise<number> {
    const rows = await this.repo.listChangedSince(new Date(this.since - this.overlapMs));
    let emitted = 0;
    for (const row of rows) {
      const key = `${row.guildId}/${row.module}`;
      const updatedAt = row.updatedAt.getTime();
      if (this.seen.get(key)?.version === row.version) continue;
      this.seen.set(key, { version: row.version, updatedAt });
      this.since = Math.max(this.since, updatedAt);
      await this.eventBus.emitAsync('guild:configChanged', {
        guildId: row.guildId,
        module: row.module,
        version: row.version,
      });
      emitted++;
    }

    const horizon = this.since - this.overlapMs;
    for (const [key, entry] of this.seen) {
      if (entry.updatedAt < horizon) this.seen.delete(key);
    }
    return emitted;
  }
}
