import { describe, expect, it } from 'vitest';
import {
  HexColorSetting,
  MAX_WELCOMER_MESSAGE_LENGTH,
  MAX_WELCOMER_TEXT_LENGTH,
  OptionalImageUrlSetting,
  WELCOMER_TEXT_REQUIRED_MESSAGE,
  WELCOMER_TEXT_VARIABLES,
  WelcomerMessageSetting,
  WelcomerTextSetting,
  welcomerTextProblem,
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

describe('welcomer text message rules (TASK-1333)', () => {
  it('trims the text, allows it empty and caps it at the Discord message limit', () => {
    expect(WelcomerTextSetting.parse('  Read #rules  ')).toBe('Read #rules');
    expect(WelcomerTextSetting.parse('   ')).toBe('');
    expect(WelcomerTextSetting.parse('x'.repeat(MAX_WELCOMER_TEXT_LENGTH))).toHaveLength(2000);
    const tooLong = WelcomerTextSetting.safeParse('x'.repeat(MAX_WELCOMER_TEXT_LENGTH + 1));
    expect(tooLong.success).toBe(false);
    expect(WelcomerTextSetting.safeParse(5).success).toBe(false);
  });

  it('lists the placeholders the text can use', () => {
    expect(WELCOMER_TEXT_VARIABLES).toEqual(['user', 'username', 'server', 'memberCount']);
  });

  it('reports a text that is on without any text, and nothing else', () => {
    expect(welcomerTextProblem({ textMessageEnabled: true, textMessage: '' })).toBe(
      WELCOMER_TEXT_REQUIRED_MESSAGE,
    );
    expect(welcomerTextProblem({ textMessageEnabled: true, textMessage: '  ' })).toBe(
      'Enter the text message, or turn it off.',
    );
    expect(welcomerTextProblem({ textMessageEnabled: true, textMessage: 'Hi' })).toBeNull();
    expect(welcomerTextProblem({ textMessageEnabled: false, textMessage: '' })).toBeNull();
  });
});
