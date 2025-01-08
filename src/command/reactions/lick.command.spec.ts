import { Test, TestingModule } from '@nestjs/testing';
import LickCommand from './lick.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('LickCommand', () => {
  let command: LickCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LickCommand],
    }).compile();

    command = module.get<LickCommand>(LickCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('lick');
    expect(command.regex).toEqual(new RegExp('^lick$|^lick ', 'i'));
    expect(command.description).toBe('Lick someone, because why not?');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['lick @user']);
    expect(command.reactionType).toBe('lick');
    expect(command.content).toBe('gave a lick to');
    expect(command.noTargetContent).toBe(
      'stuck out their tongue and licked the air, just for fun',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to give a lick to.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid lick commands', () => {
      expect(command.regex.test('lick')).toBe(true);
      expect(command.regex.test('lick @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('licks')).toBe(false);
      expect(command.regex.test('licking')).toBe(false);
      expect(command.regex.test('lic')).toBe(false);
    });
  });
});
