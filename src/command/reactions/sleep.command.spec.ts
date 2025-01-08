import { Test, TestingModule } from '@nestjs/testing';
import SleepCommand from './sleep.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('SleepCommand', () => {
  let command: SleepCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SleepCommand],
    }).compile();

    command = module.get<SleepCommand>(SleepCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('sleep');
    expect(command.regex).toEqual(new RegExp('^sleep$|^sleep ', 'i'));
    expect(command.description).toBe(
      'Drift off into dreamland, maybe near someone for comfort.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['sleep @user']);
    expect(command.reactionType).toBe('sleep');
    expect(command.content).toBe('fell asleep peacefully next to');
    expect(command.noTargetContent).toBe(
      'curled up in a cozy spot and drifted off into a peaceful slumber',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to sleep near for warmth and comfort.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid sleep commands', () => {
      expect(command.regex.test('sleep')).toBe(true);
      expect(command.regex.test('sleep @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('sleeps')).toBe(false);
      expect(command.regex.test('sleeping')).toBe(false);
      expect(command.regex.test('slee')).toBe(false);
    });
  });
});
