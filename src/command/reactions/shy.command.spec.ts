import { Test, TestingModule } from '@nestjs/testing';
import ShyCommand from './shy.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('ShyCommand', () => {
  let command: ShyCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShyCommand],
    }).compile();

    command = module.get<ShyCommand>(ShyCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('shy');
    expect(command.regex).toEqual(new RegExp('^shy$|^shy ', 'i'));
    expect(command.description).toBe(
      'Blush and act shy around someone, avoiding eye contact.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['shy @user']);
    expect(command.reactionType).toBe('shy');
    expect(command.content).toBe('acted shy around');
    expect(command.noTargetContent).toBe('is being shy of everyone');
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person who makes you feel bashful and shy.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid shy commands', () => {
      expect(command.regex.test('shy')).toBe(true);
      expect(command.regex.test('shy @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('shys')).toBe(false);
      expect(command.regex.test('shying')).toBe(false);
      expect(command.regex.test('sh')).toBe(false);
    });
  });
});
