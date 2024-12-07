import { EnumUtil } from './enum.util';

enum SampleEnum {
  FIRST = 'first_value',
  SECOND = 'second_value',
  THIRD = 'third_value',
}

describe('EnumUtil', () => {
  describe('getEnumKeyByEnumValue', () => {
    it('should return correct key for a given value', () => {
      expect(EnumUtil.getEnumKeyByEnumValue(SampleEnum, 'first_value')).toBe(
        'FIRST',
      );
      expect(EnumUtil.getEnumKeyByEnumValue(SampleEnum, 'second_value')).toBe(
        'SECOND',
      );
      expect(EnumUtil.getEnumKeyByEnumValue(SampleEnum, 'third_value')).toBe(
        'THIRD',
      );
    });

    it('should return null for a non-existing value', () => {
      expect(
        EnumUtil.getEnumKeyByEnumValue(SampleEnum, 'non_existing_value'),
      ).toBeNull();
    });

    it('should return null for an empty value', () => {
      expect(EnumUtil.getEnumKeyByEnumValue(SampleEnum, '')).toBeNull();
    });

    it('should return null for a null value', () => {
      expect(EnumUtil.getEnumKeyByEnumValue(SampleEnum, null)).toBeNull();
    });

    it('should return null for an undefined value', () => {
      expect(EnumUtil.getEnumKeyByEnumValue(SampleEnum, undefined)).toBeNull();
    });
  });
});
