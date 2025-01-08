import { Test, TestingModule } from '@nestjs/testing';
import CheersCommand from './cheers.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('CheersCommand', () => {
  let command: CheersCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CheersCommand],
    }).compile();

    command = module.get<CheersCommand>(CheersCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('cheers');
    expect(command.regex).toEqual(new RegExp('^cheers$|^cheers ', 'i'));
    expect(command.description).toBe(
      'Raise your glass and share a toast with someone special!',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['cheers @user']);
    expect(command.reactionType).toBe('cheers');
    expect(command.content).toBe('raised a toast and clinked glasses with');
    expect(command.noTargetContent).toBe(
      'raised a glass in celebration, toasting to themselves with a satisfied smile',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to share a celebratory toast with.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid cheers commands', () => {
      expect(command.regex.test('cheers')).toBe(true);
      expect(command.regex.test('cheers @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('cheer')).toBe(false);
      expect(command.regex.test('cheerful')).toBe(false);
      expect(command.regex.test('cheersing')).toBe(false);
    });
  });
});
