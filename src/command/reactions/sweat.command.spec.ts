import { Test, TestingModule } from '@nestjs/testing';
import SweatCommand from './sweat.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('SweatCommand', () => {
  let command: SweatCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SweatCommand],
    }).compile();

    command = module.get<SweatCommand>(SweatCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('sweat');
    expect(command.regex).toEqual(new RegExp('^sweat$|^sweat ', 'i'));
    expect(command.description).toBe('Break into a nervous sweat while looking at someone.');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['sweat @user']);
    expect(command.reactionType).toBe('sweat');
    expect(command.content).toBe('started sweating nervously at');
    expect(command.noTargetContent).toBe(
      'wiped their forehead nervously, beads of sweat forming under the pressure',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person making you sweat nervously.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid sweat commands', () => {
      expect(command.regex.test('sweat')).toBe(true);
      expect(command.regex.test('sweat @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('sweats')).toBe(false);
      expect(command.regex.test('sweating')).toBe(false);
      expect(command.regex.test('swe')).toBe(false);
    });
  });
});
