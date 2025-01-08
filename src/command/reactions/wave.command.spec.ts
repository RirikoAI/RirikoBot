import { Test, TestingModule } from '@nestjs/testing';
import WaveCommand from './wave.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('WaveCommand', () => {
  let command: WaveCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WaveCommand],
    }).compile();

    command = module.get<WaveCommand>(WaveCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('wave');
    expect(command.regex).toEqual(new RegExp('^wave$|^wave ', 'i'));
    expect(command.description).toBe('Greet someone with a friendly wave!');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['wave @user']);
    expect(command.reactionType).toBe('wave');
    expect(command.content).toBe('waved cheerfully at');
    expect(command.noTargetContent).toBe(
      'waved enthusiastically at no one in particular, spreading good vibes',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to greet with a warm wave.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid wave commands', () => {
      expect(command.regex.test('wave')).toBe(true);
      expect(command.regex.test('wave @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('waves')).toBe(false);
      expect(command.regex.test('waving')).toBe(false);
      expect(command.regex.test('wav')).toBe(false);
    });
  });
});
