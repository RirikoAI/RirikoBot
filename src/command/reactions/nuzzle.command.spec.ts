import { Test, TestingModule } from '@nestjs/testing';
import NuzzleCommand from './nuzzle.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('NuzzleCommand', () => {
  let command: NuzzleCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NuzzleCommand],
    }).compile();

    command = module.get<NuzzleCommand>(NuzzleCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('nuzzle');
    expect(command.regex).toEqual(new RegExp('^nuzzle$|^nuzzle ', 'i'));
    expect(command.description).toBe(
      'Snuggle up and gently nuzzle someone to show affection.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['nuzzle @user']);
    expect(command.reactionType).toBe('nuzzle');
    expect(command.content).toBe('nuzzled up close to');
    expect(command.noTargetContent).toBe(
      'curled up in a cozy spot and nuzzled into a soft blanket for comfort',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to nuzzle up to lovingly.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid nuzzle commands', () => {
      expect(command.regex.test('nuzzle')).toBe(true);
      expect(command.regex.test('nuzzle @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('nuzzles')).toBe(false);
      expect(command.regex.test('nuzzling')).toBe(false);
      expect(command.regex.test('nuz')).toBe(false);
    });
  });
});
