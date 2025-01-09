import { Test, TestingModule } from '@nestjs/testing';
import ShyCommand from './shy.command';
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

describe('ShyCommand', () => {
  let command: ShyCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ShyCommand,
          useValue: new ShyCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<ShyCommand>(ShyCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('shy');
    expect(command.regex).toEqual(new RegExp('^shy$|^shy ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['shy @user']);
    expect(command.reactionType).toBe('shy');
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
    it('should match valid shy commands', () => {
      expect(command.regex.test('shy')).toBe(true);
      expect(command.regex.test('shy @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('shys')).toBe(false);
      expect(command.regex.test('shying')).toBe(false);
      expect(command.regex.test('sh')).toBe(false);
    });
  });
});
