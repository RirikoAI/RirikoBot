import { Test, TestingModule } from '@nestjs/testing';
import CryCommand from './cry.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('CryCommand', () => {
  let command: CryCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CryCommand],
    }).compile();

    command = module.get<CryCommand>(CryCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('cry');
    expect(command.regex).toEqual(new RegExp('^cry$|^cry ', 'i'));
    expect(command.description).toBe(
      'Let the tears flow because someone tugged at your heartstrings or hurt your feelings.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['cry @user']);
    expect(command.reactionType).toBe('cry');
    expect(command.content).toBe('shed tears because of');
    expect(command.noTargetContent).toBe(
      'shed tears quietly, feeling the weight of their emotions alone',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description:
          'The heartless (or maybe misunderstood) person who made you cry.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid cry commands', () => {
      expect(command.regex.test('cry')).toBe(true);
      expect(command.regex.test('cry @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('cries')).toBe(false);
      expect(command.regex.test('crying')).toBe(false);
      expect(command.regex.test('cri')).toBe(false);
    });
  });
});
