import { Test, TestingModule } from '@nestjs/testing';
import HeadbangCommand from './headbang.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('HeadbangCommand', () => {
  let command: HeadbangCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HeadbangCommand],
    }).compile();

    command = module.get<HeadbangCommand>(HeadbangCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('headbang');
    expect(command.regex).toEqual(new RegExp('^headbang$|^headbang ', 'i'));
    expect(command.description).toBe(
      'Turn up the volume and rock out with a headbang frenzy!',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['headbang @user']);
    expect(command.reactionType).toBe('headbang');
    expect(command.content).toBe('banged their head against the wall because of');
    expect(command.noTargetContent).toBe(
      'banged their head against the wall repeatedly, consumed by frustration',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description:
          'The person who drove you to bang your head against the wall.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid headbang commands', () => {
      expect(command.regex.test('headbang')).toBe(true);
      expect(command.regex.test('headbang @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('headbangs')).toBe(false);
      expect(command.regex.test('headbanging')).toBe(false);
      expect(command.regex.test('head')).toBe(false);
    });
  });
});
