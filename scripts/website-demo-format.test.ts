import { describe, expect, it } from 'vitest';
import {
  colorHex,
  coverHue,
  formatClock,
  formatShortClock,
  layoutFields,
  parseMarkdown,
} from '../website/src/components/DiscordDemo/format.js';

describe('parseMarkdown', () => {
  it('reads bold, italic, code, links, mentions and newlines', () => {
    expect(parseMarkdown('🏓 **Pong!**\n• Latency: `42ms`')).toEqual([
      { type: 'text', text: '🏓 ' },
      { type: 'bold', children: [{ type: 'text', text: 'Pong!' }] },
      { type: 'br' },
      { type: 'text', text: '• Latency: ' },
      { type: 'code', text: '42ms' },
    ]);
    expect(parseMarkdown('*Now Playing* for <@Aiko>')).toEqual([
      { type: 'italic', children: [{ type: 'text', text: 'Now Playing' }] },
      { type: 'text', text: ' for ' },
      { type: 'mention', name: 'Aiko' },
    ]);
    expect(parseMarkdown('**[Lofi](https://ririko.ai)**')).toEqual([
      {
        type: 'bold',
        children: [{ type: 'link', children: [{ type: 'text', text: 'Lofi' }] }],
      },
    ]);
  });

  it('keeps markers inside code as text and nests code in bold', () => {
    expect(parseMarkdown('`**not bold**`')).toEqual([{ type: 'code', text: '**not bold**' }]);
    expect(parseMarkdown('**Level `1 / 50`**')).toEqual([
      {
        type: 'bold',
        children: [
          { type: 'text', text: 'Level ' },
          { type: 'code', text: '1 / 50' },
        ],
      },
    ]);
  });

  it('leaves unmatched markers as plain text, so nothing typed is lost', () => {
    expect(parseMarkdown('2 * 3 = 6')).toEqual([{ type: 'text', text: '2 * 3 = 6' }]);
    expect(parseMarkdown('**open')).toEqual([{ type: 'text', text: '**open' }]);
    expect(parseMarkdown('a `b')).toEqual([{ type: 'text', text: 'a `b' }]);
    expect(parseMarkdown('[x](no link')).toEqual([{ type: 'text', text: '[x](no link' }]);
    expect(parseMarkdown('<b>')).toEqual([{ type: 'text', text: '<b>' }]);
    expect(parseMarkdown('*a\nb*')).toEqual([
      { type: 'text', text: '*a' },
      { type: 'br' },
      { type: 'text', text: 'b*' },
    ]);
  });

  it('reads the progress bar as a slider with units before and after the knob', () => {
    expect(parseMarkdown('▬▬▬🔘▬▬\n`0:42`')).toEqual([
      { type: 'slider', before: 3, after: 2 },
      { type: 'br' },
      { type: 'code', text: '0:42' },
    ]);
    expect(parseMarkdown('🔘▬▬')).toEqual([{ type: 'slider', before: 0, after: 2 }]);
    expect(parseMarkdown('`1:00` ▬🔘 `3:00`')).toEqual([
      { type: 'code', text: '1:00' },
      { type: 'text', text: ' ' },
      { type: 'slider', before: 1, after: 0 },
      { type: 'text', text: ' ' },
      { type: 'code', text: '3:00' },
    ]);
    // A bar without its knob is just text.
    expect(parseMarkdown('▬▬▬')).toEqual([{ type: 'text', text: '▬▬▬' }]);
  });

  it('reads relative times next to other text', () => {
    expect(parseMarkdown('Expires <t:in 5 minutes>.')).toEqual([
      { type: 'text', text: 'Expires ' },
      { type: 'time', text: 'in 5 minutes' },
      { type: 'text', text: '.' },
    ]);
    expect(parseMarkdown('a <t: b')).toEqual([{ type: 'text', text: 'a <t: b' }]);
  });

  it('returns nothing for empty text', () => {
    expect(parseMarkdown('')).toEqual([]);
  });
});

describe('layoutFields', () => {
  const field = (name: string, inline = true) => ({ name, value: name, inline });

  it('puts up to three inline fields on a row and splits the row evenly', () => {
    const placed = layoutFields([field('a'), field('b'), field('c'), field('d')]);
    expect(placed.map((p) => p.column)).toEqual(['1 / 5', '5 / 9', '9 / 13', '1 / 13']);
  });

  it('keeps three per row next to a thumbnail, as the client does', () => {
    const placed = layoutFields([field('a'), field('b'), field('c')]);
    expect(placed.map((p) => p.column)).toEqual(['1 / 5', '5 / 9', '9 / 13']);
  });

  it('gives non-inline fields a full row and starts a new run after them', () => {
    const placed = layoutFields([field('a'), field('wide', false), field('b'), field('c')]);
    expect(placed.map((p) => [p.field.name, p.column])).toEqual([
      ['a', '1 / 13'],
      ['wide', '1 / 13'],
      ['b', '1 / 7'],
      ['c', '7 / 13'],
    ]);
  });
});

describe('formatShortClock, formatClock and colorHex', () => {
  it('writes the short time beside an author', () => {
    const at = new Date(2026, 9, 16, 21, 37).getTime();
    expect(formatShortClock(at, 'en-GB')).toBe('21:37');
    expect(formatShortClock(at, 'en-US')).toMatch(/^9:37\sPM$/);
  });

  it('writes the time of day in the given locale', () => {
    const at = new Date(2026, 9, 16, 14, 5).getTime();
    expect(formatClock(at, 'en-GB')).toBe('Today at 14:05');
    expect(formatClock(at, 'en-US')).toMatch(/^Today at 2:05\sPM$/);
  });

  it('writes colours as hex', () => {
    expect(colorHex(0x5865f2)).toBe('#5865f2');
    expect(colorHex(0x0000ff)).toBe('#0000ff');
  });
});

describe('coverHue', () => {
  it('gives each title a stable hue between 0 and 359', () => {
    expect(coverHue('Lofi Hip Hop Radio')).toBe(coverHue('Lofi Hip Hop Radio'));
    expect(coverHue('Lofi Hip Hop Radio')).not.toBe(coverHue('City Pop'));
    expect(coverHue('')).toBe(0);
    for (const title of ['a', 'City Pop', 'x'.repeat(500)]) {
      expect(coverHue(title)).toBeGreaterThanOrEqual(0);
      expect(coverHue(title)).toBeLessThan(360);
    }
  });
});
