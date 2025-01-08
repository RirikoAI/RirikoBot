import { Test, TestingModule } from '@nestjs/testing';
import DanceCommand from './dance.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('DanceCommand', () => {
  let command: DanceCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DanceCommand],
    }).compile();

    command = module.get<DanceCommand>(DanceCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('dance');
    expect(command.regex).toEqual(new RegExp('^dance$|^dance ', 'i'));
    expect(command.description).toBe(
      'Bust out some moves alone or invite someone to join the party!',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['dance @user']);
    expect(command.reactionType).toBe('dance');
    expect(command.content).toBe('twirled and danced with');
    expect(command.noTargetContent).toBe(
      'spun around joyfully, dancing like nobody was watching',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to groove with on the dance floor.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid dance commands', () => {
      expect(command.regex.test('dance')).toBe(true);
      expect(command.regex.test('dance @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('dances')).toBe(false);
      expect(command.regex.test('dancing')).toBe(false);
      expect(command.regex.test('dan')).toBe(false);
    });
  });
});
