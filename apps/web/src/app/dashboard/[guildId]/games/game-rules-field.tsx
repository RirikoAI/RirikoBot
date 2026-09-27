'use client';

import { useState } from 'react';
import { FieldNotes, INPUT_CLASS, useSettingsField } from '@/components/settings-form';

export interface GameInfo {
  command: string;
  description: string;
  /** The game's own cooldown in seconds. */
  cooldownSeconds: number;
  /** The Commands page has role or channel rules for this game. */
  hasOtherRules: boolean;
}

export interface GameRuleValue {
  command: string;
  enabled: boolean;
  cooldownSeconds: number | null;
}

/** The cooldown stays text while typing, so a blank box means "the game's own". */
interface Row {
  command: string;
  enabled: boolean;
  cooldown: string;
}

function rulesFrom(value: unknown, fallback: GameRuleValue[]): GameRuleValue[] {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return Array.isArray(parsed) ? (parsed as GameRuleValue[]) : fallback;
}

/** Seconds as a number; text that is not a number is sent as is, so the schema reports it. */
function cooldownValue(text: string): number | string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const seconds = Number(trimmed);
  return Number.isFinite(seconds) ? seconds : trimmed;
}

/**
 * One row per game, submitted as one JSON field (every game, in the listed order, so an error's
 * row number matches the list), the same form `ririko guild:config <guild> games.rules` accepts.
 */
export function GameRulesField({
  games,
  defaultValue,
}: {
  games: GameInfo[];
  defaultValue: GameRuleValue[];
}) {
  const description =
    'Server-wide rules. Turn a game off, or replace its cooldown (0 removes it, empty keeps the game’s own). Cooldowns count per member.';
  const field = useSettingsField('rules', description);
  const initial = rulesFrom(field.returned, defaultValue);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-zinc-200">Games</legend>
      <FieldNotes id={field.id} description={description} errors={field.errors} />
      <RulesTable
        key={JSON.stringify(initial)}
        games={games}
        initial={initial}
        describedBy={field.describedBy}
      />
    </fieldset>
  );
}

function RulesTable({
  games,
  initial,
  describedBy,
}: {
  games: GameInfo[];
  initial: GameRuleValue[];
  describedBy: string | undefined;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    games.map((game) => {
      const rule = initial.find((entry) => entry.command === game.command);
      return {
        command: game.command,
        enabled: rule?.enabled ?? true,
        cooldown:
          rule?.cooldownSeconds === null || rule?.cooldownSeconds === undefined
            ? ''
            : String(rule.cooldownSeconds),
      };
    }),
  );
  const update = (command: string, change: Partial<Row>) =>
    setRows((current) =>
      current.map((row) => (row.command === command ? { ...row, ...change } : row)),
    );
  const json = JSON.stringify(
    rows.map((row) => ({
      command: row.command,
      enabled: row.enabled,
      cooldownSeconds: cooldownValue(row.cooldown),
    })),
  );

  return (
    <ol className="flex flex-col divide-y divide-edge rounded-md border border-edge">
      <input type="hidden" name="rules" value={json} />
      {games.map((game, index) => {
        const row = rows[index]!;
        return (
          <li key={game.command} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xs text-zinc-500">Row {index + 1}</span>
              <span className="font-mono text-sm text-zinc-100">{game.command}</span>
              <span className="text-xs text-zinc-400">{game.description}</span>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(event) => update(game.command, { enabled: event.target.checked })}
                  aria-describedby={describedBy}
                  className="size-4 accent-sakura"
                />
                Enabled
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-300">
                Cooldown (seconds)
                <input
                  type="text"
                  inputMode="numeric"
                  value={row.cooldown}
                  onChange={(event) => update(game.command, { cooldown: event.target.value })}
                  placeholder={`Own: ${game.cooldownSeconds}s`}
                  aria-describedby={describedBy}
                  className={`${INPUT_CLASS} max-w-32`}
                />
              </label>
            </div>
            {game.hasOtherRules ? (
              <p className="text-xs text-zinc-400">
                Also has role or channel rules on the Commands page. A channel rule there replaces
                this one in that channel.
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
