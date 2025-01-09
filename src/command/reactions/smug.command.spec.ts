import { Test, TestingModule } from '@nestjs/testing';
import SmugCommand from './smug.command';
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

describe('SmugCommand', () => {
  let command: SmugCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SmugCommand,
          useValue: new SmugCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<SmugCommand>(SmugCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('smug');
    expect(command.regex).toEqual(new RegExp('^smug$|^smug ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['smug @user']);
    expect(command.reactionType).toBe('smug');
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
    it('should match valid smug commands', () => {
      expect(command.regex.test('smug')).toBe(true);
      expect(command.regex.test('smug @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('smugs')).toBe(false);
      expect(command.regex.test('smugging')).toBe(false);
      expect(command.regex.test('smu')).toBe(false);
    });
  });
});
