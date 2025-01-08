import { Test, TestingModule } from '@nestjs/testing';
import CuddleCommand from './cuddle.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('CuddleCommand', () => {
  let command: CuddleCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CuddleCommand],
    }).compile();

    command = module.get<CuddleCommand>(CuddleCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('cuddle');
    expect(command.regex).toEqual(new RegExp('^cuddle$|^cuddle ', 'i'));
    expect(command.description).toBe(
      'Wrap someone in a warm and loving cuddle to show you care.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['cuddle @user']);
    expect(command.reactionType).toBe('cuddle');
    expect(command.content).toBe('snuggled up close to');
    expect(command.noTargetContent).toBe(
      'wrapped themselves in a cozy blanket for some self-love snuggles',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The lucky person you want to share a cozy cuddle with.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid cuddle commands', () => {
      expect(command.regex.test('cuddle')).toBe(true);
      expect(command.regex.test('cuddle @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('cuddles')).toBe(false);
      expect(command.regex.test('cuddling')).toBe(false);
      expect(command.regex.test('cudd')).toBe(false);
    });
  });
});
