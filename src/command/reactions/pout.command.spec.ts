import { Test, TestingModule } from '@nestjs/testing';
import PoutCommand from './pout.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('PoutCommand', () => {
  let command: PoutCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PoutCommand],
    }).compile();

    command = module.get<PoutCommand>(PoutCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('pout');
    expect(command.regex).toEqual(new RegExp('^pout$|^pout ', 'i'));
    expect(command.description).toBe('Show your displeasure or sulk adorably at someone.');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['pout @user']);
    expect(command.reactionType).toBe('pout');
    expect(command.content).toBe('pouted adorably at');
    expect(command.noTargetContent).toBe('pouted into the void, sulking adorably');
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person you want to sulk at in a cute way.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid pout commands', () => {
      expect(command.regex.test('pout')).toBe(true);
      expect(command.regex.test('pout @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('pouts')).toBe(false);
      expect(command.regex.test('pouting')).toBe(false);
      expect(command.regex.test('pou')).toBe(false);
    });
  });
});
