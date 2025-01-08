import { Test, TestingModule } from '@nestjs/testing';
import SadCommand from './sad.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('SadCommand', () => {
  let command: SadCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SadCommand],
    }).compile();

    command = module.get<SadCommand>(SadCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('sad');
    expect(command.regex).toEqual(new RegExp('^sad$|^sad ', 'i'));
    expect(command.description).toBe('Express your sadness to someone.');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['sad @user']);
    expect(command.reactionType).toBe('sad');
    expect(command.content).toBe('looked sad while thinking about');
    expect(command.noTargetContent).toBe(
      'sat quietly with a heavy heart, lost in their own thoughts of sadness',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to share your sadness with.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid sad commands', () => {
      expect(command.regex.test('sad')).toBe(true);
      expect(command.regex.test('sad @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('sads')).toBe(false);
      expect(command.regex.test('sadness')).toBe(false);
      expect(command.regex.test('sa')).toBe(false);
    });
  });
});
