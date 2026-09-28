import type { SeasonStatus } from '@ririko/services/owner';

const STATUS: Record<SeasonStatus, { label: string; className: string }> = {
  live: { label: 'Live', className: 'text-emerald-300' },
  overlapped: { label: 'Waiting: a later season is live', className: 'text-amber-300' },
  scheduled: { label: 'Scheduled', className: 'text-sky-300' },
  ended: { label: 'Ended', className: 'text-zinc-400' },
  off: { label: 'Off', className: 'text-zinc-400' },
  tutorial: { label: 'Tutorial (fixed)', className: 'text-zinc-400' },
};

export function SeasonStatusLabel({ status }: { status: SeasonStatus }) {
  const { label, className } = STATUS[status];
  return <span className={className}>{label}</span>;
}

export function bossTierLabel(tier: string): string {
  return tier === 'MAJOR_BOSS' ? 'major boss' : tier === 'MINI_BOSS' ? 'mini-boss' : 'standard';
}
