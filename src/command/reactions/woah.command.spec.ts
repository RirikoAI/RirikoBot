import { Test, TestingModule } from '@nestjs/testing';
import WoahCommand from './woah.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('WoahCommand', () => {
  let command: WoahCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WoahCommand],
    }).compile();

    command = module.get<WoahCommand>(WoahCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('woah');
    expect(command.regex).toEqual(new RegExp('^woah$|^woah ', 'i'));
    expect(command.description).toBe('Express amazement or surprise at someone.');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['woah @user']);
    expect(command.reactionType).toBe('woah');
    expect(command.content).toBe('was amazed by');
    expect(command.noTargetContent).toBe(
      'stared wide-eyed, muttering a stunned "Woah..."',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person that left you amazed.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid woah commands', () => {
      expect(command.regex.test('woah')).toBe(true);
      expect(command.regex.test('woah @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('woahs')).toBe(false);
      expect(command.regex.test('woahing')).toBe(false);
      expect(command.regex.test('woa')).toBe(false);
    });
  });
});
