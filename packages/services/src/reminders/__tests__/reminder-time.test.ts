import { describe, it, expect } from 'vitest';
import {
  addDaysInTimeZone,
  canonicalTimeZone,
  isValidTimeZone,
  nextOccurrence,
  parseReminderTime,
  resolveTimeZone,
} from '../reminder-time.js';

// Tuesday 2026-09-22 12:00 UTC = 20:00 in Kuala Lumpur (UTC+8).
const NOW = new Date('2026-09-22T12:00:00Z');
const KL = 'Asia/Kuala_Lumpur';

describe('timezones', () => {
  it('validates IANA zones and resolves user, then guild, then UTC', () => {
    expect(isValidTimeZone(KL)).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(resolveTimeZone(undefined, 'Nope/Zone', 'Europe/London')).toBe('Europe/London');
    expect(resolveTimeZone(null, undefined)).toBe('UTC');
  });

  it('canonicalises user input to IANA names and rejects offsets', () => {
    expect(canonicalTimeZone(' asia/kuala lumpur ')).toBe(KL);
    expect(canonicalTimeZone('utc')).toBe('UTC');
    expect(canonicalTimeZone('+08:00')).toBeNull();
    expect(canonicalTimeZone('GMT+8')).toBeNull();
    expect(canonicalTimeZone('Atlantis/Lost')).toBeNull();
  });
});

describe('parseReminderTime', () => {
  it.each([
    ['30m', '2026-09-22T12:30:00.000Z'],
    ['1h', '2026-09-22T13:00:00.000Z'],
    ['2d', '2026-09-24T12:00:00.000Z'],
    ['in 2 hours', '2026-09-22T14:00:00.000Z'],
    ['tomorrow 9am', '2026-09-23T01:00:00.000Z'],
    ['2026-12-25 08:00', '2026-12-25T00:00:00.000Z'],
  ])('reads %s in the user timezone', (text, iso) => {
    expect(parseReminderTime(text, NOW, KL)?.triggerAt.toISOString()).toBe(iso);
  });

  it('reads wall-clock times in the given zone', () => {
    expect(parseReminderTime('tomorrow 9am', NOW, 'UTC')?.triggerAt.toISOString()).toBe(
      '2026-09-23T09:00:00.000Z',
    );
  });

  it('uses the offset of the target date across a DST change', () => {
    // London is on BST (UTC+1) on 2026-09-22 and on GMT (UTC+0) at Christmas.
    const london = 'Europe/London';
    expect(parseReminderTime('tomorrow 9am', NOW, london)?.triggerAt.toISOString()).toBe(
      '2026-09-23T08:00:00.000Z',
    );
    expect(parseReminderTime('2026-12-25 08:00', NOW, london)?.triggerAt.toISOString()).toBe(
      '2026-12-25T08:00:00.000Z',
    );
  });

  it('keeps an explicit timezone written in the text', () => {
    expect(parseReminderTime('tomorrow 9am UTC', NOW, KL)?.triggerAt.toISOString()).toBe(
      '2026-09-23T09:00:00.000Z',
    );
  });

  it('splits the time phrase from the message wherever it appears', () => {
    expect(parseReminderTime('call mom tomorrow at 6pm', NOW, KL)).toMatchObject({
      timeText: 'tomorrow at 6pm',
      remainder: 'call mom',
    });
    expect(parseReminderTime('in 10 minutes to stretch', NOW, KL)?.remainder).toBe('stretch');
    expect(parseReminderTime('1h Take a break', NOW, KL)?.remainder).toBe('Take a break');
  });

  it('returns null when there is no time in the text', () => {
    expect(parseReminderTime('buy milk', NOW, KL)).toBeNull();
  });
});

describe('repeats', () => {
  const NY = 'America/New_York';

  it('keeps the wall-clock time across a DST change', () => {
    // 2026-11-01 is the US fall-back day: 09:00 EDT (13:00Z) the day before → 09:00 EST (14:00Z).
    const saturday9am = new Date('2026-10-31T13:00:00Z');
    expect(addDaysInTimeZone(saturday9am, 1, NY).toISOString()).toBe('2026-11-01T14:00:00.000Z');
    expect(addDaysInTimeZone(saturday9am, 1, 'UTC').toISOString()).toBe('2026-11-01T13:00:00.000Z');
  });

  it('returns the next daily or weekly slot after now and skips missed ones', () => {
    const trigger = new Date('2026-09-22T01:00:00Z');
    expect(nextOccurrence(trigger, 'NONE', KL, NOW)).toBeNull();
    expect(nextOccurrence(trigger, 'DAILY', KL, NOW)?.toISOString()).toBe(
      '2026-09-23T01:00:00.000Z',
    );
    expect(nextOccurrence(trigger, 'WEEKLY', KL, NOW)?.toISOString()).toBe(
      '2026-09-29T01:00:00.000Z',
    );

    // Bot was offline for five days: resume at the next slot, do not replay.
    const later = new Date('2026-09-27T12:00:00Z');
    expect(nextOccurrence(trigger, 'DAILY', KL, later)?.toISOString()).toBe(
      '2026-09-28T01:00:00.000Z',
    );
  });
});
