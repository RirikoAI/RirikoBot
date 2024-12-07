import { table } from './cli-help.util';

describe('CliHelpUtil', () => {
  describe('table', () => {
    it('should format the table correctly', () => {
      const input = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ];

      const consoleSpy = jest
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      table(input);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Alice'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Bob'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('30'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('25'));

      consoleSpy.mockRestore();
    });
  });
});
