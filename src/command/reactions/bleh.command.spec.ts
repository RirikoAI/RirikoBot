import { Test, TestingModule } from '@nestjs/testing';
import BlehCommand from './bleh.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('BlehCommand', () => {
  let command: BlehCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BlehCommand],
    }).compile();

    command = module.get<BlehCommand>(BlehCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('bleh');
    expect(command.regex).toEqual(new RegExp('^bleh$|^bleh ', 'i'));
    expect(command.description).toBe('Make a bleh expression.');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['bleh @user']);
    expect(command.reactionType).toBe('bleh');
    expect(command.content).toBe('made a bleh expression at');
    expect(command.noTargetContent).toBe(
      'stuck out their tongue and made a bleh expression',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to make a bleh expression at',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid bleh commands', () => {
      expect(command.regex.test('bleh')).toBe(true);
      expect(command.regex.test('bleh @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('blehh')).toBe(false);
      expect(command.regex.test('bleh-ing')).toBe(false);
      expect(command.regex.test('ble')).toBe(false);
    });
  });
});
