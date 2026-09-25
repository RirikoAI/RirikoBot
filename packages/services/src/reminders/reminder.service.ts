import { BusinessLogicError, ValidationError } from '@ririko/core';
import type { Reminder, ReminderRepository } from '@ririko/database';
import { parseReminderTime, type ReminderRepeat } from './reminder-time.js';

export const REMINDER_LIMITS = {
  maxActivePerUser: 25,
  maxMessageLength: 500,
  maxHorizonDays: 365,
} as const;

export interface CreateReminderInput {
  userId: string;
  /** Null for reminders set in DMs. */
  guildId: string | null;
  channelId: string;
  /**
   * When to remind. With `message` omitted, the time phrase is removed from this text and the rest
   * becomes the message ("call mom tomorrow at 6pm").
   */
  when: string;
  message?: string | undefined;
  repeat?: ReminderRepeat | undefined;
  /** IANA zone used to read wall-clock times such as "9am". */
  timeZone: string;
}

export interface ReminderServiceOptions {
  repo: ReminderRepository;
  now?: () => Date;
}

/** Creates, lists and cancels reminders. Delivery is {@link ReminderScheduler}'s job. */
export class ReminderService {
  private readonly repo: ReminderRepository;
  private readonly now: () => Date;

  constructor(options: ReminderServiceOptions) {
    this.repo = options.repo;
    this.now = options.now ?? (() => new Date());
  }

  async create(input: CreateReminderInput): Promise<Reminder> {
    const now = this.now();
    const parsed = parseReminderTime(input.when, now, input.timeZone);
    if (!parsed) {
      throw new ValidationError(`Unrecognised reminder time: ${input.when}`, {
        userMessage:
          'I could not find a time in that. Try `30m`, `2h`, `tomorrow 9am`, `next friday at 8pm`, or `2026-12-25 08:00`.',
      });
    }

    const message = (input.message ?? parsed.remainder).trim();
    if (!message) {
      throw new ValidationError('Reminder message is empty', {
        userMessage: 'What should I remind you about? Add a message after the time.',
      });
    }
    if (message.length > REMINDER_LIMITS.maxMessageLength) {
      throw new ValidationError('Reminder message is too long', {
        userMessage: `Reminder messages can be at most ${REMINDER_LIMITS.maxMessageLength} characters.`,
      });
    }

    if (parsed.triggerAt.getTime() <= now.getTime()) {
      throw new ValidationError('Reminder time is in the past', {
        userMessage: 'That time is in the past. Please pick a future time.',
      });
    }
    const horizon = now.getTime() + REMINDER_LIMITS.maxHorizonDays * 86_400_000;
    if (parsed.triggerAt.getTime() > horizon) {
      throw new ValidationError('Reminder time is too far away', {
        userMessage: 'Reminders can be set at most one year ahead.',
      });
    }

    if ((await this.repo.countActiveByUser(input.userId)) >= REMINDER_LIMITS.maxActivePerUser) {
      throw new BusinessLogicError('Too many active reminders', {
        userMessage: `You already have ${REMINDER_LIMITS.maxActivePerUser} active reminders. Cancel one first.`,
      });
    }

    return this.repo.create({
      userId: input.userId,
      guildId: input.guildId,
      channelId: input.channelId,
      message,
      triggerAt: parsed.triggerAt,
      repeatInterval: input.repeat ?? 'NONE',
    });
  }

  list(userId: string): Promise<Reminder[]> {
    return this.repo.listActiveByUser(userId);
  }

  /**
   * Cancels one of the user's active reminders by full id or by the short id shown in lists
   * (any unique prefix of at least 4 characters).
   */
  async cancel(userId: string, idOrPrefix: string): Promise<Reminder> {
    const needle = idOrPrefix.trim().toLowerCase();
    if (needle.length < 4) {
      throw new ValidationError('Reminder id too short', {
        userMessage: 'Please give the reminder id shown in `/reminder action:list`.',
      });
    }

    const matches = (await this.repo.listActiveByUser(userId)).filter((r) =>
      r.id.toLowerCase().startsWith(needle),
    );
    if (matches.length === 0) {
      throw new ValidationError(`No reminder ${needle}`, {
        userMessage: `You have no active reminder with id \`${needle}\`.`,
      });
    }
    if (matches.length > 1) {
      throw new ValidationError(`Ambiguous reminder id ${needle}`, {
        userMessage: `More than one reminder starts with \`${needle}\`. Please use more characters.`,
      });
    }

    await this.repo.deleteForUser(matches[0]!.id, userId);
    return matches[0]!;
  }
}

/** Short id shown to users; {@link ReminderService.cancel} accepts it. */
export function shortReminderId(id: string): string {
  return id.slice(0, 8);
}
