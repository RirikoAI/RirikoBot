import type {
  AiRepository,
  AuditLogRepository,
  GuildDataRepository,
  ImageRepository,
  MusicRepository,
} from '@ririko/database';

const DAY_MS = 86_400_000;

/**
 * How long each kind of data is kept, in days. The privacy policy (docs/legal/privacy.md) states
 * these periods, so change them only together with the policy.
 */
export const RETENTION_DAYS = {
  /** `ai_messages` by `created_at`, empty `ai_conversations` by `updated_at`, and summaries. */
  ai: 90,
  /** `music_history` by `played_at`. */
  musicHistory: 90,
  /** Finished (COMPLETED or FAILED) `image_jobs` by `created_at`. */
  imageJobs: 90,
  /** `audit_logs` by `created_at`. */
  auditLog: 365,
  /**
   * A server's data (every table in `GUILD_DATA_INVENTORY`, then its `guilds` row), counted from
   * `guilds.left_at`, the time the bot left or was removed. Adding the bot back clears it.
   */
  departedGuild: 90,
} as const;

export type RetentionTable = keyof typeof RETENTION_DAYS;

/**
 * Rows deleted per table, servers purged for `departedGuild`, or `null` for a table whose purge
 * failed.
 */
export type RetentionCounts = Record<RetentionTable, number | null>;

export interface RetentionLogger {
  info(message: string): void;
  error(message: string): void;
}

export interface DataRetentionServiceOptions {
  /** Milliseconds since the epoch. Defaults to the system clock. */
  now?: () => number;
  /** How long after `start` the first purge runs. Default one minute. */
  initialDelayMs?: number;
  /** How often the service checks whether today's purge ran. Default one hour. */
  checkIntervalMs?: number;
  logger?: RetentionLogger;
}

/** `YYYY-MM-DD` of the UTC day that contains `time`. */
function utcDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** `table=count` pairs of a purge result, in table order. */
function formatCounts(counts: Readonly<Record<string, number>>): string {
  return Object.entries(counts)
    .map(([table, rows]) => `${table}=${rows}`)
    .join(', ');
}

/** The message of a thrown value. Database errors name the query and the cutoff, never chat text. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Deletes data past its retention period once per UTC day, so the privacy policy can state fixed
 * periods (`RETENTION_DAYS`). The first purge runs shortly after `start`; a timer then checks
 * every hour and purges when the current UTC day has not had a complete purge yet. Each table is
 * purged on its own: a failure is logged and the other tables still run, and the day then stays
 * open, so the next hourly check tries again. One line with the counts is logged per purge.
 */
export class DataRetentionService {
  private readonly now: () => number;
  private readonly initialDelayMs: number;
  private readonly checkIntervalMs: number;
  private readonly logger: RetentionLogger;
  private completedDay: string | null = null;
  private running: Promise<RetentionCounts> | null = null;
  private firstTimer: NodeJS.Timeout | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly repos: {
      ai: Pick<AiRepository, 'deleteOlderThan'>;
      music: Pick<MusicRepository, 'deleteOlderThan'>;
      images: Pick<ImageRepository, 'deleteOlderThan'>;
      audit: Pick<AuditLogRepository, 'deleteOlderThan'>;
      guilds: Pick<GuildDataRepository, 'listDepartedBefore' | 'purgeGuild'>;
    },
    options: DataRetentionServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.initialDelayMs = options.initialDelayMs ?? 60_000;
    this.checkIntervalMs = options.checkIntervalMs ?? 3_600_000;
    this.logger = options.logger ?? {
      info: (message) => console.log(message),
      error: (message) => console.error(message),
    };
  }

  /** Schedules the first purge and the hourly check. Calling it again does nothing. */
  start(): void {
    if (this.timer) return;
    this.firstTimer = setTimeout(() => void this.tick(), this.initialDelayMs);
    this.timer = setInterval(() => void this.tick(), this.checkIntervalMs);
  }

  /** Stops the timers and waits for a purge that is already running. */
  async stop(): Promise<void> {
    if (this.firstTimer) clearTimeout(this.firstTimer);
    if (this.timer) clearInterval(this.timer);
    this.firstTimer = null;
    this.timer = null;
    await this.running?.catch(() => undefined);
  }

  /** Purges now if this UTC day has no complete purge yet. Never throws. */
  async tick(): Promise<void> {
    if (this.running || this.completedDay === utcDay(this.now())) return;
    await this.runOnce().catch(() => undefined);
  }

  /**
   * Purges every table once, whatever the day guard says. Returns the rows deleted per table,
   * `null` for a table that failed. Calls made while a purge runs share its result.
   */
  runOnce(): Promise<RetentionCounts> {
    this.running ??= this.purge().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async purge(): Promise<RetentionCounts> {
    const now = this.now();
    const cutoff = (table: RetentionTable) => new Date(now - RETENTION_DAYS[table] * DAY_MS);
    const counts: RetentionCounts = {
      ai: null,
      musicHistory: null,
      imageJobs: null,
      auditLog: null,
      departedGuild: null,
    };
    const jobs: Record<Exclude<RetentionTable, 'departedGuild'>, () => Promise<number>> = {
      ai: () => this.repos.ai.deleteOlderThan(cutoff('ai')),
      musicHistory: () => this.repos.music.deleteOlderThan(cutoff('musicHistory')),
      imageJobs: () => this.repos.images.deleteOlderThan(cutoff('imageJobs')),
      auditLog: () => this.repos.audit.deleteOlderThan(cutoff('auditLog')),
    };

    const failed: RetentionTable[] = [];
    for (const table of Object.keys(jobs) as (keyof typeof jobs)[]) {
      try {
        counts[table] = await jobs[table]();
      } catch (error) {
        failed.push(table);
        this.logger.error(`[DataRetention] The ${table} purge failed: ${describeError(error)}`);
      }
    }
    try {
      const { purged, failures } = await this.purgeDepartedGuilds(cutoff('departedGuild'));
      counts.departedGuild = purged;
      if (failures > 0) failed.push('departedGuild');
    } catch (error) {
      failed.push('departedGuild');
      this.logger.error(`[DataRetention] The departedGuild purge failed: ${describeError(error)}`);
    }

    const summary = (Object.keys(counts) as RetentionTable[])
      .map((table) => `${table}=${counts[table] ?? 'failed'}`)
      .join(', ');
    this.logger.info(`[DataRetention] Purge finished: ${summary}`);
    if (failed.length === 0) this.completedDay = utcDay(now);
    return counts;
  }

  /**
   * Deletes the data of every server the bot left before `cutoff`, one server and one transaction
   * at a time. A server that fails is logged and rolled back, and the others still run. Logs the
   * row counts per table of each server, never any content.
   */
  private async purgeDepartedGuilds(cutoff: Date): Promise<{ purged: number; failures: number }> {
    let purged = 0;
    let failures = 0;
    for (const guildId of await this.repos.guilds.listDepartedBefore(cutoff)) {
      try {
        const result = await this.repos.guilds.purgeGuild(guildId, cutoff);
        // Null: the bot was added back after the list was read, so the server keeps its data.
        if (!result) continue;
        purged += 1;
        this.logger.info(
          `[DataRetention] Deleted server ${guildId}: ${formatCounts(result.deleted)}` +
            (Object.keys(result.detached).length > 0
              ? `; unlinked from the server: ${formatCounts(result.detached)}`
              : ''),
        );
      } catch (error) {
        failures += 1;
        this.logger.error(
          `[DataRetention] The purge of server ${guildId} failed: ${describeError(error)}`,
        );
      }
    }
    return { purged, failures };
  }
}
