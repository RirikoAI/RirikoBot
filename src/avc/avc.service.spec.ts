// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import { AvcService } from './avc.service';
import { DiscordService } from '#discord/discord.service';
import { Repository } from 'typeorm';
import { VoiceChannel } from '#database/entities/voice-channel.entity';
import { Guild } from '#database/entities/guild.entity';
import { VoiceState } from 'discord.js';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { AvcModule } from '#avc/avc.module';
import { DiscordModule } from '#discord/discord.module';
import { MusicChannel } from "#database/entities/music-channel.entity";

describe('AvcService', () => {
  let service: AvcService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let discordService: DiscordService;
  let voiceChannelRepository: Repository<VoiceChannel>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let guildRepository: Repository<Guild>;

  const mockGuild = {
    id: 'guild1',
    channels: {
      cache: new Map(),
      create: jest.fn(),
    },
  } as unknown as Guild;

  const mockVoiceChannel = {
    id: 'vc1',
    name: 'Voice Channel 1',
    parentId: '0',
    position: 1,
    guild: mockGuild,
  } as unknown as VoiceChannel;

  const mockVoiceState = {
    guild: mockGuild,
    member: {
      id: 'user1',
      user: {
        username: 'user1',
      },
      voice: { setChannel: jest.fn() },
    },
    channel: mockVoiceChannel,
  } as unknown as VoiceState;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        // Set up TypeOrmModule with an in-memory SQLite database for testing
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:', // In-memory database
          entities: [VoiceChannel, Guild, MusicChannel], // Include your entities
          synchronize: true, // Automatically synchronize the schema
          dropSchema: true, // Drop schema on every test to start fresh
        }),
        TypeOrmModule.forFeature([VoiceChannel, Guild, MusicChannel]), // Import repositories for testing

        // Make sure both modules are included
        AvcModule,
        DiscordModule,
      ],
      providers: [
        AvcService,
        {
          provide: DiscordService,
          useValue: jest.fn(),
        },
        {
          provide: getRepositoryToken(Guild),
          useValue: { findOne: jest.fn(), find: jest.fn() },
        },
        {
          provide: getRepositoryToken(VoiceChannel),
          useValue: {
            findOne: jest.fn(),
            insert: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MusicChannel),
          useValue: {
            findOne: jest.fn(),
            insert: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
      exports: [AvcService],
    }).compile();

    service = module.get<AvcService>(AvcService);
    discordService = module.get<DiscordService>(DiscordService);
    voiceChannelRepository = module.get(getRepositoryToken(VoiceChannel));
    guildRepository = module.get(getRepositoryToken(Guild));
  });

  describe('check', () => {
    it('should create a child voice channel when a user joins a parent channel without a parent', async () => {
      // Mock the return value of findVoiceChannel
      jest
        .spyOn(service, 'findVoiceChannel')
        .mockResolvedValue(mockVoiceChannel);
      jest
        .spyOn(service, 'createChildVoiceChannel')
        .mockResolvedValue(undefined);

      // Call the check method
      await service.check(mockVoiceState, mockVoiceState);

      // Ensure createChildVoiceChannel is called
      expect(service.createChildVoiceChannel).toHaveBeenCalledWith(
        mockGuild,
        mockVoiceChannel,
        mockVoiceState,
      );
    });

    it('should not create a child voice channel if the parent has a parent ID', async () => {
      mockVoiceChannel.parentId = '123'; // simulate parent having a parent
      jest
        .spyOn(service, 'createChildVoiceChannel')
        .mockResolvedValue(undefined);
      // Call the check method
      await service.check(mockVoiceState, mockVoiceState);

      // Ensure createChildVoiceChannel is not called
      expect(service.createChildVoiceChannel).not.toHaveBeenCalled();
    });
  });

  describe('createChildVoiceChannel', () => {
    it('should create a new voice channel on Discord and save it to the database', async () => {
      const mockNewChannel = {
        id: 'vc2',
        name: "user1's Channel",
        position: 2,
        parent: mockVoiceChannel.parent,
      };

      const mockCreatedChannel = {
        ...mockNewChannel,
        permissionOverwrites: { set: jest.fn() },
      };

      // Mock the DiscordService's channels.create
      jest
        .spyOn(mockGuild.channels, 'create')
        .mockResolvedValue(mockCreatedChannel);
      jest.spyOn(service, 'setChannelPermissions').mockResolvedValue(undefined);
      jest
        .spyOn(service, 'saveVoiceChannelToDatabase')
        .mockResolvedValue(undefined);
      jest.spyOn(service, 'moveUserToChannel').mockResolvedValue(undefined);

      // Call the method
      await service.createChildVoiceChannel(
        mockGuild,
        mockVoiceChannel,
        mockVoiceState,
      );

      // Ensure the channel was created
      expect(mockGuild.channels.create).toHaveBeenCalledWith({
        type: 2, // ChannelType.GuildVoice
        name: "user1's Channel",
        position: 2,
        parent: mockVoiceChannel.parent,
      });

      // Ensure permissions were set
      expect(service.setChannelPermissions).toHaveBeenCalledWith(
        mockCreatedChannel,
        mockVoiceState,
      );
    });
  });

  describe('cleanVoiceChannels', () => {
    it('should clean up voice channels in the guild', async () => {
      const mockVoiceChannels = [
        { id: 'vc1', guild: { id: 'guild1' } },
        { id: 'vc2', guild: { id: 'guild1' } },
      ] as unknown as VoiceChannel[];

      jest
        .spyOn(voiceChannelRepository, 'find')
        .mockResolvedValue(mockVoiceChannels);
      jest
        .spyOn(service, 'removeVoiceChannelFromDatabase')
        .mockResolvedValue(undefined);
      jest
        .spyOn(service, 'removeEmptyChildChannels')
        .mockResolvedValue(undefined);

      // Call the method
      await service.cleanVoiceChannels(mockGuild);

      // Ensure cleanup methods are called
      expect(service.removeVoiceChannelFromDatabase).toHaveBeenCalled();
      expect(service.removeEmptyChildChannels).toHaveBeenCalled();
    });
  });

  describe('removeEmptyChildChannels', () => {
    it('should remove empty child channels', async () => {
      const mockVoiceChannels = [
        { id: 'vc1', parentId: 'parent1', guild: { id: 'guild1' } },
      ] as unknown as VoiceChannel[];

      const mockChannel = { members: { size: 0 }, delete: jest.fn() };

      jest
        .spyOn(voiceChannelRepository, 'find')
        .mockResolvedValue(mockVoiceChannels);
      jest.spyOn(mockGuild.channels.cache, 'get').mockReturnValue(mockChannel);
      jest.spyOn(voiceChannelRepository, 'remove').mockResolvedValue(undefined);

      // Call the method
      await service.removeEmptyChildChannels(mockGuild);

      // Ensure empty child channels are removed
      expect(mockChannel.delete).toHaveBeenCalled();
      expect(voiceChannelRepository.remove).toHaveBeenCalledWith(
        mockVoiceChannels[0],
      );
    });
  });
});
