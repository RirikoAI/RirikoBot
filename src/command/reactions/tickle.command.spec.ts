import { Test, TestingModule } from '@nestjs/testing';
import TickleCommand from './tickle.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('TickleCommand', () => {
  let command: TickleCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TickleCommand],
    }).compile();

    command = module.get<TickleCommand>(TickleCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('tickle');
    expect(command.regex).toEqual(new RegExp('^tickle$|^tickle ', 'i'));
    expect(command.description).toBe('Give someone a playful tickle to make them laugh!');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['tickle @user']);
    expect(command.reactionType).toBe('tickle');
    expect(command.content).toBe('playfully tickled');
    expect(command.noTargetContent).toBe(
      'wiggled their fingers in the air, pretending to tickle an invisible friend',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to make giggle with a playful tickle.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid tickle commands', () => {
      expect(command.regex.test('tickle')).toBe(true);
      expect(command.regex.test('tickle @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('tickles')).toBe(false);
      expect(command.regex.test('tickling')).toBe(false);
      expect(command.regex.test('tick')).toBe(false);
    });
  });
});
