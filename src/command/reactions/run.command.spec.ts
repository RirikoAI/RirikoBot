import { Test, TestingModule } from '@nestjs/testing';
import RunCommand from './run.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('RunCommand', () => {
  let command: RunCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RunCommand],
    }).compile();

    command = module.get<RunCommand>(RunCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('run');
    expect(command.regex).toEqual(new RegExp('^run$|^run ', 'i'));
    expect(command.description).toBe('Dash away from someone with panic!');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['run @user']);
    expect(command.reactionType).toBe('run');
    expect(command.content).toBe('ran away from');
    expect(command.noTargetContent).toBe(
      'bolted off in a random direction, running from their own imagination',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to run away from.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid run commands', () => {
      expect(command.regex.test('run')).toBe(true);
      expect(command.regex.test('run @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('runs')).toBe(false);
      expect(command.regex.test('running')).toBe(false);
      expect(command.regex.test('ru')).toBe(false);
    });
  });
});
