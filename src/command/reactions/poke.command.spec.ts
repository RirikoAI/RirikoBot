import { Test, TestingModule } from '@nestjs/testing';
import PokeCommand from './poke.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('PokeCommand', () => {
  let command: PokeCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PokeCommand],
    }).compile();

    command = module.get<PokeCommand>(PokeCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('poke');
    expect(command.regex).toEqual(new RegExp('^poke$|^poke ', 'i'));
    expect(command.description).toBe(
      'Poke someone to grab their attention or just for fun!',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['poke @user']);
    expect(command.reactionType).toBe('poke');
    expect(command.content).toBe('gently poked');
    expect(command.noTargetContent).toBe(
      'poked the air aimlessly, hoping someone might notice',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to poke.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid poke commands', () => {
      expect(command.regex.test('poke')).toBe(true);
      expect(command.regex.test('poke @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('pokes')).toBe(false);
      expect(command.regex.test('poking')).toBe(false);
      expect(command.regex.test('pok')).toBe(false);
    });
  });
});
