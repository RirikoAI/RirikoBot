import { Test, TestingModule } from '@nestjs/testing';
import AngryStareCommand from './angrystare.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('AngryStareCommand', () => {
  let command: AngryStareCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AngryStareCommand],
    }).compile();

    command = module.get<AngryStareCommand>(AngryStareCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('angrystare');
    expect(command.regex).toEqual(new RegExp('^angrystare$|^angrystare ', 'i'));
    expect(command.description).toBe('Fix someone with a stare so fiery it could melt steel.');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['angrystare @user']);
    expect(command.reactionType).toBe('angrystare');
    expect(command.content).toBe('locked an angry stare on');
    expect(command.noTargetContent).toBe(
      'stared angrily into the void, radiating fiery frustration',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person who made you burn with fury.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid angrystare commands', () => {
      expect(command.regex.test('angrystare')).toBe(true);
      expect(command.regex.test('angrystare @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('angrystares')).toBe(false);
      expect(command.regex.test('stareangry')).toBe(false);
    });
  });
});
