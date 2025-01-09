import { Test, TestingModule } from '@nestjs/testing';
import ShoutCommand from './shout.command';
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

describe('ShoutCommand', () => {
  let command: ShoutCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ShoutCommand,
          useValue: new ShoutCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<ShoutCommand>(ShoutCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('shout');
    expect(command.regex).toEqual(new RegExp('^shout$|^shout ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['shout @user']);
    expect(command.reactionType).toBe('shout');
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
    it('should match valid shout commands', () => {
      expect(command.regex.test('shout')).toBe(true);
      expect(command.regex.test('shout @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('shouts')).toBe(false);
      expect(command.regex.test('shouting')).toBe(false);
      expect(command.regex.test('sho')).toBe(false);
    });
  });
});
