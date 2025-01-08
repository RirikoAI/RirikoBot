import { Test, TestingModule } from '@nestjs/testing';
import SighCommand from './sigh.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('SighCommand', () => {
  let command: SighCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SighCommand],
    }).compile();

    command = module.get<SighCommand>(SighCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('sigh');
    expect(command.regex).toEqual(new RegExp('^sigh$|^sigh ', 'i'));
    expect(command.description).toBe(
      'Let out a deep sigh of exasperation, relief, or melancholy.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['sigh @user']);
    expect(command.reactionType).toBe('sigh');
    expect(command.content).toBe('let out a heavy sigh while looking at');
    expect(command.noTargetContent).toBe(
      'let out a deep sigh, staring into the distance with a wistful expression',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person who made you sigh deeply.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid sigh commands', () => {
      expect(command.regex.test('sigh')).toBe(true);
      expect(command.regex.test('sigh @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('sighs')).toBe(false);
      expect(command.regex.test('sighing')).toBe(false);
      expect(command.regex.test('sig')).toBe(false);
    });
  });
});
