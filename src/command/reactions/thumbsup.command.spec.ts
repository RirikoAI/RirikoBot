import { Test, TestingModule } from '@nestjs/testing';
import ThumbsUpCommand from './thumbsup.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('ThumbsUpCommand', () => {
  let command: ThumbsUpCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ThumbsUpCommand],
    }).compile();

    command = module.get<ThumbsUpCommand>(ThumbsUpCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('thumbsup');
    expect(command.regex).toEqual(new RegExp('^thumbsup$|^thumbsup ', 'i'));
    expect(command.description).toBe('Give someone an approving thumbs-up!');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['thumbsup @user']);
    expect(command.reactionType).toBe('thumbsup');
    expect(command.content).toBe('gave a confident thumbs-up to');
    expect(command.noTargetContent).toBe(
      'raised a confident thumbs-up to the air, brimming with positivity',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to show approval or encouragement to.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid thumbsup commands', () => {
      expect(command.regex.test('thumbsup')).toBe(true);
      expect(command.regex.test('thumbsup @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('thumbsups')).toBe(false);
      expect(command.regex.test('thumbsuping')).toBe(false);
      expect(command.regex.test('thumb')).toBe(false);
    });
  });
});
