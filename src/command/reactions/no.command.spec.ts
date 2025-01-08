import { Test, TestingModule } from '@nestjs/testing';
import NoCommand from './no.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('NoCommand', () => {
  let command: NoCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NoCommand],
    }).compile();

    command = module.get<NoCommand>(NoCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('no');
    expect(command.regex).toEqual(new RegExp('^no$|^no ', 'i'));
    expect(command.description).toBe(
      'Firmly reject or refuse someone’s actions or words.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['no @user']);
    expect(command.reactionType).toBe('no');
    expect(command.content).toBe('shook their head and said no to');
    expect(command.noTargetContent).toBe(
      'crossed their arms and said a firm "No!" to the universe',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to emphatically say no to.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid no commands', () => {
      expect(command.regex.test('no')).toBe(true);
      expect(command.regex.test('no @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('nos')).toBe(false);
      expect(command.regex.test('nono')).toBe(false);
      expect(command.regex.test('n')).toBe(false);
    });
  });
});
