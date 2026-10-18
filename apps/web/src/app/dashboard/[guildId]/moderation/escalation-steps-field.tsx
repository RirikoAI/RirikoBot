'use client';

import { useState } from 'react';
import { FieldNotes, INPUT_CLASS, useSettingsField } from '@/components/settings-form';

type Action = 'WARN' | 'TIMEOUT' | 'KICK' | 'BAN';

export interface EscalationStepValue {
  warnThreshold: number;
  action: Action;
  durationSeconds?: number | undefined;
}

const ACTION_LABELS: Record<Action, string> = {
  WARN: 'Warning only',
  TIMEOUT: 'Timeout',
  KICK: 'Kick',
  BAN: 'Ban',
};

const UNITS = [
  { seconds: 86_400, label: 'days' },
  { seconds: 3600, label: 'hours' },
  { seconds: 60, label: 'minutes' },
] as const;

/** One editable row. Numbers stay text while typing, so an empty box can be submitted and reported. */
interface Row {
  key: number;
  warnThreshold: string;
  action: Action;
  amount: string;
  unit: number;
}

/** A step as saved, or as submitted, where a box left blank arrives as `null`. */
type StepInput = {
  warnThreshold: number | null;
  action: Action;
  durationSeconds?: number | null | undefined;
};

let nextKey = 0;

function toRow(step: StepInput): Row {
  // A step without a length (warn, kick, ban) offers 10 minutes if it is switched to a timeout;
  // a timeout submitted blank stays blank so its error still points at an empty box.
  const seconds = step.durationSeconds === undefined ? 600 : step.durationSeconds;
  const unit =
    UNITS.find((candidate) => seconds !== null && seconds % candidate.seconds === 0)?.seconds ?? 60;
  return {
    key: nextKey++,
    warnThreshold: step.warnThreshold === null ? '' : String(step.warnThreshold),
    action: step.action,
    amount: seconds === null ? '' : String(seconds / unit),
    unit,
  };
}

/** The JSON the shared schema parses; blank numbers become null so the schema reports them. */
function toJson(rows: Row[]): string {
  const number = (text: string) => (text.trim() === '' ? null : Number(text));
  return JSON.stringify(
    rows.map((row) => {
      const amount = number(row.amount);
      return {
        warnThreshold: number(row.warnThreshold),
        action: row.action,
        ...(row.action === 'TIMEOUT'
          ? { durationSeconds: amount === null ? null : Math.round(amount * row.unit) }
          : {}),
      };
    }),
  );
}

function stepsFrom(value: unknown, fallback: EscalationStepValue[]): StepInput[] {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return Array.isArray(parsed) ? (parsed as StepInput[]) : fallback;
}

/**
 * Warning escalation policy editor. The rows are submitted as one JSON field, the same form
 * `ririko guild:config <guild> moderation.escalationSteps` accepts.
 */
export function EscalationStepsField({
  defaultValue,
  defaultPolicy,
}: {
  defaultValue: EscalationStepValue[];
  /** The policy guilds get when they never saved one, for "Reset to defaults". */
  defaultPolicy: EscalationStepValue[];
}) {
  const description =
    'On each new warning Ririko adds up the member’s active warning points and applies the step with the highest threshold at or below that total. Errors name the row by its number.';
  const field = useSettingsField('escalationSteps', description);
  const steps = stepsFrom(field.returned, defaultValue);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-zinc-200">Escalation steps</legend>
      <StepRows
        key={JSON.stringify(steps)}
        initial={steps}
        defaultPolicy={defaultPolicy}
        describedBy={field.describedBy}
        invalid={Boolean(field.errors)}
      />
      <FieldNotes id={field.id} description={description} errors={field.errors} />
    </fieldset>
  );
}

function StepRows({
  initial,
  defaultPolicy,
  describedBy,
  invalid,
}: {
  initial: StepInput[];
  defaultPolicy: EscalationStepValue[];
  describedBy: string | undefined;
  invalid: boolean;
}) {
  const [rows, setRows] = useState(() => initial.map(toRow));
  const update = (key: number, change: Partial<Row>) =>
    setRows(rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const highest = rows.reduce((max, row) => Math.max(max, Number(row.warnThreshold) || 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="escalationSteps" value={toJson(rows)} />
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400">
          No steps: warnings are recorded but never lead to a timeout, kick or ban.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <li
              key={row.key}
              className="flex flex-wrap items-end gap-3 rounded-md border border-edge p-3"
            >
              <span className="self-center text-xs font-semibold text-zinc-400">
                Row {index + 1}
              </span>
              <label className="flex flex-col gap-1 text-xs text-zinc-300">
                At warning points
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  step={1}
                  value={row.warnThreshold}
                  onChange={(event) => update(row.key, { warnThreshold: event.target.value })}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  className={`${INPUT_CLASS} w-24`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-300">
                Action
                <select
                  value={row.action}
                  onChange={(event) => update(row.key, { action: event.target.value as Action })}
                  className={`${INPUT_CLASS} w-40`}
                >
                  {Object.entries(ACTION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {row.action === 'TIMEOUT' ? (
                <div className="flex items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs text-zinc-300">
                    For
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      step="any"
                      value={row.amount}
                      onChange={(event) => update(row.key, { amount: event.target.value })}
                      aria-invalid={invalid}
                      className={`${INPUT_CLASS} w-24`}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-zinc-300">
                    <span className="sr-only">Unit</span>
                    <select
                      value={row.unit}
                      onChange={(event) => update(row.key, { unit: Number(event.target.value) })}
                      className={`${INPUT_CLASS} w-28`}
                    >
                      {UNITS.map((unit) => (
                        <option key={unit.seconds} value={unit.seconds}>
                          {unit.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setRows(rows.filter((candidate) => candidate.key !== row.key))}
                aria-label={`Remove row ${index + 1}`}
                className="ml-auto rounded-md px-2 py-1 text-sm text-zinc-400 hover:text-red-300"
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            setRows([...rows, toRow({ warnThreshold: Math.min(highest + 1, 100), action: 'WARN' })])
          }
          disabled={rows.length >= 20}
          className="rounded-md border border-edge px-3 py-1.5 text-sm text-zinc-200 hover:border-sakura disabled:opacity-60"
        >
          Add step
        </button>
        <button
          type="button"
          onClick={() => setRows(defaultPolicy.map(toRow))}
          className="rounded-md border border-edge px-3 py-1.5 text-sm text-zinc-200 hover:border-sakura"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
