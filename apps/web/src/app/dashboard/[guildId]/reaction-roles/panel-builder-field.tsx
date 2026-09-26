'use client';

import { useState } from 'react';
import {
  FieldNotes,
  INPUT_CLASS,
  OptionList,
  useSettingsField,
  type SelectOption,
} from '@/components/settings-form';

type Kind = 'BUTTONS' | 'SELECT';
type Mode = 'TOGGLE' | 'GIVE_ONLY' | 'REMOVE_ONLY' | 'UNIQUE';
type Style = 'PRIMARY' | 'SECONDARY' | 'SUCCESS' | 'DANGER';

/** A panel as the page loads it for editing (the builder input the shared schema accepts). */
export interface PanelDraftInput {
  channelId?: string | undefined;
  messageId?: string | null | undefined;
  content?: string | undefined;
  embed?:
    | {
        title?: string | undefined;
        description?: string | undefined;
        color?: number | undefined;
      }
    | null
    | undefined;
  kind?: Kind | undefined;
  mode?: Mode | undefined;
  placeholder?: string | undefined;
  maxValues?: number | null | undefined;
  items?:
    | {
        roleId?: string | undefined;
        label?: string | undefined;
        description?: string | undefined;
        emoji?: string | null | undefined;
        style?: Style | undefined;
      }[]
    | undefined;
}

interface Item {
  key: number;
  roleId: string;
  label: string;
  description: string;
  emoji: string;
  style: Style;
}

interface Draft {
  channelId: string;
  messageId: string | null;
  content: string;
  useEmbed: boolean;
  title: string;
  description: string;
  color: string;
  kind: Kind;
  mode: Mode;
  placeholder: string;
  maxValues: string;
  items: Item[];
}

const MODE_LABELS: Record<Mode, string> = {
  TOGGLE: 'Toggle: click to get the role, click again to lose it',
  GIVE_ONLY: 'Give only: clicking never removes the role',
  REMOVE_ONLY: 'Remove only: clicking only takes the role away',
  UNIQUE: 'Pick one: getting a role removes the panel’s other roles',
};

const STYLE_LABELS: Record<Style, string> = {
  PRIMARY: 'Blurple',
  SECONDARY: 'Grey',
  SUCCESS: 'Green',
  DANGER: 'Red',
};

const STYLE_COLORS: Record<Style, string> = {
  PRIMARY: '#5865f2',
  SECONDARY: '#4e5058',
  SUCCESS: '#248046',
  DANGER: '#da373c',
};

const MAX_ITEMS = 25;
const DEFAULT_COLOR = '#e91e63';

let nextKey = 0;

function toItem(item: NonNullable<PanelDraftInput['items']>[number]): Item {
  return {
    key: nextKey++,
    roleId: item.roleId ?? '',
    label: item.label ?? '',
    description: item.description ?? '',
    emoji: item.emoji ?? '',
    style: item.style ?? 'PRIMARY',
  };
}

function toDraft(input: PanelDraftInput | null, firstChannel: string): Draft {
  const color = input?.embed?.color;
  return {
    channelId: input?.channelId ?? firstChannel,
    messageId: input?.messageId ?? null,
    content: input?.content ?? '',
    useEmbed: Boolean(input?.embed),
    title: input?.embed?.title ?? '',
    description: input?.embed?.description ?? '',
    color: typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : DEFAULT_COLOR,
    kind: input?.kind ?? 'BUTTONS',
    mode: input?.mode ?? 'TOGGLE',
    placeholder: input?.placeholder ?? '',
    maxValues: input?.maxValues === null ? '' : String(input?.maxValues ?? 1),
    items: (input?.items ?? [{}]).map(toItem),
  };
}

/** The JSON the shared panel schema parses; blank numbers become null so it reports them. */
function toJson(draft: Draft): string {
  return JSON.stringify({
    channelId: draft.channelId,
    messageId: draft.messageId,
    content: draft.content,
    embed: draft.useEmbed
      ? {
          title: draft.title,
          description: draft.description,
          color: Number.parseInt(draft.color.slice(1), 16),
        }
      : null,
    kind: draft.kind,
    mode: draft.mode,
    placeholder: draft.placeholder,
    maxValues: draft.maxValues.trim() === '' ? null : Number(draft.maxValues),
    items: draft.items.map(({ roleId, label, description, emoji, style }) => ({
      roleId,
      label,
      description,
      emoji: emoji.trim() === '' ? null : emoji,
      style,
    })),
  });
}

function inputFrom(value: unknown, fallback: PanelDraftInput | null): PanelDraftInput | null {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as PanelDraftInput;
  } catch {
    return fallback;
  }
}

/**
 * Reaction role panel builder: the message, then its role buttons or its role menu. Submitted
 * as one JSON field that the shared schema parses.
 */
export function PanelBuilderField({
  defaultValue,
  channels,
  roles,
}: {
  /** A published panel to edit, or null for a new one. */
  defaultValue: PanelDraftInput | null;
  /** Text and announcement channels. */
  channels: SelectOption[];
  /** Roles Ririko can give. */
  roles: SelectOption[];
}) {
  const description = 'Errors about a role name it by its number.';
  const field = useSettingsField('panel', description);
  const input = inputFrom(field.returned, defaultValue);
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="sr-only">Panel</legend>
      <PanelEditor
        key={JSON.stringify(input)}
        initial={toDraft(input, channels[0]?.value ?? '')}
        channels={channels}
        roles={roles}
        describedBy={field.describedBy}
        invalid={Boolean(field.errors)}
      />
      <FieldNotes id={field.id} description={description} errors={field.errors} />
    </fieldset>
  );
}

function PanelEditor({
  initial,
  channels,
  roles,
  describedBy,
  invalid,
}: {
  initial: Draft;
  channels: SelectOption[];
  roles: SelectOption[];
  describedBy: string | undefined;
  invalid: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const set = (change: Partial<Draft>) => setDraft({ ...draft, ...change });
  const setItem = (key: number, change: Partial<Item>) =>
    set({ items: draft.items.map((item) => (item.key === key ? { ...item, ...change } : item)) });
  const roleNames = new Map(roles.map((role) => [role.value, role.label.replace(/^@/, '')]));
  const used = new Set(draft.items.map((item) => item.roleId));

  function roleOptions(item: Item): SelectOption[] {
    const options = roles.filter((role) => role.value === item.roleId || !used.has(role.value));
    return item.roleId && !roleNames.has(item.roleId)
      ? [{ value: item.roleId, label: `Unknown role (${item.roleId})` }, ...options]
      : options;
  }

  const labelled = 'flex flex-col gap-1 text-xs text-zinc-300';
  return (
    <div className="flex flex-col gap-5">
      <input type="hidden" name="panel" value={toJson(draft)} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-200">Message</h2>
        {draft.messageId ? (
          <p className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
            Editing message <code>{draft.messageId}</code>.
            <button
              type="button"
              onClick={() => setDraft(toDraft(null, draft.channelId))}
              className="rounded-md border border-edge px-2 py-1 text-xs hover:border-sakura"
            >
              Start a new panel instead
            </button>
          </p>
        ) : null}
        <label className={labelled}>
          Channel
          <select
            value={draft.channelId}
            disabled={draft.messageId !== null}
            onChange={(event) => set({ channelId: event.target.value })}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={`${INPUT_CLASS} max-w-sm`}
          >
            <option value="">Choose a channel…</option>
            <OptionList options={channels} />
          </select>
        </label>
        <label className={labelled}>
          Text
          <textarea
            value={draft.content}
            maxLength={2000}
            rows={3}
            onChange={(event) => set({ content: event.target.value })}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-200">
          <input
            type="checkbox"
            checked={draft.useEmbed}
            onChange={(event) => set({ useEmbed: event.target.checked })}
            className="h-4 w-4 accent-sakura"
          />
          Add an embed
        </label>
        {draft.useEmbed ? (
          <div className="flex flex-col gap-3 rounded-md border border-edge p-3">
            <div className="flex flex-wrap gap-3">
              <label className={`${labelled} grow`}>
                Embed title
                <input
                  type="text"
                  maxLength={256}
                  value={draft.title}
                  onChange={(event) => set({ title: event.target.value })}
                  className={INPUT_CLASS}
                />
              </label>
              <label className={labelled}>
                Colour
                <input
                  type="color"
                  value={draft.color}
                  onChange={(event) => set({ color: event.target.value })}
                  className="h-9 w-16 rounded-md border border-edge bg-ink"
                />
              </label>
            </div>
            <label className={labelled}>
              Embed description
              <textarea
                value={draft.description}
                maxLength={4096}
                rows={3}
                onChange={(event) => set({ description: event.target.value })}
                className={INPUT_CLASS}
              />
            </label>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-200">Roles</h2>
        <div className="flex flex-wrap gap-3">
          <label className={labelled}>
            Members pick roles with
            <select
              value={draft.kind}
              onChange={(event) => set({ kind: event.target.value as Kind })}
              className={`${INPUT_CLASS} w-48`}
            >
              <option value="BUTTONS">Buttons</option>
              <option value="SELECT">A drop-down menu</option>
            </select>
          </label>
          {draft.kind === 'BUTTONS' ? (
            <label className={labelled}>
              A click
              <select
                value={draft.mode}
                onChange={(event) => set({ mode: event.target.value as Mode })}
                className={`${INPUT_CLASS} w-96 max-w-full`}
              >
                {Object.entries(MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className={labelled}>
                Placeholder
                <input
                  type="text"
                  maxLength={150}
                  value={draft.placeholder}
                  placeholder="Choose your roles"
                  onChange={(event) => set({ placeholder: event.target.value })}
                  className={`${INPUT_CLASS} w-56`}
                />
              </label>
              <label className={labelled}>
                Roles a member can hold
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_ITEMS}
                  step={1}
                  value={draft.maxValues}
                  onChange={(event) => set({ maxValues: event.target.value })}
                  aria-invalid={invalid}
                  className={`${INPUT_CLASS} w-24`}
                />
              </label>
            </>
          )}
        </div>
        {draft.kind === 'SELECT' ? (
          <p className="text-xs text-zinc-400">
            A member’s choice replaces their roles from this menu: roles they did not pick are
            removed. With 1, the menu works as “pick one”.
          </p>
        ) : null}
        <ol className="flex flex-col gap-2">
          {draft.items.map((item, index) => (
            <li
              key={item.key}
              className="flex flex-wrap items-end gap-3 rounded-md border border-edge p-3"
            >
              <span className="self-center text-xs font-semibold text-zinc-400">
                Role {index + 1}
              </span>
              <label className={labelled}>
                Role
                <select
                  value={item.roleId}
                  onChange={(event) => {
                    const roleId = event.target.value;
                    const name = roleNames.get(roleId) ?? '';
                    const autoLabel =
                      item.label === '' || item.label === roleNames.get(item.roleId);
                    setItem(item.key, { roleId, ...(autoLabel ? { label: name } : {}) });
                  }}
                  aria-invalid={invalid}
                  className={`${INPUT_CLASS} w-48`}
                >
                  <option value="">Choose a role…</option>
                  <OptionList options={roleOptions(item)} />
                </select>
              </label>
              <label className={labelled}>
                Label
                <input
                  type="text"
                  maxLength={draft.kind === 'BUTTONS' ? 80 : 100}
                  value={item.label}
                  onChange={(event) => setItem(item.key, { label: event.target.value })}
                  className={`${INPUT_CLASS} w-40`}
                />
              </label>
              <label className={labelled}>
                Emoji
                <input
                  type="text"
                  value={item.emoji}
                  placeholder="🎮 or <:name:id>"
                  onChange={(event) => setItem(item.key, { emoji: event.target.value })}
                  className={`${INPUT_CLASS} w-36`}
                />
              </label>
              {draft.kind === 'BUTTONS' ? (
                <label className={labelled}>
                  Colour
                  <select
                    value={item.style}
                    onChange={(event) => setItem(item.key, { style: event.target.value as Style })}
                    className={`${INPUT_CLASS} w-28`}
                  >
                    {Object.entries(STYLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className={labelled}>
                  Description
                  <input
                    type="text"
                    maxLength={100}
                    value={item.description}
                    onChange={(event) => setItem(item.key, { description: event.target.value })}
                    className={`${INPUT_CLASS} w-48`}
                  />
                </label>
              )}
              <button
                type="button"
                onClick={() =>
                  set({ items: draft.items.filter((candidate) => candidate.key !== item.key) })
                }
                aria-label={`Remove role ${index + 1}`}
                className="ml-auto rounded-md px-2 py-1 text-sm text-zinc-400 hover:text-red-300"
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
        <div>
          <button
            type="button"
            onClick={() => set({ items: [...draft.items, toItem({})] })}
            disabled={draft.items.length >= MAX_ITEMS}
            className="rounded-md border border-edge px-3 py-1.5 text-sm text-zinc-200 hover:border-sakura disabled:opacity-60"
          >
            Add role
          </button>
        </div>
      </section>

      <PanelPreview draft={draft} roleNames={roleNames} />
    </div>
  );
}

function emojiText(emoji: string): string {
  const custom = /^<a?:(\w+):\d+>$/.exec(emoji.trim());
  return custom ? `:${custom[1]}:` : emoji.trim();
}

/** A rough picture of the message in Discord. */
function PanelPreview({ draft, roleNames }: { draft: Draft; roleNames: Map<string, string> }) {
  const rows: Item[][] = [];
  for (let start = 0; start < draft.items.length; start += 5) {
    rows.push(draft.items.slice(start, start + 5));
  }
  return (
    <section aria-label="Preview" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-zinc-200">Preview</h2>
      <div className="flex max-w-xl flex-col gap-2 rounded-md bg-[#313338] p-4 text-sm text-[#dbdee1]">
        <p className="font-semibold text-white">Ririko</p>
        {draft.content ? <p className="whitespace-pre-wrap">{draft.content}</p> : null}
        {draft.useEmbed && (draft.title || draft.description) ? (
          <div
            className="flex flex-col gap-1 rounded bg-[#2b2d31] p-3"
            style={{ borderLeft: `4px solid ${draft.color}` }}
          >
            {draft.title ? <p className="font-semibold text-white">{draft.title}</p> : null}
            {draft.description ? <p className="whitespace-pre-wrap">{draft.description}</p> : null}
          </div>
        ) : null}
        {draft.kind === 'BUTTONS' ? (
          rows.map((row, index) => (
            <div key={index} className="flex flex-wrap gap-2">
              {row.map((item) => (
                <span
                  key={item.key}
                  className="rounded px-3 py-1 text-sm font-medium text-white"
                  style={{ background: STYLE_COLORS[item.style] }}
                >
                  {[emojiText(item.emoji), item.label].filter(Boolean).join(' ') || '…'}
                </span>
              ))}
            </div>
          ))
        ) : (
          <details className="rounded border border-[#1e1f22] bg-[#1e1f22]">
            <summary className="cursor-pointer px-3 py-2 text-[#949ba4]">
              {draft.placeholder || 'Make a selection'}
            </summary>
            <ul className="flex flex-col">
              {draft.items.map((item) => (
                <li key={item.key} className="flex flex-col px-3 py-1.5">
                  <span>
                    {[emojiText(item.emoji), item.label || roleNames.get(item.roleId) || '…']
                      .filter(Boolean)
                      .join(' ')}
                  </span>
                  {item.description ? (
                    <span className="text-xs text-[#949ba4]">{item.description}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
