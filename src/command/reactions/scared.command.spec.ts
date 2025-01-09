import { Test, TestingModule } from '@nestjs/testing';
import ScaredCommand from './scared.command';
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

describe('ScaredCommand', () => {
  let command: ScaredCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ScaredCommand,
          useValue: new ScaredCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<ScaredCommand>(ScaredCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('scared');
    expect(command.regex).toEqual(new RegExp('^scared$|^scared ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['scared @user']);
    expect(command.reactionType).toBe('scared');
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
    it('should match valid scared commands', () => {
      expect(command.regex.test('scared')).toBe(true);
      expect(command.regex.test('scared @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('scareds')).toBe(false);
      expect(command.regex.test('scaredy')).toBe(false);
      expect(command.regex.test('scar')).toBe(false);
    });
  });
});
