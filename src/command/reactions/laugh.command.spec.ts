import { Test, TestingModule } from '@nestjs/testing';
import LaughCommand from './laugh.command';
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

describe('LaughCommand', () => {
  let command: LaughCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: LaughCommand,
          useValue: new LaughCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<LaughCommand>(LaughCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('laugh');
    expect(command.regex).toEqual(new RegExp('^laugh$|^laugh ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['laugh @user']);
    expect(command.reactionType).toBe('laugh');
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
    it('should match valid laugh commands', () => {
      expect(command.regex.test('laugh')).toBe(true);
      expect(command.regex.test('laugh @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('laughs')).toBe(false);
      expect(command.regex.test('laughing')).toBe(false);
      expect(command.regex.test('lau')).toBe(false);
    });
  });
});
