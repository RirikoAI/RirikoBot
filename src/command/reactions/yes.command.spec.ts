import { Test, TestingModule } from '@nestjs/testing';
import YesCommand from './yes.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('YesCommand', () => {
  let command: YesCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [YesCommand],
    }).compile();

    command = module.get<YesCommand>(YesCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('yes');
    expect(command.regex).toEqual(new RegExp('^yes$|^yes ', 'i'));
    expect(command.description).toBe(
      'Express your agreement or excitement with a resounding yes!',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['yes @user']);
    expect(command.reactionType).toBe('yes');
    expect(command.content).toBe('enthusiastically said yes to');
    expect(command.noTargetContent).toBe(
      'pumped their fist in the air and shouted "Yes!" with boundless enthusiasm',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to agree with.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid yes commands', () => {
      expect(command.regex.test('yes')).toBe(true);
      expect(command.regex.test('yes @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('yess')).toBe(false);
      expect(command.regex.test('yessing')).toBe(false);
      expect(command.regex.test('ye')).toBe(false);
    });
  });
});
