import { Test, TestingModule } from '@nestjs/testing';
import ConfusedCommand from './confused.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('ConfusedCommand', () => {
  let command: ConfusedCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConfusedCommand],
    }).compile();

    command = module.get<ConfusedCommand>(ConfusedCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('confused');
    expect(command.regex).toEqual(new RegExp('^confused$|^confused ', 'i'));
    expect(command.description).toBe(
      'Tilt your head, scratch your chin, and show utter confusion toward someone.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['confused @user']);
    expect(command.reactionType).toBe('confused');
    expect(command.content).toBe('gave a bewildered look to');
    expect(command.noTargetContent).toBe(
      'looked around with a puzzled expression',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description:
          'The person who has you scratching your head in confusion.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid confused commands', () => {
      expect(command.regex.test('confused')).toBe(true);
      expect(command.regex.test('confused @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('confusing')).toBe(false);
      expect(command.regex.test('confusion')).toBe(false);
      expect(command.regex.test('confus')).toBe(false);
    });
  });
});
