import { Test, TestingModule } from '@nestjs/testing';
import DanceCommand from './dance.command';
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

describe('DanceCommand', () => {
  let command: DanceCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: DanceCommand,
          useValue: new DanceCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<DanceCommand>(DanceCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('dance');
    expect(command.regex).toEqual(new RegExp('^dance$|^dance ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['dance @user']);
    expect(command.reactionType).toBe('dance');
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
    it('should match valid dance commands', () => {
      expect(command.regex.test('dance')).toBe(true);
      expect(command.regex.test('dance @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('dances')).toBe(false);
      expect(command.regex.test('dancing')).toBe(false);
      expect(command.regex.test('dan')).toBe(false);
    });
  });
});
