import { Test, TestingModule } from '@nestjs/testing';
import SurprisedCommand from './surprised.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('SurprisedCommand', () => {
  let command: SurprisedCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SurprisedCommand],
    }).compile();

    command = module.get<SurprisedCommand>(SurprisedCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('surprised');
    expect(command.regex).toEqual(new RegExp('^surprised$|^surprised ', 'i'));
    expect(command.description).toBe(
      'Show your shock or astonishment toward someone.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['surprised @user']);
    expect(command.reactionType).toBe('surprised');
    expect(command.content).toBe('looked completely surprised at');
    expect(command.noTargetContent).toBe(
      'gasped in astonishment, their face frozen in shock at the unexpected',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person who left you stunned or astonished.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid surprised commands', () => {
      expect(command.regex.test('surprised')).toBe(true);
      expect(command.regex.test('surprised @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('surprises')).toBe(false);
      expect(command.regex.test('surprising')).toBe(false);
      expect(command.regex.test('surp')).toBe(false);
    });
  });
});
