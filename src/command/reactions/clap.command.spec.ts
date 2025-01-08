import { Test, TestingModule } from '@nestjs/testing';
import ClapCommand from './clap.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('ClapCommand', () => {
  let command: ClapCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClapCommand],
    }).compile();

    command = module.get<ClapCommand>(ClapCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('clap');
    expect(command.regex).toEqual(new RegExp('^clap$|^clap ', 'i'));
    expect(command.description).toBe(
      'Applaud someone with enthusiasm and appreciation!',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['clap @user']);
    expect(command.reactionType).toBe('clap');
    expect(command.content).toBe('gave a round of applause to');
    expect(command.noTargetContent).toBe(
      'clapped enthusiastically, celebrating the moment',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to cheer for with a big clap.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid clap commands', () => {
      expect(command.regex.test('clap')).toBe(true);
      expect(command.regex.test('clap @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('claps')).toBe(false);
      expect(command.regex.test('clapping')).toBe(false);
      expect(command.regex.test('cla')).toBe(false);
    });
  });
});
