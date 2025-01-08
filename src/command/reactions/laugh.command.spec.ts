import { Test, TestingModule } from '@nestjs/testing';
import LaughCommand from './laugh.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('LaughCommand', () => {
  let command: LaughCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LaughCommand],
    }).compile();

    command = module.get<LaughCommand>(LaughCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('laugh');
    expect(command.regex).toEqual(new RegExp('^laugh$|^laugh ', 'i'));
    expect(command.description).toBe(
      'Burst into laughter and share the joy with someone.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['laugh @user']);
    expect(command.reactionType).toBe('laugh');
    expect(command.content).toBe('laughed heartily with');
    expect(command.noTargetContent).toBe('burst into uncontrollable laughter');
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description:
          'The person you want to laugh with or at (in good spirit, of course!).',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid laugh commands', () => {
      expect(command.regex.test('laugh')).toBe(true);
      expect(command.regex.test('laugh @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('laughs')).toBe(false);
      expect(command.regex.test('laughing')).toBe(false);
      expect(command.regex.test('lau')).toBe(false);
    });
  });
});
