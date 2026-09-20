import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RESET_SCHEDULE,
  ResetScheduleError,
  createResetSchedule,
  getNextResetAt,
  getResetDayIndex,
  getResetDayKey,
  getTimeUntilResetMs,
  parseResetTime,
  type ResetSchedule,
} from './reset-schedule.js';

/** Midnight GMT+8 — the project default. Boundary lands at 16:00 UTC the previous date. */
const MIDNIGHT_GMT8 = DEFAULT_RESET_SCHEDULE;
/** 05:00 GMT+8 — boundary lands at 21:00 UTC the previous date. */
const FIVE_AM_GMT8: ResetSchedule = { offsetMinutes: 480, resetHour: 5, resetMinute: 0 };
/** Midnight UTC — the pre-STORY-161 behaviour, kept as a regression anchor. */
const MIDNIGHT_UTC: ResetSchedule = { offsetMinutes: 0, resetHour: 0, resetMinute: 0 };

describe('parseResetTime', () => {
  it('parses zero-padded and non-padded hours', () => {
    expect(parseResetTime('00:00')).toEqual({ resetHour: 0, resetMinute: 0 });
    expect(parseResetTime('5:30')).toEqual({ resetHour: 5, resetMinute: 30 });
    expect(parseResetTime('23:59')).toEqual({ resetHour: 23, resetMinute: 59 });
  });

  it('tolerates surrounding whitespace from .env files', () => {
    expect(parseResetTime('  06:15 ')).toEqual({ resetHour: 6, resetMinute: 15 });
  });

  it('rejects malformed and out-of-range clock times', () => {
    expect(() => parseResetTime('24:00')).toThrow(ResetScheduleError);
    expect(() => parseResetTime('12:60')).toThrow(ResetScheduleError);
    expect(() => parseResetTime('noon')).toThrow(ResetScheduleError);
    expect(() => parseResetTime('12')).toThrow(ResetScheduleError);
    expect(() => parseResetTime('12:5')).toThrow(ResetScheduleError);
  });
});

describe('createResetSchedule', () => {
  it('defaults to midnight GMT+8', () => {
    expect(createResetSchedule()).toEqual({ offsetMinutes: 480, resetHour: 0, resetMinute: 0 });
  });

  it('applies a custom clock time', () => {
    expect(createResetSchedule(480, '05:00')).toEqual({
      offsetMinutes: 480,
      resetHour: 5,
      resetMinute: 0,
    });
  });

  it('rejects offsets beyond real-world UTC bounds', () => {
    expect(() => createResetSchedule(-721)).toThrow(ResetScheduleError);
    expect(() => createResetSchedule(841)).toThrow(ResetScheduleError);
    expect(() => createResetSchedule(1.5)).toThrow(ResetScheduleError);
  });

  it('accepts the extremes of the real-world offset range', () => {
    expect(() => createResetSchedule(-720)).not.toThrow();
    expect(() => createResetSchedule(840)).not.toThrow();
  });
});

describe('getResetDayIndex — boundary placement', () => {
  it('flips at 16:00 UTC for midnight GMT+8', () => {
    const before = getResetDayIndex(new Date('2026-09-20T15:59:59.999Z'), MIDNIGHT_GMT8);
    const after = getResetDayIndex(new Date('2026-09-20T16:00:00.000Z'), MIDNIGHT_GMT8);
    expect(after).toBe(before + 1);
  });

  it('does not flip at UTC midnight for midnight GMT+8', () => {
    const beforeUtcMidnight = getResetDayIndex(new Date('2026-09-20T23:59:59.999Z'), MIDNIGHT_GMT8);
    const afterUtcMidnight = getResetDayIndex(new Date('2026-09-21T00:00:00.000Z'), MIDNIGHT_GMT8);
    expect(afterUtcMidnight).toBe(beforeUtcMidnight);
  });

  it('flips at 21:00 UTC for 05:00 GMT+8', () => {
    const before = getResetDayIndex(new Date('2026-09-20T20:59:59.999Z'), FIVE_AM_GMT8);
    const after = getResetDayIndex(new Date('2026-09-20T21:00:00.000Z'), FIVE_AM_GMT8);
    expect(after).toBe(before + 1);
  });

  it('flips at UTC midnight for the midnight-UTC schedule', () => {
    const before = getResetDayIndex(new Date('2026-09-20T23:59:59.999Z'), MIDNIGHT_UTC);
    const after = getResetDayIndex(new Date('2026-09-21T00:00:00.000Z'), MIDNIGHT_UTC);
    expect(after).toBe(before + 1);
  });

  it('handles negative offsets', () => {
    const utcMinus5: ResetSchedule = { offsetMinutes: -300, resetHour: 0, resetMinute: 0 };
    const before = getResetDayIndex(new Date('2026-09-21T04:59:59.999Z'), utcMinus5);
    const after = getResetDayIndex(new Date('2026-09-21T05:00:00.000Z'), utcMinus5);
    expect(after).toBe(before + 1);
  });

  it('advances exactly once per 24 hours', () => {
    const day0 = getResetDayIndex(new Date('2026-09-20T18:00:00.000Z'), MIDNIGHT_GMT8);
    const day1 = getResetDayIndex(new Date('2026-09-21T18:00:00.000Z'), MIDNIGHT_GMT8);
    const day7 = getResetDayIndex(new Date('2026-09-27T18:00:00.000Z'), MIDNIGHT_GMT8);
    expect(day1 - day0).toBe(1);
    expect(day7 - day0).toBe(7);
  });

  it('stays correct across month and year boundaries', () => {
    const jan31 = getResetDayIndex(new Date('2026-01-31T18:00:00.000Z'), MIDNIGHT_GMT8);
    const feb01 = getResetDayIndex(new Date('2026-02-01T18:00:00.000Z'), MIDNIGHT_GMT8);
    expect(feb01 - jan31).toBe(1);

    const dec31 = getResetDayIndex(new Date('2026-12-31T18:00:00.000Z'), MIDNIGHT_GMT8);
    const jan01 = getResetDayIndex(new Date('2027-01-01T18:00:00.000Z'), MIDNIGHT_GMT8);
    expect(jan01 - dec31).toBe(1);
  });

  it('treats a whole GMT+8 day as one index', () => {
    // 2026-09-21 00:00 GMT+8 through 23:59 GMT+8 = 2026-09-20T16:00Z .. 2026-09-21T15:59Z
    const dayStart = getResetDayIndex(new Date('2026-09-20T16:00:00.000Z'), MIDNIGHT_GMT8);
    const midday = getResetDayIndex(new Date('2026-09-21T04:00:00.000Z'), MIDNIGHT_GMT8);
    const dayEnd = getResetDayIndex(new Date('2026-09-21T15:59:59.999Z'), MIDNIGHT_GMT8);
    expect(midday).toBe(dayStart);
    expect(dayEnd).toBe(dayStart);
  });
});

describe('getResetDayKey', () => {
  it('names the GMT+8 calendar date, not the UTC one', () => {
    // 2026-09-20T16:00Z is already 2026-09-21 in GMT+8.
    expect(getResetDayKey(new Date('2026-09-20T16:00:00.000Z'), MIDNIGHT_GMT8)).toBe('2026-09-21');
    expect(getResetDayKey(new Date('2026-09-20T15:59:59.999Z'), MIDNIGHT_GMT8)).toBe('2026-09-20');
  });

  it('matches the UTC date under the midnight-UTC schedule', () => {
    expect(getResetDayKey(new Date('2026-09-20T23:59:59.999Z'), MIDNIGHT_UTC)).toBe('2026-09-20');
  });

  it('is stable for every instant inside one reset day', () => {
    const early = getResetDayKey(new Date('2026-09-20T16:00:00.000Z'), MIDNIGHT_GMT8);
    const late = getResetDayKey(new Date('2026-09-21T15:59:59.999Z'), MIDNIGHT_GMT8);
    expect(early).toBe(late);
  });
});

describe('getNextResetAt / getTimeUntilResetMs', () => {
  it('returns the upcoming 16:00 UTC boundary for midnight GMT+8', () => {
    const next = getNextResetAt(new Date('2026-09-20T10:00:00.000Z'), MIDNIGHT_GMT8);
    expect(next.toISOString()).toBe('2026-09-20T16:00:00.000Z');
  });

  it('rolls to the following day when the boundary has just passed', () => {
    const next = getNextResetAt(new Date('2026-09-20T16:00:00.000Z'), MIDNIGHT_GMT8);
    expect(next.toISOString()).toBe('2026-09-21T16:00:00.000Z');
  });

  it('honours a non-midnight reset time', () => {
    const next = getNextResetAt(new Date('2026-09-20T10:00:00.000Z'), FIVE_AM_GMT8);
    expect(next.toISOString()).toBe('2026-09-20T21:00:00.000Z');
  });

  it('counts down to the boundary', () => {
    const now = new Date('2026-09-20T15:00:00.000Z');
    expect(getTimeUntilResetMs(now, MIDNIGHT_GMT8)).toBe(3_600_000);
  });

  it('always reports a positive remaining duration', () => {
    const justAfterBoundary = new Date('2026-09-20T16:00:00.001Z');
    expect(getTimeUntilResetMs(justAfterBoundary, MIDNIGHT_GMT8)).toBeGreaterThan(0);
  });
});

describe('per-feature independence', () => {
  it('lets two features sharing a timezone flip at different instants', () => {
    // 2026-09-20T18:00Z is past midnight GMT+8 (16:00Z) but before 05:00 GMT+8 (21:00Z).
    const instant = new Date('2026-09-20T18:00:00.000Z');
    const earlier = new Date('2026-09-20T15:00:00.000Z');

    expect(getResetDayIndex(instant, MIDNIGHT_GMT8)).toBe(
      getResetDayIndex(earlier, MIDNIGHT_GMT8) + 1,
    );
    expect(getResetDayIndex(instant, FIVE_AM_GMT8)).toBe(getResetDayIndex(earlier, FIVE_AM_GMT8));
  });
});
