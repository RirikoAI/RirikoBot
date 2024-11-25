// string.util.test.ts
import { StringUtil } from './string.util';

describe('StringUtil', () => {
  test('capitalize should capitalize the first letter of a string', () => {
    expect(StringUtil.capitalize('hello')).toBe('Hello');
  });

  test('capitalize should return an empty string if input is empty', () => {
    expect(StringUtil.capitalize('')).toBe('');
  });

  test('capitalize should handle single character strings', () => {
    expect(StringUtil.capitalize('a')).toBe('A');
  });

  test('capitalize should not change the rest of the string', () => {
    expect(StringUtil.capitalize('hELLO')).toBe('HELLO');
  });
});
