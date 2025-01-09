import { Test, TestingModule } from '@nestjs/testing';
import StopCommand from './stopit.command';
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

describe('StopCommand', () => {
  let command: StopCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: StopCommand,
          useValue: new StopCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<StopCommand>(StopCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('stopit');
    expect(command.regex).toEqual(new RegExp('^stopit$|^stopit ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['stopit @user']);
    expect(command.reactionType).toBe('stop');
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
    it('should match valid stopit commands', () => {
      expect(command.regex.test('stopit')).toBe(true);
      expect(command.regex.test('stopit @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('stop')).toBe(false);
      expect(command.regex.test('stopping')).toBe(false);
      expect(command.regex.test('sto')).toBe(false);
    });
  });
});
