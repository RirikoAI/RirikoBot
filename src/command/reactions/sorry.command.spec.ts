import { Test, TestingModule } from '@nestjs/testing';
import SorryCommand from './sorry.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('SorryCommand', () => {
  let command: SorryCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SorryCommand],
    }).compile();

    command = module.get<SorryCommand>(SorryCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('sorry');
    expect(command.regex).toEqual(new RegExp('^sorry$|^sorry ', 'i'));
    expect(command.description).toBe(
      'Apologize sincerely or sheepishly to someone.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['sorry @user']);
    expect(command.reactionType).toBe('sorry');
    expect(command.content).toBe('apologized sincerely to');
    expect(command.noTargetContent).toBe(
      'looked down apologetically, muttering a heartfelt "I’m sorry"',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to say sorry to.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid sorry commands', () => {
      expect(command.regex.test('sorry')).toBe(true);
      expect(command.regex.test('sorry @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('sorries')).toBe(false);
      expect(command.regex.test('sorrying')).toBe(false);
      expect(command.regex.test('sorr')).toBe(false);
    });
  });
});
