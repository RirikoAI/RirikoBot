import { Test, TestingModule } from '@nestjs/testing';
import AirKissCommand from './airkiss.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('AirKissCommand', () => {
  let command: AirKissCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AirKissCommand],
    }).compile();

    command = module.get<AirKissCommand>(AirKissCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('airkiss');
    expect(command.regex).toEqual(new RegExp('^airkiss$|^airkiss ', 'i'));
    expect(command.description).toBe('Blow an air kiss to someone who deserves your affection.');
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['airkiss @user']);
    expect(command.reactionType).toBe('airkiss');
    expect(command.content).toBe('blew an air kiss at');
    expect(command.noTargetContent).toBe('blew an air kiss into the air, charming no one');
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'That lucky someone you want to charm with an air kiss.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid airkiss commands', () => {
      expect(command.regex.test('airkiss')).toBe(true);
      expect(command.regex.test('airkiss @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('airkisses')).toBe(false);
      expect(command.regex.test('airk')).toBe(false);
    });
  });
});
