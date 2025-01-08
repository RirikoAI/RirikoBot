import { Test, TestingModule } from '@nestjs/testing';
import SmackCommand from './smack.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('SmackCommand', () => {
  let command: SmackCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SmackCommand],
    }).compile();

    command = module.get<SmackCommand>(SmackCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('smack');
    expect(command.regex).toEqual(new RegExp('^smack$|^smack ', 'i'));
    expect(command.description).toBe('Give someone a frustrated smack.');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['smack @user']);
    expect(command.reactionType).toBe('smack');
    expect(command.content).toBe('smacked');
    expect(command.noTargetContent).toBe(
      'smacked their own forehead, muttering under their breath',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to angrily smack.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid smack commands', () => {
      expect(command.regex.test('smack')).toBe(true);
      expect(command.regex.test('smack @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('smacks')).toBe(false);
      expect(command.regex.test('smacking')).toBe(false);
      expect(command.regex.test('sma')).toBe(false);
    });
  });
});
