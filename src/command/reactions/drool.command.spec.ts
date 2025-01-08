import { Test, TestingModule } from '@nestjs/testing';
import DroolCommand from './drool.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('DroolCommand', () => {
  let command: DroolCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DroolCommand],
    }).compile();

    command = module.get<DroolCommand>(DroolCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('drool');
    expect(command.regex).toEqual(new RegExp('^drool$|^drool ', 'i'));
    expect(command.description).toBe(
      'Let your jaw drop and drool over someone who is just that amazing.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['drool @user']);
    expect(command.reactionType).toBe('drool');
    expect(command.content).toBe('was left drooling over');
    expect(command.noTargetContent).toBe(
      'stared into space, drooling over thoughts too good to handle',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person who has you totally awestruck and drooling.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid drool commands', () => {
      expect(command.regex.test('drool')).toBe(true);
      expect(command.regex.test('drool @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('drools')).toBe(false);
      expect(command.regex.test('drooling')).toBe(false);
      expect(command.regex.test('dro')).toBe(false);
    });
  });
});
