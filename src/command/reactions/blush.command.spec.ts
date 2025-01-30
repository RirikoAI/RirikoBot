import { Test, TestingModule } from '@nestjs/testing';
import BlushCommand from './blush.command';
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

describe('BlushCommand', () => {
  let command: BlushCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: BlushCommand,
          useValue: new BlushCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<BlushCommand>(BlushCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('blush');
    expect(command.regex).toEqual(new RegExp('^blush$|^blush ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['blush @user']);
    expect(command.reactionType).toBe('blush');
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
    it('should match valid blush commands', () => {
      expect(command.regex.test('blush')).toBe(true);
      expect(command.regex.test('blush @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('blushing')).toBe(false);
      expect(command.regex.test('blushes')).toBe(false);
      expect(command.regex.test('blu')).toBe(false);
    });
  });
});
