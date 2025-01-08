import { Test, TestingModule } from '@nestjs/testing';
import HugCommand from './hug.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('HugCommand', () => {
  let command: HugCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HugCommand],
    }).compile();

    command = module.get<HugCommand>(HugCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('hug');
    expect(command.regex).toEqual(new RegExp('^hug$|^hug ', 'i'));
    expect(command.description).toBe(
      'Wrap your arms around someone to show them some love and care!',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['hug @user']);
    expect(command.reactionType).toBe('hug');
    expect(command.content).toBe('wrapped themselves in a warm hug with');
    expect(command.noTargetContent).toBe(
      'wrapped themselves in a warm, self-comforting hug',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The lucky person you want to share a heartfelt hug with.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid hug commands', () => {
      expect(command.regex.test('hug')).toBe(true);
      expect(command.regex.test('hug @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('hugs')).toBe(false);
      expect(command.regex.test('hugging')).toBe(false);
      expect(command.regex.test('hu')).toBe(false);
    });
  });
});
