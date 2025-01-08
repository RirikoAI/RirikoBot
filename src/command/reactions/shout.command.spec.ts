import { Test, TestingModule } from '@nestjs/testing';
import ShoutCommand from './shout.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('ShoutCommand', () => {
  let command: ShoutCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShoutCommand],
    }).compile();

    command = module.get<ShoutCommand>(ShoutCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('shout');
    expect(command.regex).toEqual(new RegExp('^shout$|^shout ', 'i'));
    expect(command.description).toBe(
      'Raise your voice and shout at someone, whether in excitement or frustration!',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['shout @user']);
    expect(command.reactionType).toBe('shout');
    expect(command.content).toBe('shouted loudly at');
    expect(command.noTargetContent).toBe(
      'let out a loud shout into the void, their voice echoing like thunder',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to shout at.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid shout commands', () => {
      expect(command.regex.test('shout')).toBe(true);
      expect(command.regex.test('shout @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('shouts')).toBe(false);
      expect(command.regex.test('shouting')).toBe(false);
      expect(command.regex.test('sho')).toBe(false);
    });
  });
});
