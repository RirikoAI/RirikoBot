import { Test, TestingModule } from '@nestjs/testing';
import YawnCommand from './yawn.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('YawnCommand', () => {
  let command: YawnCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [YawnCommand],
    }).compile();

    command = module.get<YawnCommand>(YawnCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('yawn');
    expect(command.regex).toEqual(new RegExp('^yawn$|^yawn ', 'i'));
    expect(command.description).toBe(
      'Let out a big yawn, showing how tired or bored you are.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['yawn @user']);
    expect(command.reactionType).toBe('yawn');
    expect(command.content).toBe('yawned sleepily at');
    expect(command.noTargetContent).toBe(
      'stretched their arms and let out a long, exaggerated yawn, barely staying awake',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to show your tired or bored state to.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid yawn commands', () => {
      expect(command.regex.test('yawn')).toBe(true);
      expect(command.regex.test('yawn @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('yawns')).toBe(false);
      expect(command.regex.test('yawning')).toBe(false);
      expect(command.regex.test('yaw')).toBe(false);
    });
  });
});
