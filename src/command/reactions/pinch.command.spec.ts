import { Test, TestingModule } from '@nestjs/testing';
import PinchCommand from './pinch.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('PinchCommand', () => {
  let command: PinchCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PinchCommand],
    }).compile();

    command = module.get<PinchCommand>(PinchCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('pinch');
    expect(command.regex).toEqual(new RegExp('^pinch$|^pinch ', 'i'));
    expect(command.description).toBe(
      'Give someone a playful pinch to grab their attention.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['pinch @user']);
    expect(command.reactionType).toBe('pinch');
    expect(command.content).toBe('gave a pinch to');
    expect(command.noTargetContent).toBe(
      'pinched their own cheek to make sure they weren’t dreaming',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to give a cheeky pinch to.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid pinch commands', () => {
      expect(command.regex.test('pinch')).toBe(true);
      expect(command.regex.test('pinch @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('pinches')).toBe(false);
      expect(command.regex.test('pinching')).toBe(false);
      expect(command.regex.test('pin')).toBe(false);
    });
  });
});
