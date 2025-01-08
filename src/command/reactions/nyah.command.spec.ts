import { Test, TestingModule } from '@nestjs/testing';
import NyahCommand from './nyah.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('NyahCommand', () => {
  let command: NyahCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NyahCommand],
    }).compile();

    command = module.get<NyahCommand>(NyahCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('nyah');
    expect(command.regex).toEqual(new RegExp('^nyah$|^nyah ', 'i'));
    expect(command.description).toBe(
      'Let out a cute "nyah~" to tease or charm someone.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['nyah @user']);
    expect(command.reactionType).toBe('nyah');
    expect(command.content).toBe('teased with a playful "nyah~" at');
    expect(command.noTargetContent).toBe(
      'let out a cute "nyah~" to the world, feeling delightfully mischievous',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to charm or tease with a "nyah~".',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid nyah commands', () => {
      expect(command.regex.test('nyah')).toBe(true);
      expect(command.regex.test('nyah @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('nyahs')).toBe(false);
      expect(command.regex.test('nya')).toBe(false);
      expect(command.regex.test('ny')).toBe(false);
    });
  });
});
