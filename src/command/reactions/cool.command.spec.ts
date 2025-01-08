import { Test, TestingModule } from '@nestjs/testing';
import CoolCommand from './cool.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('CoolCommand', () => {
  let command: CoolCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CoolCommand],
    }).compile();

    command = module.get<CoolCommand>(CoolCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('cool');
    expect(command.regex).toEqual(new RegExp('^cool$|^cool ', 'i'));
    expect(command.description).toBe(
      'Put on your shades and show someone just how cool you are.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['cool @user']);
    expect(command.reactionType).toBe('cool');
    expect(command.content).toBe('flashed their coolest moves at');
    expect(command.noTargetContent).toBe(
      'casually adjusted their shades and smirked at their own reflection',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description:
          'The person you want to dazzle with your unmatched coolness.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid cool commands', () => {
      expect(command.regex.test('cool')).toBe(true);
      expect(command.regex.test('cool @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('cools')).toBe(false);
      expect(command.regex.test('cooling')).toBe(false);
      expect(command.regex.test('coo')).toBe(false);
    });
  });
});
