import RegexHelperUtil from '#util/command/regex-helper.util';

describe('RegexHelperUtil', () => {
  describe('getPrefixRegExp', () => {
    it('should return a RegExp that matches the given prefix case-insensitively', () => {
      const prefix = '!';
      const regex = RegexHelperUtil.getPrefixRegExp(prefix);
      expect(regex.test('!command')).toBe(true);
      expect(regex.test('!Command')).toBe(true);
      expect(regex.test('command')).toBe(false);
    });

    it('should escape special characters in the prefix', () => {
      const prefix = '.';
      const regex = RegexHelperUtil.getPrefixRegExp(prefix);
      expect(regex.test('.command')).toBe(true);
      expect(regex.test('command')).toBe(false);
    });
  });

  describe('escapePrefixForRegexp', () => {
    it('should escape special characters', () => {
      const specialChars = [
        '.',
        '/',
        '+',
        '\\',
        '*',
        '!',
        '?',
        ')',
        '(',
        '[',
        ']',
        '{',
        '}',
        '^',
        '$',
      ];
      specialChars.forEach((char) => {
        const escaped = RegexHelperUtil.escapePrefixForRegexp(char);
        expect(escaped).toBe(`\\${char}`);
      });
    });

    it('should not escape non-special characters', () => {
      const prefix = 'a';
      const escaped = RegexHelperUtil.escapePrefixForRegexp(prefix);
      expect(escaped).toBe(prefix);
    });
  });
});
