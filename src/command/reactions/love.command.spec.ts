import { Test, TestingModule } from '@nestjs/testing';
import LoveCommand from './love.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('LoveCommand', () => {
  let command: LoveCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LoveCommand],
    }).compile();

    command = module.get<LoveCommand>(LoveCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('love');
    expect(command.regex).toEqual(new RegExp('^love$|^love ', 'i'));
    expect(command.description).toBe(
      'Express your love and affection for someone special.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['love @user']);
    expect(command.reactionType).toBe('love');
    expect(command.content).toBe('shared heartfelt love with');
    expect(command.noTargetContent).toBe(
      'sent love into the world, embracing their own heart with warmth',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to shower with love.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid love commands', () => {
      expect(command.regex.test('love')).toBe(true);
      expect(command.regex.test('love @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('loves')).toBe(false);
      expect(command.regex.test('loving')).toBe(false);
      expect(command.regex.test('lov')).toBe(false);
    });
  });
});
