import { Test, TestingModule } from '@nestjs/testing';
import BrofistCommand from './brofist.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('BrofistCommand', () => {
  let command: BrofistCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BrofistCommand],
    }).compile();

    command = module.get<BrofistCommand>(BrofistCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('brofist');
    expect(command.regex).toEqual(new RegExp('^brofist$|^brofist ', 'i'));
    expect(command.description).toBe(
      'Send an epic brofist to show some solidarity or camaraderie.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['brofist @user']);
    expect(command.reactionType).toBe('brofist');
    expect(command.content).toBe('threw a legendary brofist at');
    expect(command.noTargetContent).toBe(
      'threw a brofist into the air, radiating pure camaraderie to everyone and no one',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The legend you want to share an epic brofist with.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid brofist commands', () => {
      expect(command.regex.test('brofist')).toBe(true);
      expect(command.regex.test('brofist @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('brofists')).toBe(false);
      expect(command.regex.test('bro fist')).toBe(false);
      expect(command.regex.test('bro')).toBe(false);
    });
  });
});
