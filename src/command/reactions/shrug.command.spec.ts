import { Test, TestingModule } from '@nestjs/testing';
import ShrugCommand from './shrug.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('ShrugCommand', () => {
  let command: ShrugCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShrugCommand],
    }).compile();

    command = module.get<ShrugCommand>(ShrugCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('shrug');
    expect(command.regex).toEqual(new RegExp('^shrug$|^shrug ', 'i'));
    expect(command.description).toBe(
      'Shrug at someone with a mix of indifference, confusion, or playfulness.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['shrug @user']);
    expect(command.reactionType).toBe('shrug');
    expect(command.content).toBe('shrugged nonchalantly at');
    expect(command.noTargetContent).toBe(
      'shrugged to themselves, as if the universe’s mysteries didn’t concern them',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to shrug at.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid shrug commands', () => {
      expect(command.regex.test('shrug')).toBe(true);
      expect(command.regex.test('shrug @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('shrugs')).toBe(false);
      expect(command.regex.test('shrugging')).toBe(false);
      expect(command.regex.test('shru')).toBe(false);
    });
  });
});
