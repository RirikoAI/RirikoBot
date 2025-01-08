import { Test, TestingModule } from '@nestjs/testing';
import SlowClapCommand from './slowclap.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('SlowClapCommand', () => {
  let command: SlowClapCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SlowClapCommand],
    }).compile();

    command = module.get<SlowClapCommand>(SlowClapCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('slowclap');
    expect(command.regex).toEqual(new RegExp('^slowclap$|^slowclap ', 'i'));
    expect(command.description).toBe('Deliver a slow, sarcastic clap to someone.');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['slowclap @user']);
    expect(command.reactionType).toBe('slowclap');
    expect(command.content).toBe('gave a slow, sarcastic clap to');
    expect(command.noTargetContent).toBe(
      'clapped slowly and sarcastically, their eyes filled with mock amusement',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to direct your slow, sarcastic applause at.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid slowclap commands', () => {
      expect(command.regex.test('slowclap')).toBe(true);
      expect(command.regex.test('slowclap @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('slowclaps')).toBe(false);
      expect(command.regex.test('slowclapping')).toBe(false);
      expect(command.regex.test('slow')).toBe(false);
    });
  });
});
