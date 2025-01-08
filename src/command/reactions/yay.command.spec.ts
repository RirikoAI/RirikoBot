import { Test, TestingModule } from '@nestjs/testing';
import YayCommand from './yay.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('YayCommand', () => {
  let command: YayCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [YayCommand],
    }).compile();

    command = module.get<YayCommand>(YayCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('yay');
    expect(command.regex).toEqual(new RegExp('^yay$|^yay ', 'i'));
    expect(command.description).toBe('Express excitement or joy with a cheerful "Yay!"');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['yay @user']);
    expect(command.reactionType).toBe('yay');
    expect(command.content).toBe('cheered excitedly at');
    expect(command.noTargetContent).toBe(
      'threw their hands in the air and shouted "Yay!" with pure joy',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to share your excitement or joy with.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid yay commands', () => {
      expect(command.regex.test('yay')).toBe(true);
      expect(command.regex.test('yay @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('yays')).toBe(false);
      expect(command.regex.test('yaying')).toBe(false);
      expect(command.regex.test('ya')).toBe(false);
    });
  });
});
