import { Test, TestingModule } from '@nestjs/testing';
import SipCommand from './sip.command';
import { SlashCommandOptionTypes } from '#command/command.types';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { SharedServicesMock, TestSharedService } from "../../../test/mocks/shared-services.mock";

const mockDiscordService = {
  client: {
    user: {
      displayAvatarURL: jest.fn(),
    },
  },
};
const mockCommandService = {
  getGuildPrefix: jest.fn(),
};
const mockSharedServices: SharedServicesMock = {
  ...TestSharedService,
  discord: mockDiscordService as unknown as DiscordService,
  commandService: mockCommandService as unknown as CommandService,
};

describe('SipCommand', () => {
  let command: SipCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SipCommand,
          useValue: new SipCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<SipCommand>(SipCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('sip');
    expect(command.regex).toEqual(new RegExp('^sip$|^sip ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['sip @user']);
    expect(command.reactionType).toBe('sip');
    expect(command.content).toEqual(expect.any(String));
    expect(command.noTargetContent).toEqual(expect.any(String));
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: expect.any(String),
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
