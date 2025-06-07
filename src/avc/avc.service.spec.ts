import { Test, TestingModule } from '@nestjs/testing';
import { AvcService } from './avc.service';
import { DiscordService } from '#discord/discord.service';
import { DatabaseService } from '#database/database.service';
import {
  VoiceState,
  Guild,
  ChannelType,
  PermissionsBitField,
} from 'discord.js';
import { VoiceChannel } from '#database/entities/voice-channel.entity';

describe('AvcService', () => {
  let service: AvcService;
  let databaseService: DatabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvcService,
        {
          provide: DiscordService,
          useValue: {
            // Mock methods and properties as needed
          },
        },
        {
          provide: DatabaseService,
          useValue: {
            voiceChannelRepository: {
              findOne: jest.fn(),
              insert: jest.fn(),
              remove: jest.fn(),
              save: jest.fn(),
              find: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AvcService>(AvcService);
    databaseService = module.get<DatabaseService>(DatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('check', () => {
    it('should call cleanVoiceChannels and createChildVoiceChannel if conditions are met', async () => {
      const oldState = {} as VoiceState;
      const newState = {
        guild: {} as Guild,
        channel: { id: '123', parentId: '0' },
        member: { user: { username: 'test' } },
      } as VoiceState;

      jest
        .spyOn(service, 'cleanVoiceChannels' as any)
        .mockResolvedValue({} as any);
      jest
        .spyOn(service, 'findVoiceChannel' as any)
        .mockResolvedValue({ parentId: '0' } as VoiceChannel);
      jest
        .spyOn(service, 'createChildVoiceChannel' as any)
        .mockResolvedValue({} as any);

      await service.check(oldState, newState);

      expect((service as any).cleanVoiceChannels).toHaveBeenCalledWith(
        newState.guild,
      );
      expect((service as any).createChildVoiceChannel).toHaveBeenCalledWith(
        newState.guild,
        { parentId: '0' },
        newState,
      );
    });
  });

  describe('findVoiceChannel', () => {
    it('should return a voice channel if found', async () => {
      const channelId = '123';
      const voiceChannel = { id: channelId } as VoiceChannel;
      jest
        .spyOn(databaseService.voiceChannelRepository, 'findOne')
        .mockResolvedValue(voiceChannel);

      const result = await (service as any).findVoiceChannel(channelId);

      expect(result).toEqual(voiceChannel);
      expect(
        databaseService.voiceChannelRepository.findOne,
      ).toHaveBeenCalledWith({ where: { id: channelId } });
    });
  });

  describe('createChildVoiceChannel', () => {
    it('should create a new child voice channel and move the user to it', async () => {
      const guild = {} as Guild;
      const voiceChannel = { id: '123' } as VoiceChannel;
      const newState = {
        member: {
          user: { username: 'test' },
          voice: { setChannel: jest.fn() },
        },
        channel: { position: 1, parent: {} },
      } as any as VoiceState;
      const newChannel = {
        id: '456',
        name: "test's Channel",
        permissionOverwrites: { set: jest.fn() },
      };

      jest
        .spyOn(service, 'createDiscordVoiceChannel' as any)
        .mockResolvedValue(newChannel as any);
      jest.spyOn(service, 'setChannelPermissions' as any).mockResolvedValue({});
      jest
        .spyOn(service, 'saveVoiceChannelToDatabase' as any)
        .mockResolvedValue({});

      await (service as any).createChildVoiceChannel(
        guild,
        voiceChannel,
        newState,
      );

      expect((service as any).createDiscordVoiceChannel).toHaveBeenCalledWith(
        guild,
        newState,
      );
      expect((service as any).setChannelPermissions).toHaveBeenCalledWith(
        newChannel as any,
        newState,
      );
      expect((service as any).saveVoiceChannelToDatabase).toHaveBeenCalledWith(
        newChannel as any,
        voiceChannel,
        guild,
      );
      expect(newState.member.voice.setChannel).toHaveBeenCalledWith(
        newChannel as any,
      );
    });
  });

  describe('cleanVoiceChannels', () => {
    it('should clean up missing or empty voice channels', async () => {
      const guild = { id: 'guild1', channels: { cache: new Map() } } as any;
      const voiceChannels = [
        { id: '123', name: 'test', parentId: '0' },
      ] as VoiceChannel[];

      jest
        .spyOn(databaseService.voiceChannelRepository, 'find')
        .mockResolvedValue(voiceChannels);
      jest
        .spyOn(service, 'removeVoiceChannelFromDatabase' as any)
        .mockResolvedValue({} as any);
      jest
        .spyOn(service, 'updateChannelNameIfNeeded' as any)
        .mockResolvedValue({} as any);
      jest
        .spyOn(service, 'removeEmptyChildChannels' as any)
        .mockResolvedValue({} as any);

      await (service as any).cleanVoiceChannels(guild);

      expect(databaseService.voiceChannelRepository.find).toHaveBeenCalledWith({
        where: { guild: { id: guild.id } },
      });
      expect(
        (service as any).removeVoiceChannelFromDatabase,
      ).toHaveBeenCalledWith(voiceChannels[0]);
      expect((service as any).removeEmptyChildChannels).toHaveBeenCalledWith(
        guild,
      );
    });
  });

  describe('createDiscordVoiceChannel', () => {
    it('should create a new Discord voice channel', async () => {
      const guild = { channels: { create: jest.fn() } } as any;
      const newState = {
        member: { user: { username: 'test' } },
        channel: { position: 1, parent: {} },
      } as VoiceState;
      const newChannel = { id: '456', name: "test's Channel" };

      guild.channels.create.mockResolvedValue(newChannel);

      const result = await (service as any).createDiscordVoiceChannel(
        guild,
        newState,
      );

      expect(guild.channels.create).toHaveBeenCalledWith({
        type: ChannelType.GuildVoice,
        name: "test's Channel",
        position: 2,
        parent: {},
      });
      expect(result).toEqual(newChannel);
    });
  });

  describe('setChannelPermissions', () => {
    it('should set permissions for the new voice channel', async () => {
      const channel = {
        permissionOverwrites: {
          set: jest.fn(),
          edit: jest.fn(),
        },
      } as any;

      const parentOverwrites = [
        {
          id: 'member1',
          allow: [PermissionsBitField.Flags.ViewChannel],
          deny: [],
          type: 1,
        },
        {
          id: 'guild1',
          allow: [PermissionsBitField.Flags.ViewChannel],
          deny: [],
          type: 0,
        },
      ];

      const newState = {
        member: { id: 'member1' },
        guild: { id: 'guild1' },
        channel: {
          permissionOverwrites: {
            cache: {
              map: jest.fn().mockReturnValue(parentOverwrites),
            },
          },
        },
      } as unknown as VoiceState;

      await (service as any).setChannelPermissions(channel, newState);

      // Verify parent permissions are copied
      expect(newState.channel.permissionOverwrites.cache.map).toHaveBeenCalled();
      expect(channel.permissionOverwrites.set).toHaveBeenCalledWith(parentOverwrites);

      // Verify member-specific permissions are set
      expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith('member1', {
        ViewChannel: true,
        Connect: true,
        Speak: true,
        ManageChannels: true,
      });
    });
  });

  describe('saveVoiceChannelToDatabase', () => {
    it('should save the new voice channel to the database', async () => {
      const channel = { id: '456', name: "test's Channel" } as any;
      const voiceChannel = { id: '123' } as VoiceChannel;
      const guild = { id: 'guild1' } as any;

      await (service as any).saveVoiceChannelToDatabase(
        channel,
        voiceChannel,
        guild,
      );

      expect(
        databaseService.voiceChannelRepository.insert,
      ).toHaveBeenCalledWith({
        id: '456',
        name: "test's Channel",
        parentId: '123',
        guild: { id: 'guild1' },
      });
    });
  });

  describe('moveUserToChannel', () => {
    it('should move the user to the new channel', async () => {
      const newState = { member: { voice: { setChannel: jest.fn() } } } as any;
      const newChannel = { id: '456' } as any;

      await (service as any).moveUserToChannel(newState, newChannel);

      expect(newState.member.voice.setChannel).toHaveBeenCalledWith(newChannel);
    });
  });

  describe('removeVoiceChannelFromDatabase', () => {
    it('should remove the voice channel from the database', async () => {
      const voiceChannel = { id: '123' } as VoiceChannel;

      await (service as any).removeVoiceChannelFromDatabase(voiceChannel);

      expect(
        databaseService.voiceChannelRepository.remove,
      ).toHaveBeenCalledWith(voiceChannel);
    });
  });

  describe('updateChannelNameIfNeeded', () => {
    it('should update the channel name if it has changed', async () => {
      const guild = { channels: { cache: new Map() } } as any;
      const voiceChannel = { id: '123', name: 'oldName' } as VoiceChannel;
      const channel = { id: '123', name: 'newName' } as any;

      guild.channels.cache.set('123', channel);

      await (service as any).updateChannelNameIfNeeded(guild, voiceChannel);

      expect(databaseService.voiceChannelRepository.save).toHaveBeenCalledWith({
        ...voiceChannel,
        name: 'newName',
      });
    });
  });

  describe('removeEmptyChildChannels', () => {
    it('should remove empty child channels from the database and Discord', async () => {
      const guild = { id: 'guild1', channels: { cache: new Map() } } as any;
      const voiceChannels = [{ id: '123', parentId: '0' }] as VoiceChannel[];
      const channel = {
        id: '123',
        members: { size: 0 },
        delete: jest.fn(),
      } as any;

      guild.channels.cache.set('123', channel);
      jest
        .spyOn(databaseService.voiceChannelRepository, 'find')
        .mockResolvedValue(voiceChannels);

      await (service as any).removeEmptyChildChannels(guild);

      expect(
        databaseService.voiceChannelRepository.remove,
      ).toHaveBeenCalledWith(voiceChannels[0]);
      expect(channel.delete).toHaveBeenCalled();
    });
  });

  describe('updateVoiceChannelName', () => {
    it('should update the voice channel name in the database', async () => {
      const voiceChannel = { id: '123', name: 'oldName' } as VoiceChannel;
      const newName = 'newName';

      await (service as any).updateVoiceChannelName(voiceChannel, newName);

      expect(databaseService.voiceChannelRepository.save).toHaveBeenCalledWith({
        ...voiceChannel,
        name: newName,
      });
    });
  });
});
