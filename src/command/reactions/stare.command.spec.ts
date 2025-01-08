import { Test, TestingModule } from '@nestjs/testing';
import StareCommand from './stare.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('StareCommand', () => {
  let command: StareCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StareCommand],
    }).compile();

    command = module.get<StareCommand>(StareCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('stare');
    expect(command.regex).toEqual(new RegExp('^stare$|^stare ', 'i'));
    expect(command.description).toBe(
      'Fix your gaze on someone with intensity, curiosity, or confusion.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['stare @user']);
    expect(command.reactionType).toBe('stare');
    expect(command.content).toBe('stared intently at');
    expect(command.noTargetContent).toBe(
      'fixed their gaze on the wall, lost in their own thoughts',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to fix your gaze upon.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid stare commands', () => {
      expect(command.regex.test('stare')).toBe(true);
      expect(command.regex.test('stare @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('stares')).toBe(false);
      expect(command.regex.test('staring')).toBe(false);
      expect(command.regex.test('sta')).toBe(false);
    });
  });
});
