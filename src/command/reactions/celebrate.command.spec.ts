import { Test, TestingModule } from '@nestjs/testing';
import CelebrateCommand from './celebrate.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('CelebrateCommand', () => {
  let command: CelebrateCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CelebrateCommand],
    }).compile();

    command = module.get<CelebrateCommand>(CelebrateCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('celebrate');
    expect(command.regex).toEqual(new RegExp('^celebrate$|^celebrate ', 'i'));
    expect(command.description).toBe(
      'Throw confetti, pop the champagne, and celebrate with someone special!',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['celebrate @user']);
    expect(command.reactionType).toBe('celebrate');
    expect(command.content).toBe('threw a party and celebrated with');
    expect(command.noTargetContent).toBe(
      'threw a solo celebration, confetti and all, partying in their own awesome company',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to make a memorable celebration with.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid celebrate commands', () => {
      expect(command.regex.test('celebrate')).toBe(true);
      expect(command.regex.test('celebrate @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('celebrates')).toBe(false);
      expect(command.regex.test('celebration')).toBe(false);
      expect(command.regex.test('celebr')).toBe(false);
    });
  });
});
