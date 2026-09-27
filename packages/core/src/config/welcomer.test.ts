import { describe, expect, it } from 'vitest';
import {
  HexColorSetting,
  MAX_WELCOMER_MESSAGE_LENGTH,
  OptionalImageUrlSetting,
  WelcomerMessageSetting,
} from './welcomer.js';

describe('welcomer settings (TASK-1663)', () => {
  it('accepts #rrggbb colors only, stored lowercase', () => {
    expect(HexColorSetting.parse(' #FFAA00 ')).toBe('#ffaa00');
    expect(HexColorSetting.safeParse('red').success).toBe(false);
    expect(HexColorSetting.safeParse('#fff').success).toBe(false);
  });

  it('accepts http and https links and clears on empty or none', () => {
    expect(OptionalImageUrlSetting.parse(' https://example.com/bg.png ')).toBe(
      'https://example.com/bg.png',
    );
    expect(OptionalImageUrlSetting.parse('')).toBeNull();
    expect(OptionalImageUrlSetting.parse('none')).toBeNull();
    expect(OptionalImageUrlSetting.safeParse('file:///etc/passwd').success).toBe(false);
    expect(OptionalImageUrlSetting.safeParse('javascript:alert(1)').success).toBe(false);
    expect(OptionalImageUrlSetting.safeParse('not a link').success).toBe(false);
  });

  it('requires a message within the limit', () => {
    expect(WelcomerMessageSetting.parse('  Hi {user}  ')).toBe('Hi {user}');
    expect(WelcomerMessageSetting.safeParse('  ').success).toBe(false);
    expect(
      WelcomerMessageSetting.safeParse('x'.repeat(MAX_WELCOMER_MESSAGE_LENGTH + 1)).success,
    ).toBe(false);
  });
});
