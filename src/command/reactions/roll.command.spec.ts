import { Test, TestingModule } from '@nestjs/testing';
import RollCommand from './roll.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('RollCommand', () => {
  let command: RollCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RollCommand],
    }).compile();

    command = module.get<RollCommand>(RollCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('roll');
    expect(command.regex).toEqual(new RegExp('^roll$|^roll ', 'i'));
    expect(command.description).toBe(
      'Roll around playfully or dramatically near someone.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['roll @user']);
    expect(command.reactionType).toBe('roll');
    expect(command.content).toBe('rolled around near');
    expect(command.noTargetContent).toBe(
      'rolled around on the floor dramatically, as if life were just too much',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to roll around near.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid roll commands', () => {
      expect(command.regex.test('roll')).toBe(true);
      expect(command.regex.test('roll @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('rolls')).toBe(false);
      expect(command.regex.test('rolling')).toBe(false);
      expect(command.regex.test('rol')).toBe(false);
    });
  });
});
