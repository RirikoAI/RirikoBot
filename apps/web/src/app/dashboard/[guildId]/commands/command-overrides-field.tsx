'use client';

import { useState } from 'react';
import {
  FieldNotes,
  INPUT_CLASS,
  OptionList,
  useSettingsField,
  type SelectOption,
} from '@/components/settings-form';

export interface CatalogCommand {
  name: string;
  category: string;
  description: string;
  cooldownSeconds: number;
  /** Discord permissions the command itself asks for, comma separated. */
  defaultPermission: string | null;
}

export interface CommandOverrideValue {
  command: string;
  channelId: string | null;
  enabled: boolean;
  allowedRoleIds: string[];
  blockedRoleIds: string[];
  cooldownSeconds: number | null;
}

/** One editable override. The cooldown stays text while typing, so a blank box means "the command's own". */
interface Row {
  key: number;
  command: string;
  channelId: string | null;
  enabled: boolean;
  allowedRoleIds: string[];
  blockedRoleIds: string[];
  cooldown: string;
}

let nextKey = 0;

function toRow(value: Partial<CommandOverrideValue> & { command: string }): Row {
  return {
    key: nextKey++,
    command: value.command,
    channelId: value.channelId ?? null,
    enabled: value.enabled ?? true,
    allowedRoleIds: value.allowedRoleIds ?? [],
    blockedRoleIds: value.blockedRoleIds ?? [],
    cooldown:
      value.cooldownSeconds === null || value.cooldownSeconds === undefined
        ? ''
        : String(value.cooldownSeconds),
  };
}

function isDefault(row: Row): boolean {
  return (
    row.enabled &&
    row.allowedRoleIds.length === 0 &&
    row.blockedRoleIds.length === 0 &&
    row.cooldown.trim() === ''
  );
}

/** Rows that change something, in the order they are submitted (and numbered in errors). */
function submitted(rows: Row[]): Row[] {
  return rows.filter((row) => !isDefault(row));
}

/** Seconds as a number; text that is not a number is sent as is, so the schema reports it. */
function cooldownValue(text: string): number | string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const seconds = Number(trimmed);
  return Number.isFinite(seconds) ? seconds : trimmed;
}

function toJson(rows: Row[]): string {
  return JSON.stringify(
    submitted(rows).map((row) => ({
      command: row.command,
      channelId: row.channelId,
      enabled: row.enabled,
      allowedRoleIds: row.allowedRoleIds,
      blockedRoleIds: row.blockedRoleIds,
      cooldownSeconds: cooldownValue(row.cooldown),
    })),
  );
}

function overridesFrom(value: unknown, fallback: CommandOverrideValue[]): CommandOverrideValue[] {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return Array.isArray(parsed) ? (parsed as CommandOverrideValue[]) : fallback;
}

const CATEGORY_LABELS: Record<string, string> = {
  ai: 'AI',
  anime: 'Anime',
  economy: 'Economy',
  games: 'Games',
  general: 'General',
  memes: 'Memes',
  moderation: 'Moderation',
  music: 'Music',
  reactions: 'Reactions',
  streams: 'Streams',
  tcg: 'Waifu TCG',
  utility: 'Utility',
  admin: 'Admin',
};

/**
 * Command overrides editor. Every override is submitted as one JSON field, the same form
 * `ririko guild:config <guild> commands.overrides` accepts.
 */
export function CommandOverridesField({
  defaultValue,
  catalog,
  roles,
  channels,
}: {
  defaultValue: CommandOverrideValue[];
  catalog: CatalogCommand[];
  roles: SelectOption[];
  channels: SelectOption[];
}) {
  const description =
    'A channel rule replaces the server rule in that channel. Blocked roles win over allowed roles. Members with Manage Server always bypass these rules. Errors name the rule by its row number.';
  const field = useSettingsField('overrides', description);
  const initial = overridesFrom(field.returned, defaultValue);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-zinc-200">Command rules</legend>
      <FieldNotes id={field.id} description={description} errors={field.errors} />
      <OverrideEditor
        key={JSON.stringify(initial)}
        initial={initial}
        catalog={catalog}
        roles={roles}
        channels={channels}
        describedBy={field.describedBy}
        invalid={Boolean(field.errors)}
      />
    </fieldset>
  );
}

function OverrideEditor({
  initial,
  catalog,
  roles,
  channels,
  describedBy,
  invalid,
}: {
  initial: CommandOverrideValue[];
  catalog: CatalogCommand[];
  roles: SelectOption[];
  channels: SelectOption[];
  describedBy: string | undefined;
  /** The last save failed: sections with rules start open so the numbered rows are visible. */
  invalid: boolean;
}) {
  const [rows, setRows] = useState(() => initial.map(toRow));
  const [filter, setFilter] = useState('');
  const update = (key: number, change: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const remove = (key: number) => setRows((current) => current.filter((row) => row.key !== key));

  const numbers = new Map(submitted(rows).map((row, index) => [row.key, index + 1]));
  const query = filter.trim().toLowerCase();
  const visible = catalog.filter(
    (command) =>
      query === '' ||
      command.name.includes(query) ||
      command.description.toLowerCase().includes(query),
  );
  const categories = [...new Set(visible.map((command) => command.category))];

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="overrides" value={toJson(rows)} />
      <label className="flex max-w-sm flex-col gap-1 text-xs text-zinc-300">
        Find a command
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Name or description"
          className={INPUT_CLASS}
        />
      </label>
      {categories.length === 0 ? (
        <p className="text-sm text-zinc-400">No command matches.</p>
      ) : null}
      {categories.map((category) => {
        const commands = visible.filter((command) => command.category === category);
        const changed = commands.filter((command) =>
          rows.some((row) => row.command === command.name && !isDefault(row)),
        ).length;
        return (
          // Uncontrolled so members can fold sections; a search remounts them open.
          <details
            key={`${category}:${query !== ''}`}
            open={query !== '' || (invalid && changed > 0) || undefined}
            className="rounded-md border border-edge"
          >
            <summary className="cursor-pointer px-4 py-2 text-sm font-semibold text-zinc-100">
              {CATEGORY_LABELS[category] ?? category}{' '}
              <span className="font-normal text-zinc-400">
                · {commands.length} {commands.length === 1 ? 'command' : 'commands'}
                {changed > 0 ? `, ${changed} with rules` : ''}
              </span>
            </summary>
            <ul className="flex flex-col divide-y divide-edge border-t border-edge">
              {commands.map((command) => (
                <CommandRules
                  key={command.name}
                  command={command}
                  rows={rows.filter((row) => row.command === command.name)}
                  numbers={numbers}
                  roles={roles}
                  channels={channels}
                  describedBy={describedBy}
                  onAdd={(channelId) =>
                    setRows((current) => [...current, toRow({ command: command.name, channelId })])
                  }
                  onChange={update}
                  onRemove={remove}
                />
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}

function CommandRules({
  command,
  rows,
  numbers,
  roles,
  channels,
  describedBy,
  onAdd,
  onChange,
  onRemove,
}: {
  command: CatalogCommand;
  rows: Row[];
  numbers: Map<number, number>;
  roles: SelectOption[];
  channels: SelectOption[];
  describedBy: string | undefined;
  onAdd: (channelId: string | null) => void;
  onChange: (key: number, change: Partial<Row>) => void;
  onRemove: (key: number) => void;
}) {
  const serverRow = rows.find((row) => row.channelId === null);
  const channelRows = rows.filter((row) => row.channelId !== null);
  const channelLabels = new Map(channels.map((channel) => [channel.value, channel.label]));
  const freeChannels = channels.filter(
    (channel) => !channelRows.some((row) => row.channelId === channel.value),
  );
  const summary = [
    serverRow && !serverRow.enabled ? 'off server wide' : null,
    channelRows.length > 0 ? `${channelRows.length} channel rule(s)` : null,
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-sm text-zinc-100">{command.name}</span>
        <span className="text-xs text-zinc-400">{command.description}</span>
        {summary.length > 0 ? (
          <span className="text-xs text-sakura">{summary.join(' · ')}</span>
        ) : null}
      </div>
      <p className="text-xs text-zinc-500">
        Own cooldown: {command.cooldownSeconds > 0 ? `${command.cooldownSeconds}s` : 'none'}
        {command.defaultPermission
          ? ` · Also needs ${command.defaultPermission.split(',').join(', ')}`
          : ''}
      </p>
      {serverRow ? (
        <RuleEditor
          title="Server wide"
          row={serverRow}
          number={numbers.get(serverRow.key)}
          baseCooldown={command.cooldownSeconds}
          roles={roles}
          describedBy={describedBy}
          onChange={onChange}
          onRemove={onRemove}
        />
      ) : null}
      {channelRows.map((row) => (
        <RuleEditor
          key={row.key}
          title={`In ${channelLabels.get(row.channelId ?? '') ?? `unknown channel (${row.channelId})`}`}
          row={row}
          number={numbers.get(row.key)}
          baseCooldown={command.cooldownSeconds}
          roles={roles}
          describedBy={describedBy}
          onChange={onChange}
          onRemove={onRemove}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        {serverRow ? null : (
          <button
            type="button"
            onClick={() => onAdd(null)}
            className="rounded-md border border-edge px-3 py-1.5 text-xs text-zinc-200 hover:border-sakura"
          >
            Add server-wide rule
          </button>
        )}
        <select
          value=""
          aria-label={`Add a channel rule for ${command.name}`}
          onChange={(event) => {
            if (event.target.value) onAdd(event.target.value);
          }}
          disabled={freeChannels.length === 0}
          className={`${INPUT_CLASS} max-w-xs py-1.5 text-xs`}
        >
          <option value="">
            {freeChannels.length === 0 ? 'No channels left' : 'Add a channel rule…'}
          </option>
          <OptionList options={freeChannels} />
        </select>
      </div>
    </li>
  );
}

function RuleEditor({
  title,
  row,
  number,
  baseCooldown,
  roles,
  describedBy,
  onChange,
  onRemove,
}: {
  title: string;
  row: Row;
  number: number | undefined;
  baseCooldown: number;
  roles: SelectOption[];
  describedBy: string | undefined;
  onChange: (key: number, change: Partial<Row>) => void;
  onRemove: (key: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-edge p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-zinc-300">{title}</span>
        <span className="text-xs text-zinc-500">
          {number ? `Row ${number}` : 'No change yet (not saved)'}
        </span>
        <button
          type="button"
          onClick={() => onRemove(row.key)}
          className="ml-auto rounded-md px-2 py-1 text-xs text-zinc-400 hover:text-red-300"
        >
          Remove
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(event) => onChange(row.key, { enabled: event.target.checked })}
            className="size-4 accent-sakura"
          />
          Enabled
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-300">
          Cooldown (seconds)
          <input
            // No native limits: a rule may sit in a folded section the browser cannot focus,
            // so the shared schema reports range errors by row instead.
            type="text"
            inputMode="numeric"
            value={row.cooldown}
            placeholder={`Default ${baseCooldown}`}
            onChange={(event) => onChange(row.key, { cooldown: event.target.value })}
            aria-describedby={describedBy}
            className={`${INPUT_CLASS} w-32`}
          />
        </label>
      </div>
      <RoleChips
        label="Only these roles"
        value={row.allowedRoleIds}
        options={roles.filter((role) => !row.blockedRoleIds.includes(role.value))}
        roles={roles}
        onChange={(allowedRoleIds) => onChange(row.key, { allowedRoleIds })}
      />
      <RoleChips
        label="Never these roles"
        value={row.blockedRoleIds}
        options={roles.filter((role) => !row.allowedRoleIds.includes(role.value))}
        roles={roles}
        onChange={(blockedRoleIds) => onChange(row.key, { blockedRoleIds })}
      />
    </div>
  );
}

function RoleChips({
  label,
  value,
  options,
  roles,
  onChange,
}: {
  label: string;
  value: string[];
  options: SelectOption[];
  roles: SelectOption[];
  onChange: (value: string[]) => void;
}) {
  const labels = new Map(roles.map((role) => [role.value, role.label]));
  const available = options.filter((option) => !value.includes(option.value));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-300">{label}:</span>
      {value.length === 0 ? <span className="text-xs text-zinc-500">Any</span> : null}
      {value.map((id) => {
        const text = labels.get(id) ?? `Unknown (${id})`;
        return (
          <span
            key={id}
            className="flex items-center gap-1 rounded-full border border-edge bg-ink py-0.5 pr-1 pl-3 text-xs text-zinc-200"
          >
            {text}
            <button
              type="button"
              aria-label={`Remove ${text} from ${label.toLowerCase()}`}
              onClick={() => onChange(value.filter((item) => item !== id))}
              className="rounded-full px-1.5 text-zinc-400 hover:text-white"
            >
              ×
            </button>
          </span>
        );
      })}
      <select
        value=""
        aria-label={`Add a role to ${label.toLowerCase()}`}
        onChange={(event) => {
          if (event.target.value) onChange([...value, event.target.value]);
        }}
        disabled={available.length === 0}
        className={`${INPUT_CLASS} max-w-xs py-1 text-xs`}
      >
        <option value="">{available.length === 0 ? 'No roles left' : 'Add a role…'}</option>
        <OptionList options={available} />
      </select>
    </div>
  );
}
