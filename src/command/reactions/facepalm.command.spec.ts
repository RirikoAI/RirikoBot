import { Test, TestingModule } from '@nestjs/testing';
import FacepalmCommand from './facepalm.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('FacepalmCommand', () => {
  let command: FacepalmCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FacepalmCommand],
    }).compile();

    command = module.get<FacepalmCommand>(FacepalmCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('facepalm');
    expect(command.regex).toEqual(new RegExp('^facepalm$|^facepalm ', 'i'));
    expect(command.description).toBe(
      'Plant your palm firmly on your face because someone left you speechless.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['facepalm @user']);
    expect(command.reactionType).toBe('facepalm');
    expect(command.content).toBe('facepalmed dramatically at');
    expect(command.noTargetContent).toBe(
      'let out a sigh and facepalmed at their own thoughts, questioning everything',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person who made you reach peak exasperation.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid facepalm commands', () => {
      expect(command.regex.test('facepalm')).toBe(true);
      expect(command.regex.test('facepalm @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('facepalms')).toBe(false);
      expect(command.regex.test('facepalming')).toBe(false);
      expect(command.regex.test('facep')).toBe(false);
    });
  });
});
