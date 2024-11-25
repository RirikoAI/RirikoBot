import { Test, TestingModule } from '@nestjs/testing';
import PrefixCommand from './prefix.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, GuildMember } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock, TestSharedService } from "../../../test/mocks/shared-services.mock";

describe('PrefixCommand', () => {
  let command: PrefixCommand;
  let mockGuild: Guild;
  let mockGuildMember: GuildMember;
  const mockDiscordService = {
    client: {
      user: {
        displayAvatarURL: jest.fn(),
      },
    },
  };
  const mockCommandService = {
    getGuildPrefix: jest.fn().mockResolvedValue('!'),
  };
  const mockSharedServices: SharedServicesMock = {
    ...TestSharedService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    db: {
      guildRepository: {
        upsert: jest.fn(),
      } as any,
      voiceChannelRepository: {} as any,
    }
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PrefixCommand,
          useValue: new PrefixCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<PrefixCommand>(PrefixCommand);

    mockGuildMember = {
      permissions: {
        has: jest.fn().mockReturnValue(true),
      },
    } as unknown as GuildMember;

    mockGuild = {
      id: '1234567890',
      name: 'Test Guild',
    } as unknown as Guild;
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should reply with current prefix if no params are provided', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        content: '!prefix',
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should update the prefix if params are provided', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        content: '!prefix newprefix',
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      command.setParams('!prefix newprefix');

      await command.runPrefix(mockMessage);

      expect(mockSharedServices.db.guildRepository.upsert).toHaveBeenCalledWith(
        {
          id: mockGuild.id,
          prefix: 'newprefix',
          name: mockGuild.name,
        },
        ['id'],
      );
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe('runSlash', () => {
    it('should reply with current prefix if no options are provided', async () => {
      const mockInteraction = {
        guild: mockGuild,
        member: mockGuildMember,
        options: {
          getString: jest.fn().mockReturnValue(null),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should update the prefix if options are provided', async () => {
      const mockInteraction = {
        guild: mockGuild,
        member: mockGuildMember,
        options: {
          getString: jest.fn().mockReturnValue('newprefix'),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockSharedServices.db.guildRepository.upsert).toHaveBeenCalledWith(
        {
          id: mockGuild.id,
          prefix: 'newprefix',
          name: mockGuild.name,
        },
        ['id'],
      );
      expect(mockInteraction.reply).toHaveBeenCalledWith(expect.any(Object));
    });
  });
});
