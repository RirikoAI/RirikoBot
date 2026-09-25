const dayFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export const numberFormat = new Intl.NumberFormat('en-US');

/** `YYYY-MM-DD` as `Sep 26`. The day is UTC, so server and browser render the same text. */
export function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

/** Clean y-axis ticks from 0: steps of 1, 2 or 5 times a power of ten, about four of them. */
export function axisTicks(max: number): number[] {
  if (max <= 0) return [0];
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, ([1, 2, 5, 10].find((m) => m * power >= rough) ?? 10) * power);
  const ticks: number[] = [];
  for (let tick = 0; tick < max + step; tick += step) ticks.push(tick);
  return ticks;
}
