import { Test, TestingModule } from '@nestjs/testing';
import SlapCommand from './slap.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('SlapCommand', () => {
  let command: SlapCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SlapCommand],
    }).compile();

    command = module.get<SlapCommand>(SlapCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('slap');
    expect(command.regex).toEqual(new RegExp('^slap$|^slap ', 'i'));
    expect(command.description).toBe('Deliver a powerful slap to someone.');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['slap @user']);
    expect(command.reactionType).toBe('slap');
    expect(command.content).toBe('delivered a devastating slap to');
    expect(command.noTargetContent).toBe(
      'slapped the air, their hand stinging from the force of it',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to slap.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid slap commands', () => {
      expect(command.regex.test('slap')).toBe(true);
      expect(command.regex.test('slap @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('slaps')).toBe(false);
      expect(command.regex.test('slapping')).toBe(false);
      expect(command.regex.test('sla')).toBe(false);
    });
  });
});
