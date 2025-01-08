import { Test, TestingModule } from '@nestjs/testing';
import HandholdCommand from './handhold.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('HandholdCommand', () => {
  let command: HandholdCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HandholdCommand],
    }).compile();

    command = module.get<HandholdCommand>(HandholdCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('handhold');
    expect(command.regex).toEqual(new RegExp('^handhold$|^handhold ', 'i'));
    expect(command.description).toBe(
      'Reach out and hold hands with someone special.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['handhold @user']);
    expect(command.reactionType).toBe('handhold');
    expect(command.content).toBe('gently held hands with');
    expect(command.noTargetContent).toBe(
      'extended their hand into the air, wishing for someone to hold it',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description:
          'The special someone you want to share a tender handhold with.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid handhold commands', () => {
      expect(command.regex.test('handhold')).toBe(true);
      expect(command.regex.test('handhold @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('handholds')).toBe(false);
      expect(command.regex.test('handholding')).toBe(false);
      expect(command.regex.test('hand')).toBe(false);
    });
  });
});
