import { Test, TestingModule } from '@nestjs/testing';
import PeekCommand from './peek.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('PeekCommand', () => {
  let command: PeekCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PeekCommand],
    }).compile();

    command = module.get<PeekCommand>(PeekCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('peek');
    expect(command.regex).toEqual(new RegExp('^peek$|^peek ', 'i'));
    expect(command.description).toBe('Sneak a shy or curious peek at someone.');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['peek @user']);
    expect(command.reactionType).toBe('peek');
    expect(command.content).toBe('peeked curiously at');
    expect(command.noTargetContent).toBe(
      'peeked around the corner cautiously, seeing nothing but their own shadow',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to sneak a peek at.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid peek commands', () => {
      expect(command.regex.test('peek')).toBe(true);
      expect(command.regex.test('peek @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('peeks')).toBe(false);
      expect(command.regex.test('peeking')).toBe(false);
      expect(command.regex.test('pee')).toBe(false);
    });
  });
});
