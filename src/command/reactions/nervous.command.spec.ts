import { Test, TestingModule } from '@nestjs/testing';
import NervousCommand from './nervous.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('NervousCommand', () => {
  let command: NervousCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NervousCommand],
    }).compile();

    command = module.get<NervousCommand>(NervousCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('nervous');
    expect(command.regex).toEqual(new RegExp('^nervous$|^nervous ', 'i'));
    expect(command.description).toBe(
      'Fidget awkwardly and show your nervousness around someone.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['nervous @user']);
    expect(command.reactionType).toBe('nervous');
    expect(command.content).toBe('looked nervously at');
    expect(command.noTargetContent).toBe(
      'fidgeted awkwardly, glancing around with a nervous smile',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person that is making you feel all fidgety and anxious.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid nervous commands', () => {
      expect(command.regex.test('nervous')).toBe(true);
      expect(command.regex.test('nervous @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('nervously')).toBe(false);
      expect(command.regex.test('nervousness')).toBe(false);
      expect(command.regex.test('nerv')).toBe(false);
    });
  });
});
