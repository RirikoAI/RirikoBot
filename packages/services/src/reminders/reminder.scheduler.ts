import type { Client } from 'discord.js';
import type { Reminder, ReminderRepository } from '@ririko/database';
import { nextOccurrence, type ReminderRepeat } from './reminder-time.js';

/** Sends a reminder; resolves false when the user could not be reached at all. */
export type ReminderDelivery = (reminder: Reminder) => Promise<boolean>;

/** IANA zone for a user's repeating reminders (user preference, then guild, then UTC). */
export type ReminderTimeZoneResolver = (userId: string, guildId: string | null) => Promise<string>;

export interface ReminderSchedulerOptions {
  repo: ReminderRepository;
  deliver: ReminderDelivery;
  resolveTimeZone: ReminderTimeZoneResolver;
  intervalMs?: number;
  batchSize?: number;
  now?: () => Date;
  logger?: Pick<Console, 'warn' | 'error'>;
}

export interface ReminderSweepResult {
  delivered: number;
  rescheduled: number;
  dropped: number;
}

/**
 * Polls for due reminders and delivers each one once. A reminder is claimed before sending, so
 * two schedulers can never both deliver it. If delivery fails everywhere it is dropped for good,
 * repeating ones included, rather than retried.
 */
export class ReminderScheduler {
  private readonly options: Required<Omit<ReminderSchedulerOptions, 'logger'>> & {
    logger: Pick<Console, 'warn' | 'error'>;
  };
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(options: ReminderSchedulerOptions) {
    this.options = {
      intervalMs: 15_000,
      batchSize: 50,
      now: () => new Date(),
      logger: console,
      ...options,
    };
  }

  start(): void {
    if (this.timer) return;
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), this.options.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async sweep(): Promise<ReminderSweepResult> {
    const result: ReminderSweepResult = { delivered: 0, rescheduled: 0, dropped: 0 };
    // A slow sweep must not overlap the next tick.
    if (this.sweeping) return result;
    this.sweeping = true;
    try {
      const { repo, batchSize } = this.options;
      for (const reminder of await repo.findDue(this.options.now(), batchSize)) {
        if (!(await repo.claim(reminder.id))) continue;
        await this.handle(reminder, result);
      }
    } catch (err) {
      this.options.logger.error('[ReminderScheduler] Sweep failed:', err);
    } finally {
      this.sweeping = false;
    }
    return result;
  }

  private async handle(reminder: Reminder, result: ReminderSweepResult): Promise<void> {
    const { deliver, repo, resolveTimeZone, logger } = this.options;

    let delivered = false;
    try {
      delivered = await deliver(reminder);
    } catch (err) {
      logger.error(`[ReminderScheduler] Delivery of ${reminder.id} threw:`, err);
    }
    if (!delivered) {
      result.dropped += 1;
      logger.warn(
        `[ReminderScheduler] Dropped reminder ${reminder.id}: user ${reminder.userId} unreachable by DM and channel.`,
      );
      return;
    }
    result.delivered += 1;

    const repeat = reminder.repeatInterval as ReminderRepeat;
    if (repeat === 'NONE') return;
    try {
      const timeZone = await resolveTimeZone(reminder.userId, reminder.guildId);
      const next = nextOccurrence(reminder.triggerAt, repeat, timeZone, this.options.now());
      if (next) {
        await repo.reschedule(reminder.id, next);
        result.rescheduled += 1;
      }
    } catch (err) {
      logger.error(`[ReminderScheduler] Could not reschedule ${reminder.id}:`, err);
    }
  }
}

const REPEAT_NOTE: Record<string, string> = {
  DAILY: ' *(repeats daily)*',
  WEEKLY: ' *(repeats weekly)*',
};

/**
 * 1.4.0 delivery order: DM first, then the channel where the reminder was set, mentioning only
 * the reminded user.
 */
export function createDiscordReminderDelivery(client: Client): ReminderDelivery {
  return async (reminder) => {
    const text = `⏰ **Reminder:** ${reminder.message}${REPEAT_NOTE[reminder.repeatInterval] ?? ''}`;
    try {
      const user = await client.users.fetch(reminder.userId);
      await user.send({ content: text, allowedMentions: { parse: [] } });
      return true;
    } catch {
      // DMs closed or user gone; fall back to the channel.
    }
    try {
      const channel = await client.channels.fetch(reminder.channelId);
      if (channel?.isSendable()) {
        await channel.send({
          content: `<@${reminder.userId}>, ${text}\n-# I tried to DM you but couldn't.`,
          allowedMentions: { users: [reminder.userId] },
        });
        return true;
      }
    } catch {
      // Channel deleted or no access.
    }
    return false;
  };
}
