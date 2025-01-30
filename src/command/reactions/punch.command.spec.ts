import { Test, TestingModule } from '@nestjs/testing';
import PunchCommand from './punch.command';
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

describe('PunchCommand', () => {
  let command: PunchCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PunchCommand,
          useValue: new PunchCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<PunchCommand>(PunchCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('punch');
    expect(command.regex).toEqual(new RegExp('^punch$|^punch ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['punch @user']);
    expect(command.reactionType).toBe('punch');
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
    it('should match valid punch commands', () => {
      expect(command.regex.test('punch')).toBe(true);
      expect(command.regex.test('punch @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('punches')).toBe(false);
      expect(command.regex.test('punching')).toBe(false);
      expect(command.regex.test('pun')).toBe(false);
    });
  });
});
