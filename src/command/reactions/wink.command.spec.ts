import { Test, TestingModule } from '@nestjs/testing';
import WinkCommand from './wink.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('WinkCommand', () => {
  let command: WinkCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WinkCommand],
    }).compile();

    command = module.get<WinkCommand>(WinkCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('wink');
    expect(command.regex).toEqual(new RegExp('^wink$|^wink ', 'i'));
    expect(command.description).toBe('Flash a playful or flirty wink at someone.');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['wink @user']);
    expect(command.reactionType).toBe('wink');
    expect(command.content).toBe('gave a wink to');
    expect(command.noTargetContent).toBe(
      'winked at their reflection in the mirror, feeling cheeky',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to charm with a wink.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid wink commands', () => {
      expect(command.regex.test('wink')).toBe(true);
      expect(command.regex.test('wink @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('winks')).toBe(false);
      expect(command.regex.test('winking')).toBe(false);
      expect(command.regex.test('win')).toBe(false);
    });
  });
});
