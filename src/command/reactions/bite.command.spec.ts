import { Test, TestingModule } from '@nestjs/testing';
import BiteCommand from './bite.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('BiteCommand', () => {
  let command: BiteCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiteCommand],
    }).compile();

    command = module.get<BiteCommand>(BiteCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('bite');
    expect(command.regex).toEqual(new RegExp('^bite$|^bite ', 'i'));
    expect(command.description).toBe(
      'Give someone a mischievous little nibble (or a playful chomp).',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['bite @user']);
    expect(command.reactionType).toBe('bite');
    expect(command.content).toBe('sank their teeth into');
    expect(command.noTargetContent).toBe(
      'looked around hungrily but ended up biting the air instead',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The unsuspecting victim of your playful bite.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid bite commands', () => {
      expect(command.regex.test('bite')).toBe(true);
      expect(command.regex.test('bite @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('bites')).toBe(false);
      expect(command.regex.test('bitey')).toBe(false);
    });
  });
});
