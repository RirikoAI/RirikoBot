/**
 * Shared calendar-day reset boundary used by every daily system (energy replenishment,
 * energy potion ceilings, shop rotations, shop purchase limits and the daily reward).
 *
 * A "reset day" is the span between two consecutive reset boundaries. The boundary is a
 * wall-clock time (`resetHour`:`resetMinute`) inside a fixed UTC offset, so a schedule of
 * `{ offsetMinutes: 480, resetHour: 0, resetMinute: 0 }` means midnight GMT+8, which lands
 * at 16:00 UTC on the previous calendar date.
 *
 * Days are identified by an integer index rather than a date string so that adjacency
 * ("did the player claim yesterday?") is plain arithmetic and stays correct across month
 * and year boundaries.
 */

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** Minutes ahead of UTC for the reset timezone. GMT+8 is the project default. */
export const DEFAULT_RESET_OFFSET_MINUTES = 480;

/** Widest real-world UTC offsets in use (UTC-12:00 through UTC+14:00). */
export const MIN_RESET_OFFSET_MINUTES = -720;
export const MAX_RESET_OFFSET_MINUTES = 840;

export interface ResetSchedule {
  /** Minutes ahead of UTC, e.g. 480 for GMT+8. */
  offsetMinutes: number;
  /** Hour of the reset boundary in the offset timezone (0-23). */
  resetHour: number;
  /** Minute of the reset boundary in the offset timezone (0-59). */
  resetMinute: number;
}

/** Midnight GMT+8: the default boundary for every daily system. */
export const DEFAULT_RESET_SCHEDULE: ResetSchedule = {
  offsetMinutes: DEFAULT_RESET_OFFSET_MINUTES,
  resetHour: 0,
  resetMinute: 0,
};

export class ResetScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResetScheduleError';
  }
}

function assertValidSchedule(schedule: ResetSchedule): void {
  const { offsetMinutes, resetHour, resetMinute } = schedule;

  if (!Number.isInteger(offsetMinutes)) {
    throw new ResetScheduleError(`offsetMinutes must be an integer, received ${offsetMinutes}`);
  }
  if (offsetMinutes < MIN_RESET_OFFSET_MINUTES || offsetMinutes > MAX_RESET_OFFSET_MINUTES) {
    throw new ResetScheduleError(
      `offsetMinutes must be between ${MIN_RESET_OFFSET_MINUTES} and ${MAX_RESET_OFFSET_MINUTES}, received ${offsetMinutes}`,
    );
  }
  if (!Number.isInteger(resetHour) || resetHour < 0 || resetHour > 23) {
    throw new ResetScheduleError(
      `resetHour must be an integer between 0 and 23, received ${resetHour}`,
    );
  }
  if (!Number.isInteger(resetMinute) || resetMinute < 0 || resetMinute > 59) {
    throw new ResetScheduleError(
      `resetMinute must be an integer between 0 and 59, received ${resetMinute}`,
    );
  }
}

/**
 * Parses an `HH:MM` clock time into hour and minute components.
 * Throws {@link ResetScheduleError} on malformed input so misconfiguration fails at startup
 * rather than silently shifting every reset in the bot.
 */
export function parseResetTime(value: string): { resetHour: number; resetMinute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new ResetScheduleError(`Reset time must be in HH:MM format, received "${value}"`);
  }

  const resetHour = Number(match[1]);
  const resetMinute = Number(match[2]);

  if (resetHour > 23 || resetMinute > 59) {
    throw new ResetScheduleError(`Reset time "${value}" is not a valid 24-hour clock time`);
  }

  return { resetHour, resetMinute };
}

/**
 * Builds a {@link ResetSchedule} from an offset and an optional `HH:MM` clock time.
 * Omitting `time` falls back to midnight in the given offset.
 */
export function createResetSchedule(
  offsetMinutes: number = DEFAULT_RESET_OFFSET_MINUTES,
  time?: string | undefined,
): ResetSchedule {
  const { resetHour, resetMinute } = time ? parseResetTime(time) : { resetHour: 0, resetMinute: 0 };
  const schedule: ResetSchedule = { offsetMinutes, resetHour, resetMinute };
  assertValidSchedule(schedule);
  return schedule;
}

/**
 * Returns the integer index of the reset day containing `now`.
 *
 * Shifting by the timezone offset and then back by the boundary time makes the boundary fall
 * exactly on a UTC midnight, so flooring by whole days yields a day index that increments
 * once per reset. Two timestamps share a reset day when their indices are equal; a player
 * claimed "yesterday" when the difference is exactly 1.
 */
export function getResetDayIndex(now: Date, schedule: ResetSchedule): number {
  assertValidSchedule(schedule);
  const boundaryOffsetMs =
    (schedule.offsetMinutes - schedule.resetHour * 60 - schedule.resetMinute) * MS_PER_MINUTE;
  return Math.floor((now.getTime() + boundaryOffsetMs) / MS_PER_DAY);
}

/**
 * Returns the `YYYY-MM-DD` key of the reset day containing `now`, for storage and display.
 * Derived from {@link getResetDayIndex}, so the key changes at the configured boundary
 * rather than at UTC midnight.
 */
export function getResetDayKey(now: Date, schedule: ResetSchedule): string {
  const dayIndex = getResetDayIndex(now, schedule);
  return new Date(dayIndex * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Returns the instant at which the current reset day ends and the next one begins. */
export function getNextResetAt(now: Date, schedule: ResetSchedule): Date {
  const dayIndex = getResetDayIndex(now, schedule);
  const boundaryOffsetMs =
    (schedule.offsetMinutes - schedule.resetHour * 60 - schedule.resetMinute) * MS_PER_MINUTE;
  return new Date((dayIndex + 1) * MS_PER_DAY - boundaryOffsetMs);
}

/** Milliseconds remaining until the next reset boundary. */
export function getTimeUntilResetMs(now: Date, schedule: ResetSchedule): number {
  return getNextResetAt(now, schedule).getTime() - now.getTime();
}
