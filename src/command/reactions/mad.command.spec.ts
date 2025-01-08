import { Test, TestingModule } from '@nestjs/testing';
import MadCommand from './mad.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('MadCommand', () => {
  let command: MadCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MadCommand],
    }).compile();

    command = module.get<MadCommand>(MadCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('mad');
    expect(command.regex).toEqual(new RegExp('^mad$|^mad ', 'i'));
    expect(command.description).toBe('Show your frustration or anger toward someone.');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['mad @user']);
    expect(command.reactionType).toBe('mad');
    expect(command.content).toBe('is very mad at');
    expect(command.noTargetContent).toBe(
      'crossed their arms and fumed silently, steaming like a kettle',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person who has pushed your buttons.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid mad commands', () => {
      expect(command.regex.test('mad')).toBe(true);
      expect(command.regex.test('mad @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('mads')).toBe(false);
      expect(command.regex.test('madness')).toBe(false);
      expect(command.regex.test('ma')).toBe(false);
    });
  });
});
