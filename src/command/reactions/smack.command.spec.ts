import { Test, TestingModule } from '@nestjs/testing';
import SmackCommand from './smack.command';
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

describe('SmackCommand', () => {
  let command: SmackCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SmackCommand,
          useValue: new SmackCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<SmackCommand>(SmackCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('smack');
    expect(command.regex).toEqual(new RegExp('^smack$|^smack ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['smack @user']);
    expect(command.reactionType).toBe('smack');
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
    it('should match valid smack commands', () => {
      expect(command.regex.test('smack')).toBe(true);
      expect(command.regex.test('smack @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('smacks')).toBe(false);
      expect(command.regex.test('smacking')).toBe(false);
      expect(command.regex.test('sma')).toBe(false);
    });
  });
});
