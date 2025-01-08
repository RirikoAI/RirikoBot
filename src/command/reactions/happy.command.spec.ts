import { Test, TestingModule } from '@nestjs/testing';
import HappyCommand from './happy.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('HappyCommand', () => {
  let command: HappyCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HappyCommand],
    }).compile();

    command = module.get<HappyCommand>(HappyCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('happy');
    expect(command.regex).toEqual(new RegExp('^happy$|^happy ', 'i'));
    expect(command.description).toBe(
      'Spread joy and share a moment of happiness with someone special!',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['happy @user']);
    expect(command.reactionType).toBe('happy');
    expect(command.content).toBe('shared a joyful moment with');
    expect(command.noTargetContent).toBe(
      'smiled brightly to themselves, radiating happiness in their own little bubble',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The lucky person you want to spread your happiness to.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid happy commands', () => {
      expect(command.regex.test('happy')).toBe(true);
      expect(command.regex.test('happy @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('happys')).toBe(false);
      expect(command.regex.test('happiness')).toBe(false);
      expect(command.regex.test('hap')).toBe(false);
    });
  });
});
