import { Test, TestingModule } from '@nestjs/testing';
import PunchCommand from './punch.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('PunchCommand', () => {
  let command: PunchCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PunchCommand],
    }).compile();

    command = module.get<PunchCommand>(PunchCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('punch');
    expect(command.regex).toEqual(new RegExp('^punch$|^punch ', 'i'));
    expect(command.description).toBe('Throw a punch at someone!');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['punch @user']);
    expect(command.reactionType).toBe('punch');
    expect(command.content).toBe('threw a punch at');
    expect(command.noTargetContent).toBe(
      'swung a punch into the air, fighting imaginary foes with style',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description:
          'The person you want to throw a punch at (hopefully playfully).',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid punch commands', () => {
      expect(command.regex.test('punch')).toBe(true);
      expect(command.regex.test('punch @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('punches')).toBe(false);
      expect(command.regex.test('punching')).toBe(false);
      expect(command.regex.test('pun')).toBe(false);
    });
  });
});
