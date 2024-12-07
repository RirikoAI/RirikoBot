import { EconomyUtil } from './economy.util';

describe('EconomyUtil', () => {
  describe('calculateExp', () => {
    it('should return correct experience for level 0', () => {
      expect(EconomyUtil.calculateExpAndCoins(0)).toBe(0);
    });

    it('should return correct experience for level 1', () => {
      expect(EconomyUtil.calculateExpAndCoins(1)).toBe(5);
    });

    it('should return correct experience for level 2', () => {
      expect(EconomyUtil.calculateExpAndCoins(2)).toBe(10);
    });

    it('should return correct experience for level 3', () => {
      expect(EconomyUtil.calculateExpAndCoins(3)).toBe(20);
    });

    it('should return correct experience for level 10', () => {
      expect(EconomyUtil.calculateExpAndCoins(10)).toBeCloseTo(341.718);
    });

    it('should return correct experience for level 14', () => {
      expect(EconomyUtil.calculateExpAndCoins(14)).toBeCloseTo(1268.63);
    });
  });

  describe('calculateTotalExpForLevel', () => {
    it('should return correct total experience for level 0', () => {
      expect(EconomyUtil.calculateTotalExpForLevel(0)).toBe(0);
    });

    it('should return correct total experience for level 1', () => {
      expect(EconomyUtil.calculateTotalExpForLevel(1)).toBe(5);
    });

    it('should return correct total experience for level 2', () => {
      expect(EconomyUtil.calculateTotalExpForLevel(2)).toBe(15);
    });

    it('should return correct total experience for level 10', () => {
      expect(EconomyUtil.calculateTotalExpForLevel(10)).toBeCloseTo(1000.156);
    });
  });

  describe('getCurrentLevel', () => {
    it('should return correct level for 0 experience', () => {
      expect(EconomyUtil.getCurrentLevel(0)).toBe(0);
    });

    it('should return correct level for 5 experience', () => {
      expect(EconomyUtil.getCurrentLevel(5)).toBe(1);
    });

    it('should return correct level for 15 experience', () => {
      expect(EconomyUtil.getCurrentLevel(15)).toBe(2);
    });

    it('should return correct level for 528.75 experience', () => {
      expect(EconomyUtil.getCurrentLevel(528.75)).toBe(11);
    });
  });

  describe('getLevelTable', () => {
    it('should return a table with 101 levels', () => {
      const table = EconomyUtil.getLevelTable();
      expect(table).toHaveLength(101);
    });

    it('should return correct experience and coins for level 0', () => {
      const table = EconomyUtil.getLevelTable();
      expect(table[0]).toEqual({
        level: 0,
        expRequired: '0.000000',
        coinsReceivable: '0.000000',
      });
    });

    it('should return correct experience and coins for level 1', () => {
      const table = EconomyUtil.getLevelTable();
      expect(table[1]).toEqual({
        level: 1,
        expRequired: '5.000000',
        coinsReceivable: '5.000000',
      });
    });
  });
});
