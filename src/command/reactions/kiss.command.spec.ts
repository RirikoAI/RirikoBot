import { Test, TestingModule } from '@nestjs/testing';
import KissCommand from './kiss.command';
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

describe('KissCommand', () => {
  let command: KissCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: KissCommand,
          useValue: new KissCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<KissCommand>(KissCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('kiss');
    expect(command.regex).toEqual(new RegExp('^kiss$|^kiss ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['kiss @user']);
    expect(command.reactionType).toBe('kiss');
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
    it('should match valid kiss commands', () => {
      expect(command.regex.test('kiss')).toBe(true);
      expect(command.regex.test('kiss @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('kisses')).toBe(false);
      expect(command.regex.test('kissing')).toBe(false);
      expect(command.regex.test('kis')).toBe(false);
    });
  });
});
