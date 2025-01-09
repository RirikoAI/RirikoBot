import { Test, TestingModule } from '@nestjs/testing';
import ConfusedCommand from './confused.command';
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

describe('ConfusedCommand', () => {
  let command: ConfusedCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ConfusedCommand,
          useValue: new ConfusedCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<ConfusedCommand>(ConfusedCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('confused');
    expect(command.regex).toEqual(new RegExp('^confused$|^confused ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['confused @user']);
    expect(command.reactionType).toBe('confused');
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
    it('should match valid confused commands', () => {
      expect(command.regex.test('confused')).toBe(true);
      expect(command.regex.test('confused @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('confusing')).toBe(false);
      expect(command.regex.test('confusion')).toBe(false);
      expect(command.regex.test('confus')).toBe(false);
    });
  });
});
