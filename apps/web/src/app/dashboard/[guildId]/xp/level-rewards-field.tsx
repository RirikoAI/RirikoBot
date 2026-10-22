'use client';

import { useState } from 'react';
import {
  FieldNotes,
  INPUT_CLASS,
  OptionList,
  useSettingsField,
  type SelectOption,
} from '@/components/settings-form';

export interface LevelRewardValue {
  level: number;
  roleId: string;
}

/** A reward as saved, or as submitted, where a box left blank arrives as `null`. */
type RewardInput = { level?: number | null; roleId?: string | null };

/** One editable row; the level stays text while typing so a blank box can be reported. */
export interface Row {
  key: number;
  level: string;
  roleId: string;
}

let nextKey = 0;

export function toRow(reward: RewardInput): Row {
  return {
    key: nextKey++,
    level: reward.level === null || reward.level === undefined ? '' : String(reward.level),
    roleId: reward.roleId ?? '',
  };
}

/** The JSON the shared schema parses, in row order so its errors match the row numbers. */
export function toJson(rows: Row[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      level: row.level.trim() === '' ? null : Number(row.level),
      roleId: row.roleId,
    })),
  );
}

/** The rows with a new blank one, unless the list is already at `max`. */
export function addRow(rows: Row[], max: number): Row[] {
  return rows.length >= max ? rows : [...rows, toRow({})];
}

export function removeRow(rows: Row[], key: number): Row[] {
  return rows.filter((row) => row.key !== key);
}

export function updateRow(rows: Row[], key: number, change: Partial<Row>): Row[] {
  return rows.map((row) => (row.key === key ? { ...row, ...change } : row));
}

function rewardsFrom(value: unknown, fallback: LevelRewardValue[]): RewardInput[] {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return Array.isArray(parsed) ? (parsed as RewardInput[]) : fallback;
}

/**
 * Level role reward editor. The rows are submitted as one JSON field, the same form
 * `ririko guild:config <guild> levelroles.rewards` accepts.
 */
export function LevelRewardsField({
  defaultValue,
  roles,
  maxRewards,
  maxLevel,
}: {
  defaultValue: LevelRewardValue[];
  /** Roles Ririko can give in this server, plus any saved role it can no longer give. */
  roles: SelectOption[];
  /** Most rewards a server can have. */
  maxRewards: number;
  /** Highest level a reward can be set for. */
  maxLevel: number;
}) {
  const description = `Each level gets one role, and each role is used once. Up to ${maxRewards} rewards. Errors name the row by its number.`;
  const field = useSettingsField('rewards', description);
  const rewards = rewardsFrom(field.returned, defaultValue);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-zinc-200">Rewards</legend>
      <RewardRows
        key={JSON.stringify(rewards)}
        initial={rewards}
        roles={roles}
        maxRewards={maxRewards}
        maxLevel={maxLevel}
        describedBy={field.describedBy}
        invalid={Boolean(field.errors)}
      />
      <FieldNotes id={field.id} description={description} errors={field.errors} />
    </fieldset>
  );
}

function RewardRows({
  initial,
  roles,
  maxRewards,
  maxLevel,
  describedBy,
  invalid,
}: {
  initial: RewardInput[];
  roles: SelectOption[];
  maxRewards: number;
  maxLevel: number;
  describedBy: string | undefined;
  invalid: boolean;
}) {
  const [rows, setRows] = useState(() => initial.map(toRow));
  const update = (key: number, change: Partial<Row>) => setRows(updateRow(rows, key, change));
  const known = new Set(roles.map((role) => role.value));
  const used = new Set(rows.map((row) => row.roleId));

  function roleOptions(row: Row): SelectOption[] {
    const options = roles.filter((role) => role.value === row.roleId || !used.has(role.value));
    return row.roleId && !known.has(row.roleId)
      ? [{ value: row.roleId, label: `Unavailable role (${row.roleId})` }, ...options]
      : options;
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="rewards" value={toJson(rows)} />
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400">No rewards: no roles are given for levels.</p>
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
                Level
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={maxLevel}
                  step={1}
                  value={row.level}
                  onChange={(event) => update(row.key, { level: event.target.value })}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  className={`${INPUT_CLASS} w-24`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-300">
                Role
                <select
                  value={row.roleId}
                  onChange={(event) => update(row.key, { roleId: event.target.value })}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  className={`${INPUT_CLASS} w-56`}
                >
                  <option value="">Choose a role…</option>
                  <OptionList options={roleOptions(row)} />
                </select>
              </label>
              <button
                type="button"
                onClick={() => setRows(removeRow(rows, row.key))}
                aria-label={`Remove row ${index + 1}`}
                className="ml-auto rounded-md px-2 py-1 text-sm text-zinc-400 hover:text-red-300"
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}
      <div>
        <button
          type="button"
          onClick={() => setRows(addRow(rows, maxRewards))}
          disabled={rows.length >= maxRewards}
          className="rounded-md border border-edge px-3 py-1.5 text-sm text-zinc-200 hover:border-sakura disabled:opacity-60"
        >
          Add reward
        </button>
      </div>
    </div>
  );
}
