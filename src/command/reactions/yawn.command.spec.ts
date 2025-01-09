import { Test, TestingModule } from '@nestjs/testing';
import YawnCommand from './yawn.command';
import { SlashCommandOptionTypes } from '#command/command.types';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { SharedServicesMock, TestSharedService } from '../../../test/mocks/shared-services.mock';

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

describe('YawnCommand', () => {
  let command: YawnCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: YawnCommand,
          useValue: new YawnCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<YawnCommand>(YawnCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('yawn');
    expect(command.regex).toEqual(new RegExp('^yawn$|^yawn ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['yawn @user']);
    expect(command.reactionType).toBe('yawn');
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
    it('should match valid yawn commands', () => {
      expect(command.regex.test('yawn')).toBe(true);
      expect(command.regex.test('yawn @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('yawns')).toBe(false);
      expect(command.regex.test('yawning')).toBe(false);
      expect(command.regex.test('yaw')).toBe(false);
    });
  });
});
