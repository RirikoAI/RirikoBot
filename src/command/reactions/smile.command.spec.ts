import { Test, TestingModule } from '@nestjs/testing';
import SmileCommand from './smile.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('SmileCommand', () => {
  let command: SmileCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SmileCommand],
    }).compile();

    command = module.get<SmileCommand>(SmileCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('smile');
    expect(command.regex).toEqual(new RegExp('^smile$|^smile ', 'i'));
    expect(command.description).toBe('Share a warm, cheerful smile with someone.');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['smile @user']);
    expect(command.reactionType).toBe('smile');
    expect(command.content).toBe('smiled warmly at');
    expect(command.noTargetContent).toBe(
      'smiled softly to themselves, letting their happiness brighten the room',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to share your cheerful smile with.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid smile commands', () => {
      expect(command.regex.test('smile')).toBe(true);
      expect(command.regex.test('smile @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('smiles')).toBe(false);
      expect(command.regex.test('smiling')).toBe(false);
      expect(command.regex.test('smi')).toBe(false);
    });
  });
});
