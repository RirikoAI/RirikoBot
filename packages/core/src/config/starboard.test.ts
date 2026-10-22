import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STARBOARD_EMOJI,
  MAX_STARBOARD_IGNORED_CHANNELS,
  MAX_STARBOARD_THRESHOLD,
  parseStarboardEmoji,
  StarboardEmojiSetting,
} from './starboard.js';

describe('starboard emoji (TASK-2012)', () => {
  it('exports the defaults and limits', () => {
    expect(DEFAULT_STARBOARD_EMOJI).toBe('⭐');
    expect(MAX_STARBOARD_THRESHOLD).toBe(100);
    expect(MAX_STARBOARD_IGNORED_CHANNELS).toBe(25);
  });

  it('accepts one Unicode emoji, with or without a variation selector', () => {
    expect(StarboardEmojiSetting.parse('⭐')).toBe('⭐');
    expect(StarboardEmojiSetting.parse('⭐️')).toBe('⭐️');
    expect(StarboardEmojiSetting.parse('🌟')).toBe('🌟');
    expect(StarboardEmojiSetting.parse('👍🏽')).toBe('👍🏽');
    expect(StarboardEmojiSetting.parse('🇯🇵')).toBe('🇯🇵');
  });

  it('accepts a static and an animated custom emoji, and trims spaces', () => {
    expect(StarboardEmojiSetting.parse('<:pog:123456789012345678>')).toBe(
      '<:pog:123456789012345678>',
    );
    expect(StarboardEmojiSetting.parse('  <a:party_1:123456789012345678>\n')).toBe(
      '<a:party_1:123456789012345678>',
    );
  });

  it.each([
    ['text', 'star'],
    ['a letter', 'a'],
    ['a digit', '1'],
    ['empty', ''],
    ['spaces only', '   '],
    ['two emoji', '⭐⭐'],
    ['two emoji with a space', '⭐ 🌟'],
    ['an emoji and text', '⭐ star'],
    ['a custom emoji without an id', '<:pog:>'],
    ['a custom emoji with a short id', '<:pog:123>'],
    ['a custom emoji with a one-letter name', '<:p:123456789012345678>'],
    ['two custom emoji', '<:a1:123456789012345678><:b2:123456789012345678>'],
    ['a custom emoji with text', 'x<:pog:123456789012345678>'],
  ])('refuses %s with a plain message', (_label, value) => {
    const result = StarboardEmojiSetting.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('one emoji');
  });

  it('refuses a value that is not text', () => {
    expect(StarboardEmojiSetting.safeParse(5).success).toBe(false);
    expect(StarboardEmojiSetting.safeParse(undefined).success).toBe(false);
  });

  describe('parseStarboardEmoji', () => {
    it('gives the id and name of a custom emoji', () => {
      expect(parseStarboardEmoji('<:pog:123456789012345678>')).toEqual({
        id: '123456789012345678',
        name: 'pog',
      });
      expect(parseStarboardEmoji('<a:party:223456789012345678>')).toEqual({
        id: '223456789012345678',
        name: 'party',
      });
    });

    it('gives a null id for a Unicode emoji and drops the variation selector', () => {
      expect(parseStarboardEmoji('⭐')).toEqual({ id: null, name: '⭐' });
      expect(parseStarboardEmoji('⭐️')).toEqual({ id: null, name: '⭐' });
      expect(parseStarboardEmoji(' 🌟 ')).toEqual({ id: null, name: '🌟' });
    });
  });
});
