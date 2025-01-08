import { Test, TestingModule } from '@nestjs/testing';
import EvilLaughCommand from './evillaugh.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('EvilLaughCommand', () => {
  let command: EvilLaughCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EvilLaughCommand],
    }).compile();

    command = module.get<EvilLaughCommand>(EvilLaughCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('evillaugh');
    expect(command.regex).toEqual(new RegExp('^evillaugh$|^evillaugh ', 'i'));
    expect(command.description).toBe(
      'Channel your inner villain and unleash a spine-chilling evil laugh.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['evillaugh @user']);
    expect(command.reactionType).toBe('evillaugh');
    expect(command.content).toBe('unleashed a maniacal evil laugh at');
    expect(command.noTargetContent).toBe(
      'threw their head back and let out a dramatic "Mwahaha!" echoing into the void',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description:
          'The unfortunate soul who will be subjected to your villainous cackle.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid evillaugh commands', () => {
      expect(command.regex.test('evillaugh')).toBe(true);
      expect(command.regex.test('evillaugh @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('evillaughs')).toBe(false);
      expect(command.regex.test('evillaughing')).toBe(false);
      expect(command.regex.test('evil')).toBe(false);
    });
  });
});
