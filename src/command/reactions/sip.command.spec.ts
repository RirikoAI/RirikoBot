import { Test, TestingModule } from '@nestjs/testing';
import SipCommand from './sip.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('SipCommand', () => {
  let command: SipCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SipCommand],
    }).compile();

    command = module.get<SipCommand>(SipCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('sip');
    expect(command.regex).toEqual(new RegExp('^sip$|^sip ', 'i'));
    expect(command.description).toBe(
      'Take a calm sip of your drink, maybe while observing someone.',
    );
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['sip @user']);
    expect(command.reactionType).toBe('sip');
    expect(command.content).toBe('calmly sipped their drink while looking at');
    expect(command.noTargetContent).toBe(
      'took a slow, contemplative sip of their drink, savoring the quiet moment',
    );
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description:
          'The person you want to subtly observe while sipping your drink.',
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid sip commands', () => {
      expect(command.regex.test('sip')).toBe(true);
      expect(command.regex.test('sip @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('sips')).toBe(false);
      expect(command.regex.test('sipping')).toBe(false);
      expect(command.regex.test('si')).toBe(false);
    });
  });
});
