/**
 * Pure formatting helpers for the demo: a small markdown reader for the subset the bot uses,
 * the embed field grid, and message timestamps.
 */

import type { DemoField } from './types';

export type MdNode =
  | { type: 'text'; text: string }
  | { type: 'br' }
  | { type: 'code'; text: string }
  | { type: 'bold'; children: MdNode[] }
  | { type: 'italic'; children: MdNode[] }
  | { type: 'link'; children: MdNode[] }
  | { type: 'mention'; name: string }
  /** A relative time like the client draws `<t:1700000000:R>`; the demo writes the words itself. */
  | { type: 'time'; text: string }
  /** The bot's text progress bar (`▬▬🔘▬▬`), drawn as a slider: units before and after the knob. */
  | { type: 'slider'; before: number; after: number };

const LINK = /^\[([^\]\n]+)\]\(([^)\s]+)\)/;
const MENTION = /^<@([^>\n]+)>/;
const TIME = /^<t:([^>\n]+)>/;
const SLIDER = /^(▬*)🔘(▬*)/u;

/**
 * Reads `**bold**`, `*italic*`, `` `code` ``, `[text](url)`, `<@name>` mentions, `<t:in 5 minutes>`
 * times, the `▬▬🔘▬▬` progress bar and newlines.
 * A marker without its closing pair stays as plain text, so nothing the visitor types is lost.
 */
export function parseMarkdown(source: string): MdNode[] {
  const nodes: MdNode[] = [];
  let text = '';
  const flush = (): void => {
    if (text !== '') nodes.push({ type: 'text', text });
    text = '';
  };

  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const char = source[i];

    if (char === '\n') {
      flush();
      nodes.push({ type: 'br' });
      i += 1;
      continue;
    }
    if (char === '`') {
      const end = source.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        nodes.push({ type: 'code', text: source.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (rest.startsWith('**')) {
      const end = source.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        nodes.push({ type: 'bold', children: parseMarkdown(source.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (char === '*' && source[i + 1] !== '*' && source[i + 1] !== ' ') {
      const end = findSingleStar(source, i + 1);
      if (end > i + 1) {
        flush();
        nodes.push({ type: 'italic', children: parseMarkdown(source.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (char === '[') {
      const match = LINK.exec(rest);
      if (match) {
        flush();
        nodes.push({ type: 'link', children: parseMarkdown(match[1] ?? '') });
        i += match[0].length;
        continue;
      }
    }
    if (char === '<') {
      const match = MENTION.exec(rest);
      if (match) {
        flush();
        nodes.push({ type: 'mention', name: match[1] ?? '' });
        i += match[0].length;
        continue;
      }
      const time = TIME.exec(rest);
      if (time) {
        flush();
        nodes.push({ type: 'time', text: time[1] ?? '' });
        i += time[0].length;
        continue;
      }
    }
    if (rest.startsWith('▬') || rest.startsWith('🔘')) {
      const match = SLIDER.exec(rest);
      if (match) {
        flush();
        nodes.push({
          type: 'slider',
          before: (match[1] ?? '').length,
          after: (match[2] ?? '').length,
        });
        i += match[0].length;
        continue;
      }
    }
    text += char;
    i += 1;
  }
  flush();
  return nodes;
}

/** The next `*` that is not part of `**`, on the same line; -1 if none. */
function findSingleStar(source: string, from: number): number {
  for (let i = from; i < source.length; i += 1) {
    if (source[i] === '\n') return -1;
    if (source[i] === '*') {
      if (source[i + 1] === '*') {
        i += 1;
        continue;
      }
      return source[i - 1] === ' ' ? -1 : i;
    }
  }
  return -1;
}

export interface PlacedField {
  field: DemoField;
  /** CSS grid column, on a 12-column grid: `1 / 13` is a full row. */
  column: string;
}

/**
 * Places embed fields like the client does: consecutive inline fields share a row, up to three
 * per row (a thumbnail does not change that), and split the row evenly; others take a full row.
 */
export function layoutFields(fields: DemoField[]): PlacedField[] {
  const perRow = 3;
  const placed: PlacedField[] = [];
  let run: DemoField[] = [];
  const closeRun = (): void => {
    for (let start = 0; start < run.length; start += perRow) {
      const row = run.slice(start, start + perRow);
      const span = 12 / row.length;
      row.forEach((field, index) => {
        placed.push({ field, column: `${1 + index * span} / ${1 + (index + 1) * span}` });
      });
    }
    run = [];
  };
  for (const field of fields) {
    if (field.inline) {
      run.push(field);
    } else {
      closeRun();
      placed.push({ field, column: '1 / 13' });
    }
  }
  closeRun();
  return placed;
}

/** "14:05" (or "2:05 PM"): the time beside a message author, in the given locale. */
export function formatShortClock(at: number, locale?: string): string {
  return new Date(at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

/** "Today at 14:05" (or "Today at 2:05 PM"), in the given locale. */
export function formatClock(at: number, locale?: string): string {
  const time = new Date(at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  return `Today at ${time}`;
}

/** `0x5865f2` as `#5865f2`. */
export function colorHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** A stable hue from a title, so each generated cover looks different. */
export function coverHue(title: string): number {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360;
  return hash;
}
