import * as chrono from 'chrono-node';
import { isValidTimeZone } from '@ririko/core';

// Shared with guild settings validation; re-exported for existing importers.
export { canonicalTimeZone, isValidTimeZone } from '@ririko/core';

export type ReminderRepeat = 'NONE' | 'DAILY' | 'WEEKLY';

const DAY_MS = 86_400_000;

/** First valid zone among the candidates (user, then guild), else UTC. */
export function resolveTimeZone(...candidates: Array<string | null | undefined>): string {
  return (
    candidates.find((tz): tz is string => typeof tz === 'string' && isValidTimeZone(tz)) ?? 'UTC'
  );
}

/** Formats a Date in the given timeZone with full date and short time. */
export function formatLocalTime(timeZone: string, now = new Date()): string {
  const safeTz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: safeTz,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(now);
}

export interface ParsedReminderTime {
  triggerAt: Date;
  /** The words chrono read as the time, e.g. `tomorrow 9am`. */
  timeText: string;
  /** The input with the time words removed, e.g. the reminder message. */
  remainder: string;
}

/**
 * Finds the first date/time expression in `text`, reading wall-clock times in `timeZone`.
 * Accepts natural language ("tomorrow 9am", "in 2 hours", "next friday at 8pm"), the 1.4.0
 * shorthand ("30m", "1h", "2d") and ISO-like dates ("2026-12-25 08:00"). Ambiguous dates resolve
 * forward ("friday" means the coming Friday).
 */
export function parseReminderTime(
  text: string,
  now: Date,
  timeZone: string,
): ParsedReminderTime | null {
  // chrono reads `timezone` only as an abbreviation ("JST") or offset minutes; an IANA name
  // silently falls back to the host's zone. Pass the zone's offset at `now`, then re-parse with
  // the offset on the target date when a DST change lies in between.
  const safeTz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const parseWithOffset = (offsetMinutes: number) =>
    chrono.parse(text, { instant: now, timezone: offsetMinutes }, { forwardDate: true })[0];

  const nowOffset = zoneOffsetMs(now, safeTz) / 60_000;
  let result = parseWithOffset(nowOffset);
  if (!result) return null;
  if (!result.start.isCertain('timezoneOffset')) {
    const targetOffset = zoneOffsetMs(result.date(), safeTz) / 60_000;
    if (targetOffset !== nowOffset) result = parseWithOffset(targetOffset) ?? result;
  }

  const remainder =
    `${text.slice(0, result.index)} ${text.slice(result.index + result.text.length)}`
      .replace(/\s+/g, ' ')
      .trim()
      // "remind me in 10 minutes to stretch" → "stretch"
      .replace(/^(to|that|about)\s+/i, '');
  return { triggerAt: result.date(), timeText: result.text, remainder };
}

/** Offset of `timeZone` from UTC at `date`, in milliseconds. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Adds whole days while keeping the same wall-clock time in `timeZone` across DST changes. */
export function addDaysInTimeZone(date: Date, days: number, timeZone: string): Date {
  const naive = new Date(date.getTime() + days * DAY_MS);
  const shift = zoneOffsetMs(date, timeZone) - zoneOffsetMs(naive, timeZone);
  return new Date(naive.getTime() + shift);
}

/**
 * Next occurrence of a repeating reminder strictly after `now`. Missed occurrences (bot offline)
 * are skipped, not replayed. Returns null for one-off reminders.
 */
export function nextOccurrence(
  triggerAt: Date,
  repeat: ReminderRepeat,
  timeZone: string,
  now: Date,
): Date | null {
  const stepDays = repeat === 'DAILY' ? 1 : repeat === 'WEEKLY' ? 7 : 0;
  if (stepDays === 0) return null;

  let steps = 1;
  const behindMs = now.getTime() - triggerAt.getTime();
  if (behindMs > 0) steps = Math.max(1, Math.floor(behindMs / (stepDays * DAY_MS)));

  let next = addDaysInTimeZone(triggerAt, steps * stepDays, timeZone);
  while (next.getTime() <= now.getTime()) {
    steps += 1;
    next = addDaysInTimeZone(triggerAt, steps * stepDays, timeZone);
  }
  return next;
}
