import { describe, expect, it } from 'vitest';
import { CurveChart, type CurveChartPoint } from '@/app/owner/dungeon/curve-chart';
import { elements, render, textOf } from '../../../../tests/support/markup';
import { UsageChart } from './usage-chart';

describe('UsageChart', () => {
  const days = [
    { day: '2026-09-28', count: 0 },
    { day: '2026-09-29', count: 12 },
    { day: '2026-09-30', count: 1200 },
    { day: '2026-10-01', count: 40 },
    { day: '2026-10-02', count: 0 },
  ];

  it('draws a column only for days with commands and describes every day for assistive tech', () => {
    const html = render(<UsageChart days={days} />);
    expect(elements(html, 'path')).toHaveLength(3);
    const labels = elements(html, 'rect').map((rect) => rect['aria-label']);
    expect(labels).toEqual([
      'Sep 28: 0 commands',
      'Sep 29: 12 commands',
      'Sep 30: 1,200 commands',
      'Oct 1: 40 commands',
      'Oct 2: 0 commands',
    ]);
  });

  it('labels the axis with clean ticks and the first, middle and last day', () => {
    const text = textOf(render(<UsageChart days={days} />));
    expect(text).toContain('Sep 28');
    expect(text).toContain('Sep 30');
    expect(text).toContain('Oct 2');
    expect(text).not.toContain('Sep 29');
    expect(text).toMatch(/\b0\b.*\b1,500\b/);
  });

  it('copes with a window without any command', () => {
    const html = render(<UsageChart days={[{ day: '2026-10-01', count: 0 }]} />);
    expect(elements(html, 'path')).toHaveLength(0);
    expect(elements(html, 'rect')[0]!['aria-label']).toBe('Oct 1: 0 commands');
  });
});

describe('CurveChart', () => {
  const points: CurveChartPoint[] = Array.from({ length: 20 }, (_, index) => {
    const floor = index + 1;
    const type = floor % 10 === 0 ? 'MAJOR_BOSS' : floor % 5 === 0 ? 'MINI_BOSS' : 'STANDARD';
    return {
      floor,
      type,
      hp: 1000 + floor * 250,
      attack: 50 + floor,
      defense: 30 + floor,
      speed: 20,
    };
  });

  it('describes every floor with its stats, naming boss floors', () => {
    const html = render(<CurveChart points={points} />);
    const labels = elements(html, 'rect').map((rect) => rect['aria-label']);
    expect(labels).toHaveLength(20);
    expect(labels[0]).toBe('Floor 1: 1,250 HP, 51 ATK, 31 DEF, 20 SPD');
    expect(labels[4]).toMatch(/^Mini-boss 5: /);
    expect(labels[9]).toMatch(/^Major boss 10: /);
  });

  it('marks boss floors with rings for mini-bosses and dots for major bosses', () => {
    const html = render(<CurveChart points={points} />);
    // Four boss floors (5, 10, 15, 20) plus the two legend markers.
    const markers = elements(html, 'circle');
    expect(markers).toHaveLength(4 + 2);
    expect(markers.filter((c) => c['r'] === '5')).toHaveLength(2);
    expect(markers.filter((c) => c['r'] === '4')).toHaveLength(2);
  });

  it('labels floor 1 and every tenth floor, and explains the markers', () => {
    const text = textOf(render(<CurveChart points={points} />));
    expect(text).toContain('F1');
    expect(text).toContain('F10');
    expect(text).toContain('F20');
    expect(text).not.toContain('F5 ');
    expect(text).toContain('Mini-boss (every 5th floor)');
    expect(text).toContain('Major boss (every 10th floor)');
  });
});
