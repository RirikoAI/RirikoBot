'use client';

import { useState } from 'react';
import {
  FieldNotes,
  INPUT_CLASS,
  OptionList,
  useSettingsField,
  type SelectOption,
} from '@/components/settings-form';

export interface AutoVoiceHubValue {
  channelId: string;
  nameTemplate: string;
  userLimit: number;
  bitrate: number;
}

/** A hub as saved, or as submitted, where a box left blank arrives as `null`. */
type HubInput = {
  channelId?: string | null;
  nameTemplate?: string | null;
  userLimit?: number | null;
  bitrate?: number | null;
};

/** One editable row; the limit stays text while typing so a blank box can be reported. */
interface Row {
  key: number;
  channelId: string;
  nameTemplate: string;
  userLimit: string;
  bitrate: number;
}

const BITRATE_PRESETS_KBPS = [8, 16, 32, 48, 64, 96, 128, 192, 256, 320, 384];
const DEFAULT_TEMPLATE = "{user}'s Room";
const DEFAULT_BITRATE = 64_000;
const MAX_HUBS = 20;

let nextKey = 0;

function toRow(hub: HubInput): Row {
  return {
    key: nextKey++,
    channelId: hub.channelId ?? '',
    nameTemplate: hub.nameTemplate ?? DEFAULT_TEMPLATE,
    userLimit: hub.userLimit === null ? '' : String(hub.userLimit ?? 0),
    bitrate: hub.bitrate ?? DEFAULT_BITRATE,
  };
}

/** The JSON the shared schema parses, in row order so its errors match the row numbers. */
function toJson(rows: Row[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      channelId: row.channelId,
      nameTemplate: row.nameTemplate,
      userLimit: row.userLimit.trim() === '' ? null : Number(row.userLimit),
      bitrate: row.bitrate,
    })),
  );
}

function hubsFrom(value: unknown, fallback: AutoVoiceHubValue[]): HubInput[] {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return Array.isArray(parsed) ? (parsed as HubInput[]) : fallback;
}

/**
 * Join-to-create hub editor. The rows are submitted as one JSON field, the same form
 * `ririko guild:config <guild> autovoice.hubs` accepts.
 */
export function AutoVoiceHubsField({
  defaultValue,
  channels,
  maxBitrate,
}: {
  defaultValue: AutoVoiceHubValue[];
  /** Voice channels of the guild. */
  channels: SelectOption[];
  /** Highest bitrate the guild's boost level allows, in bits per second. */
  maxBitrate: number;
}) {
  const description = `Name templates may use {user} for the member’s display name. This server allows up to ${maxBitrate / 1000} kbps. Errors name the row by its number.`;
  const field = useSettingsField('hubs', description);
  const hubs = hubsFrom(field.returned, defaultValue);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-zinc-200">Hubs</legend>
      <HubRows
        key={JSON.stringify(hubs)}
        initial={hubs}
        channels={channels}
        maxBitrate={maxBitrate}
        describedBy={field.describedBy}
        invalid={Boolean(field.errors)}
      />
      <FieldNotes id={field.id} description={description} errors={field.errors} />
    </fieldset>
  );
}

function HubRows({
  initial,
  channels,
  maxBitrate,
  describedBy,
  invalid,
}: {
  initial: HubInput[];
  channels: SelectOption[];
  maxBitrate: number;
  describedBy: string | undefined;
  invalid: boolean;
}) {
  const [rows, setRows] = useState(() => initial.map(toRow));
  const update = (key: number, change: Partial<Row>) =>
    setRows(rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const known = new Set(channels.map((channel) => channel.value));
  const used = new Set(rows.map((row) => row.channelId));

  function channelOptions(row: Row): SelectOption[] {
    const options = channels.filter(
      (channel) => channel.value === row.channelId || !used.has(channel.value),
    );
    return row.channelId && !known.has(row.channelId)
      ? [{ value: row.channelId, label: `Deleted channel (${row.channelId})` }, ...options]
      : options;
  }

  function bitrateOptions(row: Row): SelectOption[] {
    const presets = BITRATE_PRESETS_KBPS.map((kbps) => kbps * 1000).filter(
      (bps) => bps <= maxBitrate,
    );
    const values = presets.includes(row.bitrate) ? presets : [...presets, row.bitrate];
    return values
      .sort((a, b) => a - b)
      .map((bps) => ({
        value: String(bps),
        label:
          bps > maxBitrate
            ? `${bps / 1000} kbps (above this server’s limit)`
            : `${bps / 1000} kbps`,
      }));
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="hubs" value={toJson(rows)} />
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400">No hubs: joining a voice channel creates nothing.</p>
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
                Hub channel
                <select
                  value={row.channelId}
                  onChange={(event) => update(row.key, { channelId: event.target.value })}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  className={`${INPUT_CLASS} w-52`}
                >
                  <option value="">Choose a voice channel…</option>
                  <OptionList options={channelOptions(row)} />
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-300">
                Channel name
                <input
                  type="text"
                  maxLength={100}
                  value={row.nameTemplate}
                  onChange={(event) => update(row.key, { nameTemplate: event.target.value })}
                  aria-invalid={invalid}
                  className={`${INPUT_CLASS} w-48`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-300">
                User limit
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  step={1}
                  value={row.userLimit}
                  onChange={(event) => update(row.key, { userLimit: event.target.value })}
                  aria-invalid={invalid}
                  className={`${INPUT_CLASS} w-24`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-300">
                Bitrate
                <select
                  value={String(row.bitrate)}
                  onChange={(event) => update(row.key, { bitrate: Number(event.target.value) })}
                  className={`${INPUT_CLASS} w-56`}
                >
                  <OptionList options={bitrateOptions(row)} />
                </select>
              </label>
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
      <div>
        <button
          type="button"
          onClick={() =>
            setRows([
              ...rows,
              toRow({
                channelId: channels.find((channel) => !used.has(channel.value))?.value ?? '',
                bitrate: Math.min(DEFAULT_BITRATE, maxBitrate),
              }),
            ])
          }
          disabled={rows.length >= MAX_HUBS}
          className="rounded-md border border-edge px-3 py-1.5 text-sm text-zinc-200 hover:border-sakura disabled:opacity-60"
        >
          Add hub
        </button>
      </div>
    </div>
  );
}
