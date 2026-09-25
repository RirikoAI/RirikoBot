import { describe, expect, it } from 'vitest';
import { axisTicks, formatDay } from './chart-format';

describe('chart-format (TASK-1131)', () => {
  it('picks clean ticks that reach the maximum', () => {
    expect(axisTicks(0)).toEqual([0]);
    expect(axisTicks(1)).toEqual([0, 1]);
    expect(axisTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(axisTicks(40)).toEqual([0, 10, 20, 30, 40]);
    expect(axisTicks(1234)).toEqual([0, 500, 1000, 1500]);
  });

  it('formats UTC days', () => {
    expect(formatDay('2026-09-26')).toBe('Sep 26');
  });
});
