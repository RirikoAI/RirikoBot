import { describe, expect, it } from 'vitest';
import { elements, render, textOf } from '../../../../tests/support/markup';
import { TopCommands } from './top-commands';

describe('TopCommands', () => {
  const commands = [
    { commandName: 'play', count: 1200 },
    { commandName: 'help', count: 300 },
    { commandName: 'ban', count: 1 },
  ];

  it('lists each command with its count, most used first', () => {
    const html = render(<TopCommands commands={commands} />);
    expect(elements(html, 'li')).toHaveLength(3);
    expect(textOf(html)).toBe('play 1,200 help 300 ban 1');
  });

  it('scales every bar to the busiest command', () => {
    const bars = elements(render(<TopCommands commands={commands} />), 'rect');
    // Each row has a track (full width) and a bar; the busiest bar fills the track.
    expect(bars.map((rect) => rect['width'])).toEqual([
      '100',
      '100',
      '100',
      '25',
      '100',
      String((1 / 1200) * 100),
    ]);
  });

  it('says so when there are no commands', () => {
    const html = render(<TopCommands commands={[]} />);
    expect(textOf(html)).toBe('None yet.');
    expect(elements(html, 'li')).toHaveLength(0);
  });
});
