import { Test, TestingModule } from '@nestjs/testing';
import SmugCommand from './smug.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('SmugCommand', () => {
  let command: SmugCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SmugCommand],
    }).compile();

    command = module.get<SmugCommand>(SmugCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('smug');
    expect(command.regex).toEqual(new RegExp('^smug$|^smug ', 'i'));
    expect(command.description).toBe(
      'Flash a confident, self-satisfied smug look at someone.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['smug @user']);
    expect(command.reactionType).toBe('smug');
    expect(command.content).toBe('gave a smug look to');
    expect(command.noTargetContent).toBe(
      'smirked confidently, feeling undeniably pleased with themselves',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to direct your smug expression toward.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid smug commands', () => {
      expect(command.regex.test('smug')).toBe(true);
      expect(command.regex.test('smug @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('smugs')).toBe(false);
      expect(command.regex.test('smugging')).toBe(false);
      expect(command.regex.test('smu')).toBe(false);
    });
  });
});
