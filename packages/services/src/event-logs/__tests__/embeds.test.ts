import { describe, expect, it } from 'vitest';
import { FIELD_MAX, cut, userLine } from '../embeds.js';

describe('event log embed helpers (TASK-1993)', () => {
  it('cut keeps short text and ends a long text with an ellipsis at the limit', () => {
    expect(cut('short')).toBe('short');
    expect(cut('x'.repeat(FIELD_MAX))).toHaveLength(FIELD_MAX);
    const long = cut('x'.repeat(FIELD_MAX + 1));
    expect(long).toHaveLength(FIELD_MAX);
    expect(long.endsWith('…')).toBe(true);
    expect(cut('abcdef', 4)).toBe('abc…');
  });

  it('userLine gives the mention and ID, and the tag when it is known', () => {
    expect(userLine({ id: '1', tag: 'a#1' })).toBe('<@1> a#1 (1)');
    expect(userLine({ id: '1', tag: null })).toBe('<@1> (1)');
    expect(userLine({ id: '1' })).toBe('<@1> (1)');
  });
});
