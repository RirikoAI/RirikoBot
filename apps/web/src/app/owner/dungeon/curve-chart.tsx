'use client';

import { useState } from 'react';
import { axisTicks, numberFormat } from '@/lib/chart-format';

/** One floor of the season curve, as computed on the server by the bot's ScalingEngine. */
export interface CurveChartPoint {
  floor: number;
  type: 'STANDARD' | 'MINI_BOSS' | 'MAJOR_BOSS';
  hp: number;
  attack: number;
  defense: number;
  speed: number;
}

const WIDTH = 640;
const HEIGHT = 220;
const PLOT_LEFT = 48;
const PLOT_RIGHT = WIDTH - 8;
const PLOT_TOP = 12;
const PLOT_BOTTOM = HEIGHT - 24;

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

const TYPE_LABELS: Record<CurveChartPoint['type'], string> = {
  STANDARD: 'Floor',
  MINI_BOSS: 'Mini-boss',
  MAJOR_BOSS: 'Major boss',
};

/**
 * Enemy HP by floor. ATK and DEF grow by the same factor, so one line shows the curve's shape
 * and the tooltip gives every stat. Boss floors are marked: rings for mini-bosses, dots for
 * major bosses.
 */
export function CurveChart({ points }: { points: CurveChartPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const ticks = axisTicks(Math.max(...points.map((p) => p.hp)));
  const top = ticks.at(-1) || 1;
  const slot = (PLOT_RIGHT - PLOT_LEFT) / points.length;
  const x = (index: number) => PLOT_LEFT + (index + 0.5) * slot;
  const y = (value: number) => PLOT_BOTTOM - (value / top) * (PLOT_BOTTOM - PLOT_TOP);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.hp)}`).join('');
  const labelled = points.filter((p) => p.floor === 1 || p.floor % 10 === 0);
  const activePoint = active === null ? null : points[active];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="group"
        aria-label="Enemy HP by floor"
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PLOT_LEFT}
              x2={PLOT_RIGHT}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-edge"
              strokeWidth={1}
            />
            <text
              x={PLOT_LEFT - 8}
              y={y(tick)}
              dy="0.32em"
              textAnchor="end"
              className="fill-zinc-400 text-[11px] tabular-nums"
            >
              {compact.format(tick)}
            </text>
          </g>
        ))}
        {labelled.map((p) => (
          <text
            key={p.floor}
            x={x(p.floor - 1)}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="fill-zinc-400 text-[11px] tabular-nums"
          >
            F{p.floor}
          </text>
        ))}
        {activePoint && active !== null ? (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={PLOT_TOP}
            y2={PLOT_BOTTOM}
            className="stroke-zinc-500"
            strokeWidth={1}
          />
        ) : null}
        <path
          d={line}
          fill="none"
          className="stroke-sakura"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {points.map((p, i) =>
          p.type === 'STANDARD' ? null : (
            <circle
              key={p.floor}
              cx={x(i)}
              cy={y(p.hp)}
              r={p.type === 'MAJOR_BOSS' ? 5 : 4}
              strokeWidth={2}
              className={
                p.type === 'MAJOR_BOSS' ? 'fill-sakura stroke-ink' : 'fill-ink stroke-sakura'
              }
            />
          ),
        )}
        {points.map((p, i) => (
          // The whole floor slot is the hit target, not only the line.
          <rect
            key={p.floor}
            x={PLOT_LEFT + i * slot}
            y={PLOT_TOP}
            width={slot}
            height={PLOT_BOTTOM - PLOT_TOP}
            fill="transparent"
            tabIndex={0}
            role="img"
            aria-label={`${TYPE_LABELS[p.type]} ${p.floor}: ${numberFormat.format(p.hp)} HP, ${numberFormat.format(p.attack)} ATK, ${numberFormat.format(p.defense)} DEF, ${numberFormat.format(p.speed)} SPD`}
            className="outline-none focus-visible:stroke-sakura"
            onPointerEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          />
        ))}
      </svg>
      {activePoint && active !== null ? (
        <div
          role="presentation"
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-edge bg-ink px-2 py-1 text-xs whitespace-nowrap shadow-lg"
          // Set after hydration through the CSSOM, which the CSP allows (unlike server-rendered styles).
          style={{ left: `${Math.min(85, Math.max(15, (x(active) / WIDTH) * 100))}%` }}
        >
          <p className="font-semibold text-zinc-100">
            {TYPE_LABELS[activePoint.type]} {activePoint.floor}
          </p>
          <p className="text-zinc-400 tabular-nums">
            {numberFormat.format(activePoint.hp)} HP · {numberFormat.format(activePoint.attack)} ATK
            · {numberFormat.format(activePoint.defense)} DEF ·{' '}
            {numberFormat.format(activePoint.speed)} SPD
          </p>
        </div>
      ) : null}
      <p className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden="true">
            <circle cx="5" cy="5" r="3.5" strokeWidth={2} className="fill-ink stroke-sakura" />
          </svg>
          Mini-boss (every 5th floor)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden="true">
            <circle cx="5" cy="5" r="4.5" className="fill-sakura" />
          </svg>
          Major boss (every 10th floor)
        </span>
      </p>
    </div>
  );
}
