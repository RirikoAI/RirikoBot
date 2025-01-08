import { Test, TestingModule } from '@nestjs/testing';
import TiredCommand from './tired.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('TiredCommand', () => {
  let command: TiredCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TiredCommand],
    }).compile();

    command = module.get<TiredCommand>(TiredCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('tired');
    expect(command.regex).toEqual(new RegExp('^tired$|^tired ', 'i'));
    expect(command.description).toBe('Show someone just how exhausted you are.');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['tired @user']);
    expect(command.reactionType).toBe('tired');
    expect(command.content).toBe('looked utterly tired while glancing at');
    expect(command.noTargetContent).toBe(
      'rubbed their eyes and let out a deep yawn, looking completely drained',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person who can see how drained you feel.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid tired commands', () => {
      expect(command.regex.test('tired')).toBe(true);
      expect(command.regex.test('tired @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('tireds')).toBe(false);
      expect(command.regex.test('tiring')).toBe(false);
      expect(command.regex.test('tir')).toBe(false);
    });
  });
});
