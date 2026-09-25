import type { BotActivityRepository, CommandUsageDaily } from '@ririko/database';

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` of the UTC day that contains `time`. */
export function utcDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export interface CommandUsageRecorderOptions {
  /** How often buffered counts are written. */
  intervalMs?: number;
  /** Days of usage kept; older rows are deleted once a day. */
  retentionDays?: number;
  now?: () => number;
}

/**
 * Counts commands run in guilds for the dashboard usage chart. `record` only touches memory, so
 * it is safe on the command hot path; `flush` adds the buffered counts to `command_usage_daily`.
 */
export class CommandUsageRecorder {
  private readonly intervalMs: number;
  private readonly retentionDays: number;
  private readonly now: () => number;
  private pending = new Map<string, CommandUsageDaily>();
  private prunedDay: string | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly repo: Pick<
      BotActivityRepository,
      'addCommandUsage' | 'deleteCommandUsageBefore'
    >,
    options: CommandUsageRecorderOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? 60_000;
    this.retentionDays = options.retentionDays ?? 90;
    this.now = options.now ?? Date.now;
  }

  /** Counts one run of `commandName`. Commands outside a guild are not counted. */
  record(guildId: string | null, commandName: string): void {
    if (!guildId) return;
    const day = utcDay(this.now());
    const key = `${guildId}/${day}/${commandName}`;
    const row = this.pending.get(key);
    if (row) row.count++;
    else this.pending.set(key, { guildId, day, commandName, count: 1 });
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.flush().catch((err: unknown) => {
        console.error('[CommandUsageRecorder] Failed to write command usage:', err);
      });
    }, this.intervalMs);
  }

  /** Stops the timer and writes what is still buffered. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  /** Writes buffered counts. On failure they go back into the buffer for the next flush. */
  async flush(): Promise<void> {
    const rows = [...this.pending.values()];
    this.pending = new Map();
    try {
      await this.repo.addCommandUsage(rows);
    } catch (err) {
      for (const row of rows) {
        const key = `${row.guildId}/${row.day}/${row.commandName}`;
        const pending = this.pending.get(key);
        if (pending) pending.count += row.count;
        else this.pending.set(key, row);
      }
      throw err;
    }

    const today = utcDay(this.now());
    if (this.prunedDay !== today) {
      await this.repo.deleteCommandUsageBefore(utcDay(this.now() - this.retentionDays * DAY_MS));
      this.prunedDay = today;
    }
  }
}
