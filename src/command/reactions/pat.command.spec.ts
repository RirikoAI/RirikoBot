import { Test, TestingModule } from '@nestjs/testing';
import PatCommand from './pat.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('PatCommand', () => {
  let command: PatCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PatCommand],
    }).compile();

    command = module.get<PatCommand>(PatCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('pat');
    expect(command.regex).toEqual(new RegExp('^pat$|^pat ', 'i'));
    expect(command.description).toBe(
      'Give someone a gentle pat on the head to show they’re appreciated!',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['pat @user']);
    expect(command.reactionType).toBe('pat');
    expect(command.content).toBe('gently patted');
    expect(command.noTargetContent).toBe(
      'patted the air awkwardly, hoping someone would appear to receive it',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The adorable person you want to give a comforting pat to.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid pat commands', () => {
      expect(command.regex.test('pat')).toBe(true);
      expect(command.regex.test('pat @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('pats')).toBe(false);
      expect(command.regex.test('patting')).toBe(false);
      expect(command.regex.test('pa')).toBe(false);
    });
  });
});
