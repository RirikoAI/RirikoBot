import { Test, TestingModule } from '@nestjs/testing';
import BlushCommand from './blush.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('BlushCommand', () => {
  let command: BlushCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BlushCommand],
    }).compile();

    command = module.get<BlushCommand>(BlushCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('blush');
    expect(command.regex).toEqual(new RegExp('^blush$|^blush ', 'i'));
    expect(command.description).toBe(
      'Turn as red as a tomato because someone caught you off guard.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['blush @user']);
    expect(command.reactionType).toBe('blush');
    expect(command.content).toBe('turned bright red while blushing at');
    expect(command.noTargetContent).toBe(
      'turned bright red while blushing shyly to themselves',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The certain someone who made your cheeks go red.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid blush commands', () => {
      expect(command.regex.test('blush')).toBe(true);
      expect(command.regex.test('blush @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('blushing')).toBe(false);
      expect(command.regex.test('blushes')).toBe(false);
      expect(command.regex.test('blu')).toBe(false);
    });
  });
});
