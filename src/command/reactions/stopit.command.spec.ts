import { Test, TestingModule } from '@nestjs/testing';
import StopCommand from './stopit.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('StopCommand', () => {
  let command: StopCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StopCommand],
    }).compile();

    command = module.get<StopCommand>(StopCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('stopit');
    expect(command.regex).toEqual(new RegExp('^stopit$|^stopit ', 'i'));
    expect(command.description).toBe(
      'Tell someone to halt or cease whatever they’re doing.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['stopit @user']);
    expect(command.reactionType).toBe('stop');
    expect(command.content).toBe('firmly demanded a stop from');
    expect(command.noTargetContent).toBe(
      'held up a hand and shouted "Stop!" into the empty air, standing their ground',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to tell to stop.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid stopit commands', () => {
      expect(command.regex.test('stopit')).toBe(true);
      expect(command.regex.test('stopit @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('stop')).toBe(false);
      expect(command.regex.test('stopping')).toBe(false);
      expect(command.regex.test('sto')).toBe(false);
    });
  });
});
