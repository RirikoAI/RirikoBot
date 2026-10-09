import { numberFormat } from '@/lib/chart-format';

export interface TopCommand {
  commandName: string;
  count: number;
}

/** The most used commands, most used first, each with a bar scaled to the busiest one. */
export function TopCommands({ commands }: { commands: readonly TopCommand[] }) {
  if (commands.length === 0) return <p className="text-sm text-zinc-400">None yet.</p>;
  const busiest = commands[0]!.count;
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {commands.map((command) => (
        <li key={command.commandName} className="flex flex-col gap-1">
          <div className="flex justify-between gap-3">
            <span className="font-mono text-zinc-200">{command.commandName}</span>
            <span className="text-zinc-400 tabular-nums">{numberFormat.format(command.count)}</span>
          </div>
          {/* SVG geometry, not a style attribute: the production CSP blocks those. */}
          <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="h-1.5 w-full" aria-hidden>
            <rect width="100" height="6" rx="3" className="fill-ink" />
            <rect
              width={(command.count / busiest) * 100}
              height="6"
              rx="3"
              className="fill-sakura-strong"
            />
          </svg>
        </li>
      ))}
    </ol>
  );
}
