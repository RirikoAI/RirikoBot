import { Test, TestingModule } from '@nestjs/testing';
import PinchCommand from './pinch.command';
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

describe('PinchCommand', () => {
  let command: PinchCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PinchCommand,
          useValue: new PinchCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<PinchCommand>(PinchCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('pinch');
    expect(command.regex).toEqual(new RegExp('^pinch$|^pinch ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['pinch @user']);
    expect(command.reactionType).toBe('pinch');
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
    it('should match valid pinch commands', () => {
      expect(command.regex.test('pinch')).toBe(true);
      expect(command.regex.test('pinch @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('pinches')).toBe(false);
      expect(command.regex.test('pinching')).toBe(false);
      expect(command.regex.test('pin')).toBe(false);
    });
  });
});
