'use client';

import { useState } from 'react';
import { axisTicks, formatDay, numberFormat } from '@/lib/chart-format';

export interface DailyCount {
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  count: number;
}

const WIDTH = 640;
const HEIGHT = 200;
const PLOT_LEFT = 40;
const PLOT_TOP = 12;
const PLOT_BOTTOM = HEIGHT - 24;
const MAX_BAR_WIDTH = 24;
const BAR_GAP = 2;
const RADIUS = 4;

/** Column path with a rounded data end and a square baseline. */
function barPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(RADIUS, width / 2, height);
  const bottom = y + height;
  return `M${x},${bottom}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${bottom}Z`;
}

/** Commands per UTC day as columns, with a tooltip on hover and keyboard focus. */
export function UsageChart({ days }: { days: DailyCount[] }) {
  const [active, setActive] = useState<number | null>(null);
  const ticks = axisTicks(Math.max(...days.map((d) => d.count)));
  const top = ticks.at(-1) || 1;
  const plotWidth = WIDTH - PLOT_LEFT;
  const slot = plotWidth / days.length;
  const barWidth = Math.min(MAX_BAR_WIDTH, slot - BAR_GAP);
  const y = (value: number) => PLOT_BOTTOM - (value / top) * (PLOT_BOTTOM - PLOT_TOP);
  const labelled = new Set([0, Math.floor((days.length - 1) / 2), days.length - 1]);
  const activeDay = active === null ? null : days[active];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="group"
        aria-label="Commands run per day"
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PLOT_LEFT}
              x2={WIDTH}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--color-edge)"
              strokeWidth={1}
            />
            <text
              x={PLOT_LEFT - 8}
              y={y(tick)}
              dy="0.32em"
              textAnchor="end"
              className="fill-zinc-400 text-[11px] tabular-nums"
            >
              {numberFormat.format(tick)}
            </text>
          </g>
        ))}
        {days.map((entry, index) => {
          const x = PLOT_LEFT + index * slot + (slot - barWidth) / 2;
          const height = PLOT_BOTTOM - y(entry.count);
          return (
            <g key={entry.day}>
              {entry.count > 0 ? (
                <path
                  d={barPath(x, y(entry.count), barWidth, height)}
                  fill={active === index ? 'var(--color-sakura)' : 'var(--color-sakura-strong)'}
                />
              ) : null}
              {labelled.has(index) ? (
                <text
                  x={x + barWidth / 2}
                  y={HEIGHT - 6}
                  textAnchor="middle"
                  className="fill-zinc-400 text-[11px]"
                >
                  {formatDay(entry.day)}
                </text>
              ) : null}
              {/* The whole column slot is the hit target, not only the painted bar. */}
              <rect
                x={PLOT_LEFT + index * slot}
                y={PLOT_TOP}
                width={slot}
                height={PLOT_BOTTOM - PLOT_TOP}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`${formatDay(entry.day)}: ${numberFormat.format(entry.count)} commands`}
                className="outline-none focus-visible:stroke-sakura"
                onPointerEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
              />
            </g>
          );
        })}
      </svg>
      {activeDay && active !== null ? (
        <div
          role="presentation"
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-edge bg-ink px-2 py-1 text-xs whitespace-nowrap shadow-lg"
          style={{ left: `${((PLOT_LEFT + (active + 0.5) * slot) / WIDTH) * 100}%` }}
        >
          <strong className="font-semibold text-zinc-100 tabular-nums">
            {numberFormat.format(activeDay.count)}
          </strong>{' '}
          <span className="text-zinc-400">commands · {formatDay(activeDay.day)}</span>
        </div>
      ) : null}
    </div>
  );
}
