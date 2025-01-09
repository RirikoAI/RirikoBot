import { Test, TestingModule } from '@nestjs/testing';
import LoveCommand from './love.command';
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

describe('LoveCommand', () => {
  let command: LoveCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: LoveCommand,
          useValue: new LoveCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<LoveCommand>(LoveCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('love');
    expect(command.regex).toEqual(new RegExp('^love$|^love ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['love @user']);
    expect(command.reactionType).toBe('love');
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
    it('should match valid love commands', () => {
      expect(command.regex.test('love')).toBe(true);
      expect(command.regex.test('love @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('loves')).toBe(false);
      expect(command.regex.test('loving')).toBe(false);
      expect(command.regex.test('lov')).toBe(false);
    });
  });
});
