import { Test, TestingModule } from '@nestjs/testing';
import NomCommand from './nom.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('NomCommand', () => {
  let command: NomCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
    providers: [NomCommand],
  }).compile();

  command = module.get<NomCommand>(NomCommand);
});

it('should be defined', () => {
  expect(command).toBeDefined();
});

it('should have the correct properties', () => {
  expect(command.name).toBe('nom');
  expect(command.regex).toEqual(new RegExp('^nom$|^nom ', 'i'));
  expect(command.description).toBe(
    'Give someone a playful nibble or pretend to eat them.',
  );
  expect(command.category).toBe('reactions');
  expect(command.usageExamples).toEqual(['nom @user']);
  expect(command.reactionType).toBe('nom');
  expect(command.content).toBe('nommed');
  expect(command.noTargetContent).toBe(
    'pretended to nom the air, imagining an invisible snack',
  );
});

it('should define correct slash command options', () => {
  expect(command.slashOptions).toEqual([
    {
      name: 'target',
      description: 'The person you want to nom on in a playful way.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ]);
});

describe('regex behavior', () => {
  it('should match valid nom commands', () => {
    expect(command.regex.test('nom')).toBe(true);
    expect(command.regex.test('nom @user')).toBe(true);
  });

  it('should not match invalid commands', () => {
    expect(command.regex.test('noms')).toBe(false);
    expect(command.regex.test('nomnom')).toBe(false);
    expect(command.regex.test('no')).toBe(false);
  });
});
});
