import { Test, TestingModule } from '@nestjs/testing';
import { MusicService } from './music.service';
import { DiscordService } from '#discord/discord.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Guild } from '#database/entities/guild.entity';
import { MusicChannel } from '#database/entities/music-channel.entity';
import { Repository } from 'typeorm';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { Collection } from 'discord.js';

let moduleMetadata = {
  providers: [
    MusicService,
    {
      provide: DiscordService,
      useValue: {
        client: new Client({
          partials: [
            Partials.GuildMember,
            Partials.Message,
            Partials.Channel,
            Partials.User,
            Partials.Reaction,
          ],
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildEmojisAndStickers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildPresences,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.DirectMessageReactions,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildModeration,
          ],
        }),
      },
    },
    {
      provide: getRepositoryToken(Guild),
      useClass: Repository,
    },
    {
      provide: getRepositoryToken(MusicChannel),
      useClass: Repository,
    },
  ],
};

jest.mock('discord.js', () => {
  const originalModule = jest.requireActual('discord.js');
  return {
    ...originalModule,
    Client: jest.fn().mockImplementation(() => ({
      login: jest.fn().mockResolvedValue('mocked_token'),
      channels: {
        fetch: jest.fn().mockResolvedValue({
          messages: {
            fetch: jest.fn().mockResolvedValue({
              last: jest.fn().mockReturnValue({
                edit: jest.fn(),
              }),
            }),
          },
        }),
      },
      user: {
        id: 'mocked_user_id',
      },
      options: {
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMembers,
          GatewayIntentBits.GuildEmojisAndStickers,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.GuildPresences,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMessageReactions,
          GatewayIntentBits.DirectMessages,
          GatewayIntentBits.DirectMessageReactions,
          GatewayIntentBits.GuildVoiceStates,
          GatewayIntentBits.GuildModeration,
        ],
      },
    })),
  };
});

describe('MusicService', () => {
  let service: MusicService;
  let discordService: DiscordService;
  let musicChannelRepository: Repository<MusicChannel>;

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(moduleMetadata).compile();

    service = module.get<MusicService>(MusicService);
    discordService = module.get<DiscordService>(DiscordService);
    musicChannelRepository = module.get<Repository<MusicChannel>>(
      getRepositoryToken(MusicChannel),
    );
    await service.createPlayer();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPlayer', () => {
    it('should create a DisTube player', async () => {
      const distube = await service.createPlayer();
      expect(distube).toBeDefined();
    });
  });

  describe('search', () => {
    it('should return search results', async () => {
      const query = 'test';
      const mockResult = [{ name: 'test song', url: 'http://test.url' }];
      service.youtubePlugin = {
        search: jest.fn().mockResolvedValue(mockResult),
      } as any;

      const result = await service.search({ query });
      expect(result).toEqual(mockResult[0]);
    });
  });

  describe('trackMusic', () => {
    it('should set an interval for tracking music', async () => {
      const guildId = '1000000001112223334';
      const musicChannel = { id: '456' };
      jest
        .spyOn(musicChannelRepository, 'findOne')
        .mockResolvedValue(musicChannel as any);
      jest.spyOn(global, 'setInterval');

      await service.trackMusic(guildId);
      expect(setInterval).toHaveBeenCalled();
    });
  });

  describe('stopTrackingMusic', () => {
    it('should clear the interval for tracking music', async () => {
      const guildId = '1000000001112223334';
      const interval = setInterval(() => {}, 1000);
      service.guildConfig.push({ guildId, interval });
      jest.spyOn(global, 'clearInterval');

      await service.stopTrackingMusic(guildId);
      expect(clearInterval).toHaveBeenCalledWith(interval);
    });
  });

  describe('handleGuildInterval', () => {
    it('should handle guild interval', async () => {
      const guildId = '1000000001112223334';
      const channelId = '456';
      const mockChannel = {
        messages: {
          fetch: jest.fn().mockResolvedValue({
            last: jest.fn().mockReturnValue({
              edit: jest.fn(),
            }),
          }),
        },
      };
      const mockQueue = {
        currentTime: 100,
        songs: [{ duration: 200 }],
      };
      jest
        .spyOn(discordService.client.channels, 'fetch')
        .mockResolvedValue(mockChannel as any);
      service.distube = {
        getQueue: jest.fn().mockReturnValue(mockQueue),
      } as any;

      await service.handleGuildInterval(guildId, channelId);
      expect(mockChannel.messages.fetch).toHaveBeenCalled();
    });
  });

  describe('registerEvents', () => {
    let distubeMock: any;

    beforeEach(() => {
      distubeMock = {
        on: jest.fn().mockReturnThis(),
      };
    });

    it('should register DisTube event listeners', () => {
      service.registerEvents(distubeMock);

      expect(distubeMock.on).toHaveBeenCalledWith(
        'playSong',
        expect.any(Function),
      );
      expect(distubeMock.on).toHaveBeenCalledWith(
        'addSong',
        expect.any(Function),
      );
      expect(distubeMock.on).toHaveBeenCalledWith(
        'addList',
        expect.any(Function),
      );
      expect(distubeMock.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      );
      expect(distubeMock.on).toHaveBeenCalledWith(
        'finish',
        expect.any(Function),
      );
      expect(distubeMock.on).toHaveBeenCalledWith(
        'finishSong',
        expect.any(Function),
      );
      expect(distubeMock.on).toHaveBeenCalledWith(
        'disconnect',
        expect.any(Function),
      );
      expect(distubeMock.on).toHaveBeenCalledWith(
        'empty',
        expect.any(Function),
      );
    });

    it('should handle playSong event', async () => {
      service.registerEvents(distubeMock);
      const playSongHandler = distubeMock.on.mock.calls.find(
        (call) => call[0] === 'playSong',
      )?.[1];
      expect(playSongHandler).toBeDefined();

      const queue = {
        textChannel: {
          guild: { id: '1000000001112223334' },
          send: jest.fn(),
          setTopic: jest.fn(),
        },
        setVolume: jest.fn(),
        volume: 50,
      };
      const song = {};

      // Mock the findOne method of musicChannelRepository
      jest
        .spyOn(musicChannelRepository, 'findOne')
        .mockResolvedValue({ id: '456' } as any);

      // Create a mock TextChannel with a send method
      const mockTextChannel = {
        send: jest.fn(),
        messages: {
          fetch: jest.fn().mockResolvedValue(
            new Collection([
              ['message1', { delete: jest.fn() }],
              ['message2', { delete: jest.fn() }],
            ]),
          ),
        },
      };

      // Mock the fetch method of discord.client.channels to return the mock TextChannel
      jest
        .spyOn(discordService.client.channels, 'fetch')
        .mockResolvedValue(mockTextChannel as any);

      await playSongHandler(queue, song);

      expect(queue.setVolume).toHaveBeenCalledWith(50);
      expect(queue.textChannel.send).toHaveBeenCalled();
      expect(queue.textChannel.setTopic).toHaveBeenCalled();
    });

    it('should handle addSong event', () => {
      service.registerEvents(distubeMock);
      const addSongHandler = distubeMock.on.mock.calls.find(
        (call) => call[0] === 'addSong',
      )?.[1];
      expect(addSongHandler).toBeDefined();

      const queue = { textChannel: { send: jest.fn() } };
      const song = {
        name: 'test song',
        formattedDuration: '3:00',
        user: 'test user',
      };

      addSongHandler(queue, song);

      expect(queue.textChannel.send).toHaveBeenCalledWith(
        'Added test song - `3:00` to the queue by test user',
      );
    });

    it('should handle addList event', () => {
      service.registerEvents(distubeMock);
      const addListHandler = distubeMock.on.mock.calls.find(
        (call) => call[0] === 'addList',
      )?.[1];
      expect(addListHandler).toBeDefined();

      const queue = { textChannel: { send: jest.fn() } };
      const playlist = { songs: [1, 2, 3] };

      addListHandler(queue, playlist);

      expect(queue.textChannel.send).toHaveBeenCalledWith(
        'Added 3 songs to queue\n',
      );
    });

    it('should handle error event', () => {
      service.registerEvents(distubeMock);
      const errorHandler = distubeMock.on.mock.calls.find(
        (call) => call[0] === 'error',
      )?.[1];
      expect(errorHandler).toBeDefined();

      const textChannel = {};
      const error = new Error('test error');

      console.error = jest.fn();

      errorHandler(textChannel, error);

      expect(console.error).toHaveBeenCalledWith(error);
    });

    it('should handle finish event', async () => {
      service.registerEvents(distubeMock);
      const finishHandler = distubeMock.on.mock.calls.find(
        (call) => call[0] === 'finish',
      )?.[1];
      expect(finishHandler).toBeDefined();

      const queue = { textChannel: { guild: { id: '1000000001112223334' } } };

      service.stopTrackingMusic = jest.fn();
      service.clearPlayer = jest.fn();

      await finishHandler(queue);

      expect(service.stopTrackingMusic).toHaveBeenCalledWith(
        '1000000001112223334',
      );
      expect(service.clearPlayer).toHaveBeenCalledWith(queue.textChannel);
    });

    it('should handle disconnect event', () => {
      service.registerEvents(distubeMock);
      const disconnectHandler = distubeMock.on.mock.calls.find(
        (call) => call[0] === 'disconnect',
      )?.[1];
      expect(disconnectHandler).toBeDefined();

      const queue = { textChannel: { send: jest.fn() } };

      disconnectHandler(queue);

      expect(queue.textChannel.send).toHaveBeenCalledWith('Disconnected!');
    });

    it('should handle empty event', () => {
      service.registerEvents(distubeMock);
      const emptyHandler = distubeMock.on.mock.calls.find(
        (call) => call[0] === 'empty',
      )?.[1];
      expect(emptyHandler).toBeDefined();

      const queue = { textChannel: { send: jest.fn() } };

      emptyHandler(queue);

      expect(queue.textChannel.send).toHaveBeenCalledWith(
        'The voice channel is empty! Leaving the voice channel...',
      );
    });
  });

  describe('muteMusic', () => {
    let interaction: any;
    let queue: any;

    beforeEach(() => {
      interaction = {
        guild: { id: '1000000001112223334' },
        channel: { send: jest.fn() },
      };

      queue = {
        volume: 50,
        songs: [{ name: 'test song' }],
      };

      service.distube = {
        getQueue: jest.fn().mockReturnValue(queue),
        setVolume: jest.fn(),
      };

      service.sendEmbed = jest.fn();
    });

    it('should mute the music if it is not muted', async () => {
      await service.muteMusic(interaction);

      expect(service.distube.setVolume).toHaveBeenCalledWith(
        '1000000001112223334',
        0,
      );
      expect(service.sendEmbed).toHaveBeenCalledWith({
        musicChannel: interaction.channel,
        queue,
        song: queue.songs[0],
        muted: true,
        interaction,
      });
    });

    it('should unmute the music if it is muted', async () => {
      queue.volume = 0;
      service.guildConfig.push({ guildId: '1000000001112223334', volume: 50 });

      await service.muteMusic(interaction);

      expect(service.distube.setVolume).toHaveBeenCalledWith(
        '1000000001112223334',
        50,
      );
      expect(service.sendEmbed).toHaveBeenCalledWith({
        musicChannel: interaction.channel,
        queue,
        song: queue.songs[0],
        muted: false,
        interaction,
      });
    });
  });

  describe('pauseMusic', () => {
    let interaction: any;
    let queue: any;

    beforeEach(() => {
      interaction = {
        guild: { id: '1000000001112223334' },
        channel: { send: jest.fn() },
      };

      queue = {
        paused: false,
        songs: [{ name: 'test song' }],
      };

      service.distube = {
        getQueue: jest.fn().mockReturnValue(queue),
        pause: jest.fn(),
        resume: jest.fn(),
      };

      service.sendEmbed = jest.fn();
    });

    it('should pause the music if it is playing', async () => {
      await service.pauseMusic(interaction);

      expect(service.distube.pause).toHaveBeenCalledWith('1000000001112223334');
      expect(service.sendEmbed).toHaveBeenCalledWith({
        musicChannel: interaction.channel,
        queue,
        song: queue.songs[0],
        paused: true,
        interaction,
      });
    });

    it('should resume the music if it is paused', async () => {
      queue.paused = true;

      await service.pauseMusic(interaction);

      expect(service.distube.resume).toHaveBeenCalledWith(
        '1000000001112223334',
      );
      expect(service.sendEmbed).toHaveBeenCalledWith({
        musicChannel: interaction.channel,
        queue,
        song: queue.songs[0],
        paused: false,
        interaction,
      });
    });
  });

  describe('setVolume', () => {
    let service: MusicService;
    let discordService: DiscordService;
    let musicChannelRepository: Repository<MusicChannel>;
    let interaction: any;
    let queue: any;

    beforeEach(async () => {
      const module: TestingModule =
        await Test.createTestingModule(moduleMetadata).compile();

      service = module.get<MusicService>(MusicService);
      discordService = module.get<DiscordService>(DiscordService);
      musicChannelRepository = module.get<Repository<MusicChannel>>(
        getRepositoryToken(MusicChannel),
      );

      interaction = {
        guild: { id: '1000000001112223334' },
        channel: { send: jest.fn() },
      };

      queue = {
        songs: [{ name: 'test song' }],
      };

      service.distube = {
        getQueue: jest.fn().mockReturnValue(queue),
        setVolume: jest.fn(),
      };

      service.sendEmbed = jest.fn();
    });

    it('should set the volume and update the music channel', async () => {
      const musicChannel = { id: '456' };
      jest
        .spyOn(musicChannelRepository, 'findOne')
        .mockResolvedValue(musicChannel as any);
      jest
        .spyOn(discordService.client.channels, 'fetch')
        .mockResolvedValue(interaction.channel);

      await service.setVolume(interaction, 50);

      expect(service.distube.setVolume).toHaveBeenCalledWith(
        '1000000001112223334',
        50,
      );
      expect(service.sendEmbed).toHaveBeenCalledWith({
        musicChannel: interaction.channel,
        queue,
        song: queue.songs[0],
        interaction,
      });
    });

    it('should not set the volume if it is out of range', async () => {
      await service.setVolume(interaction, -10);
      await service.setVolume(interaction, 110);

      expect(service.distube.setVolume).not.toHaveBeenCalled();
      expect(service.sendEmbed).not.toHaveBeenCalled();
    });
  });

  describe('clearPlayer', () => {
    let service: MusicService;
    let discordService: DiscordService;
    let musicChannelRepository: Repository<MusicChannel>;
    let channel: any;

    beforeEach(async () => {
      const module: TestingModule =
        await Test.createTestingModule(moduleMetadata).compile();

      service = module.get<MusicService>(MusicService);
      discordService = module.get<DiscordService>(DiscordService);
      musicChannelRepository = module.get<Repository<MusicChannel>>(
        getRepositoryToken(MusicChannel),
      );

      channel = {
        guild: { id: '1000000001112223334' },
        send: jest.fn(),
        messages: {
          fetch: jest.fn().mockResolvedValue(
            new Collection([
              ['message1', { delete: jest.fn() }],
              ['message2', { delete: jest.fn() }],
            ]),
          ),
        },
        setTopic: jest.fn(),
      };
    });

    it('should clear the player and delete all messages in the music channel', async () => {
      const musicChannel = { id: '456' };
      jest
        .spyOn(musicChannelRepository, 'findOne')
        .mockResolvedValue(musicChannel as any);
      jest
        .spyOn(discordService.client.channels, 'fetch')
        .mockResolvedValue(channel);

      await service.clearPlayer(channel);

      expect(channel.messages.fetch).toHaveBeenCalled();
      expect(
        channel.messages.fetch().then((messages) => {
          messages.forEach((message) => {
            expect(message.delete).toHaveBeenCalled();
          });
        }),
      );
      expect(channel.setTopic).toHaveBeenCalledWith('🎵 Now Playing: Nothing');
    });

    it('should return if the music channel is not found', async () => {
      jest.spyOn(musicChannelRepository, 'findOne').mockResolvedValue(null);

      await service.clearPlayer(channel);

      expect(channel.messages.fetch).not.toHaveBeenCalled();
      expect(channel.setTopic).not.toHaveBeenCalled();
    });

    it('should return if the channel is not found', async () => {
      const musicChannel = { id: '456' };
      jest
        .spyOn(musicChannelRepository, 'findOne')
        .mockResolvedValue(musicChannel as any);
      jest
        .spyOn(discordService.client.channels, 'fetch')
        .mockResolvedValue(null);

      await service.clearPlayer(channel);

      expect(channel.messages.fetch).not.toHaveBeenCalled();
      expect(channel.setTopic).not.toHaveBeenCalled();
    });
  });

  describe('resumeMusic', () => {
    let interaction: any;
    let queue: any;

    beforeEach(() => {
      interaction = {
        guild: { id: '1000000001112223334' },
        channel: { send: jest.fn() },
      };

      queue = {
        songs: [{ name: 'test song' }],
      };

      service.distube = {
        getQueue: jest.fn().mockReturnValue(queue),
        resume: jest.fn(),
      };

      service.sendEmbed = jest.fn();
    });

    it('should resume the music if it is paused', async () => {
      await service.resumeMusic(interaction);

      expect(service.distube.resume).toHaveBeenCalledWith(
        '1000000001112223334',
      );
      expect(service.sendEmbed).toHaveBeenCalledWith({
        musicChannel: interaction.channel,
        queue,
        song: queue.songs[0],
        paused: false,
        interaction,
      });
    });

    it('should not resume the music if there is no queue', async () => {
      service.distube.getQueue = jest.fn().mockReturnValue(null);

      await service.resumeMusic(interaction);

      expect(service.distube.resume).not.toHaveBeenCalled();
      expect(service.sendEmbed).not.toHaveBeenCalled();
    });
  });

  describe('repeatQueue', () => {
    let interaction: any;
    let queue: any;

    beforeEach(() => {
      interaction = {
        guild: { id: '1000000001112223334' },
        channel: { send: jest.fn() },
      };

      queue = {
        repeatMode: 0,
        songs: [{ name: 'test song' }],
      };

      service.distube = {
        getQueue: jest.fn().mockReturnValue(queue),
        setRepeatMode: jest.fn(),
      };

      service.sendEmbed = jest.fn();
    });

    it('should cycle repeat mode from off to song', async () => {
      jest
        .spyOn(musicChannelRepository, 'findOne')
        .mockResolvedValue({ id: '456' } as any);
      await service.repeatQueue(interaction);

      expect(service.distube.setRepeatMode).toHaveBeenCalledWith(
        '1000000001112223334',
        1,
      );
      expect(service.sendEmbed).toHaveBeenCalled();
    });

    it('should cycle repeat mode from song to queue', async () => {
      queue.repeatMode = 1;
      jest
        .spyOn(musicChannelRepository, 'findOne')
        .mockResolvedValue({ id: '456' } as any);
      await service.repeatQueue(interaction);

      expect(service.distube.setRepeatMode).toHaveBeenCalledWith(
        '1000000001112223334',
        2,
      );
      expect(service.sendEmbed).toHaveBeenCalled();
    });

    it('should cycle repeat mode from queue to off', async () => {
      queue.repeatMode = 2;
      jest
        .spyOn(musicChannelRepository, 'findOne')
        .mockResolvedValue({ id: '456' } as any);
      await service.repeatQueue(interaction);

      expect(service.distube.setRepeatMode).toHaveBeenCalledWith(
        '1000000001112223334',
        0,
      );
      expect(service.sendEmbed).toHaveBeenCalled();
    });

    it('should not set repeat mode if there is no queue', async () => {
      service.distube.getQueue = jest.fn().mockReturnValue(null);
      jest
        .spyOn(musicChannelRepository, 'findOne')
        .mockResolvedValue({ id: '456' } as any);
      await service.repeatQueue(interaction);

      expect(service.distube.setRepeatMode).not.toHaveBeenCalled();
      expect(service.sendEmbed).not.toHaveBeenCalled();
    });
  });

  describe('updateMusicChannel', () => {
    let params: any;
    let mockTextChannel: any;

    beforeEach(() => {
      params = {
        channel: {
          guild: { id: '1000000001112223334' },
        },
        song: { name: 'test song' },
      };

      mockTextChannel = {
        send: jest.fn(),
        messages: {
          fetch: jest.fn().mockResolvedValue(
            new Collection([
              ['message1', { delete: jest.fn() }],
              ['message2', { delete: jest.fn() }],
            ]),
          ),
        },
      };

      service.distube = {
        getQueue: jest.fn().mockReturnValue({ songs: [params.song] }),
      };

      service.sendEmbed = jest.fn();
    });

    it('should update the music channel with the current song', async () => {
      jest
        .spyOn(musicChannelRepository, 'findOne')
        .mockResolvedValue({ id: '456' } as any);
      jest
        .spyOn(discordService.client.channels, 'fetch')
        .mockResolvedValue(mockTextChannel);

      await service.updateMusicChannel(params);

      expect(mockTextChannel.messages.fetch).toHaveBeenCalled();
      expect(service.sendEmbed).toHaveBeenCalledWith({
        musicChannel: params.channel,
        song: params.song,
        queue: { songs: [params.song] },
      });
    });

    it('should return if the music channel is not found', async () => {
      jest.spyOn(musicChannelRepository, 'findOne').mockResolvedValue(null);

      await service.updateMusicChannel(params);

      expect(mockTextChannel.messages.fetch).not.toHaveBeenCalled();
      expect(service.sendEmbed).not.toHaveBeenCalled();
    });

    it('should return if the channel is not found', async () => {
      jest
        .spyOn(musicChannelRepository, 'findOne')
        .mockResolvedValue({ id: '456' } as any);
      jest
        .spyOn(discordService.client.channels, 'fetch')
        .mockResolvedValue(null);

      await service.updateMusicChannel(params);

      expect(mockTextChannel.messages.fetch).not.toHaveBeenCalled();
      expect(service.sendEmbed).not.toHaveBeenCalled();
    });
  });
});
