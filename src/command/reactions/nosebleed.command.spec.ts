import { Test, TestingModule } from '@nestjs/testing';
import NosebleedCommand from './nosebleed.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('NosebleedCommand', () => {
  let command: NosebleedCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NosebleedCommand],
    }).compile();

    command = module.get<NosebleedCommand>(NosebleedCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('nosebleed');
    expect(command.regex).toEqual(new RegExp('^nosebleed$|^nosebleed ', 'i'));
    expect(command.description).toBe(
      'React with a dramatic nosebleed, overwhelmed by someone.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['nosebleed @user']);
    expect(command.reactionType).toBe('nosebleed');
    expect(command.content).toBe('had a nosebleed because of');
    expect(command.noTargetContent).toBe(
      'felt their face heat up and had a sudden, dramatic nosebleed',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: 'The person that left you nosebleeding.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid nosebleed commands', () => {
      expect(command.regex.test('nosebleed')).toBe(true);
      expect(command.regex.test('nosebleed @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('nosebleeds')).toBe(false);
      expect(command.regex.test('nosebleeding')).toBe(false);
      expect(command.regex.test('nose')).toBe(false);
    });
  });
});
