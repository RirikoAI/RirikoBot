import { Test, TestingModule } from '@nestjs/testing';
import ScaredCommand from './scared.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('ScaredCommand', () => {
  let command: ScaredCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScaredCommand],
    }).compile();

    command = module.get<ScaredCommand>(ScaredCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('scared');
    expect(command.regex).toEqual(new RegExp('^scared$|^scared ', 'i'));
    expect(command.description).toBe(
      'Show someone just how spooked or terrified you are!',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['scared @user']);
    expect(command.reactionType).toBe('scared');
    expect(command.content).toBe('looked scared of');
    expect(command.noTargetContent).toBe(
      'shivered nervously, looking around for imaginary monsters in the shadows',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person that has you trembling in fear.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid scared commands', () => {
      expect(command.regex.test('scared')).toBe(true);
      expect(command.regex.test('scared @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('scareds')).toBe(false);
      expect(command.regex.test('scaredy')).toBe(false);
      expect(command.regex.test('scar')).toBe(false);
    });
  });
});
