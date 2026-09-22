import * as chrono from 'chrono-node';

export type ReminderRepeat = 'NONE' | 'DAILY' | 'WEEKLY';

const DAY_MS = 86_400_000;

/** True for IANA zone names the runtime knows, e.g. `Asia/Kuala_Lumpur`. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Canonical IANA name for user input, matched case-insensitively (`asia/tokyo` → `Asia/Tokyo`).
 * Offsets and abbreviations are rejected so stored zones always follow DST rules.
 */
export function canonicalTimeZone(input: string): string | null {
  const wanted = input.trim().replace(/\s+/g, '_').toLowerCase();
  if (!wanted) return null;
  if (wanted === 'utc' || wanted === 'etc/utc') return 'UTC';
  return Intl.supportedValuesOf('timeZone').find((zone) => zone.toLowerCase() === wanted) ?? null;
}

/** First valid zone among the candidates (user, then guild), else UTC. */
export function resolveTimeZone(...candidates: Array<string | null | undefined>): string {
  return candidates.find((tz): tz is string => typeof tz === 'string' && isValidTimeZone(tz)) ?? 'UTC';
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
export function parseReminderTime(text: string, now: Date, timeZone: string): ParsedReminderTime | null {
  const [result] = chrono.parse(text, { instant: now, timezone: timeZone }, { forwardDate: true });
  if (!result) return null;

  const remainder = `${text.slice(0, result.index)} ${text.slice(result.index + result.text.length)}`
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
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
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
