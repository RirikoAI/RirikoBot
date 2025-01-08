import { Test, TestingModule } from '@nestjs/testing';
import KissCommand from './kiss.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('KissCommand', () => {
  let command: KissCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KissCommand],
    }).compile();

    command = module.get<KissCommand>(KissCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('kiss');
    expect(command.regex).toEqual(new RegExp('^kiss$|^kiss ', 'i'));
    expect(command.description).toBe(
      'Plant a sweet kiss on someone to show your affection.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['kiss @user']);
    expect(command.reactionType).toBe('kiss');
    expect(command.content).toBe('gave a sweet kiss to');
    expect(command.noTargetContent).toBe(
      'made a valiant effort trying to kiss themselves',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The lucky person you want to share a kiss with.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid kiss commands', () => {
      expect(command.regex.test('kiss')).toBe(true);
      expect(command.regex.test('kiss @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('kisses')).toBe(false);
      expect(command.regex.test('kissing')).toBe(false);
      expect(command.regex.test('kis')).toBe(false);
    });
  });
});
