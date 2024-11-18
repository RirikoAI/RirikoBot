import { Test, TestingModule } from '@nestjs/testing';
import LyricsCommand from './lyrics.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { EmbedBuilder, Guild, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock } from '../../../test/mocks/shared-services.mock';
import { Song } from 'genius-lyrics';

describe('LyricsCommand', () => {
  let command: LyricsCommand;
  let mockGuild: Guild;
  let mockUser: User;
  const mockDiscordService = {
    client: {
      user: {
        displayAvatarURL: jest.fn(),
      },
      musicPlayer: {
        getQueue: jest.fn(),
      },
    },
  };
  const mockCommandService = {
    getGuildPrefix: jest.fn(),
  };
  const mockSharedServices: SharedServicesMock = {
    config: {} as ConfigService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    autoVoiceChannelService: {} as any,
    guildRepository: {} as any,
    voiceChannelRepository: {} as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: LyricsCommand,
          useValue: new LyricsCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<LyricsCommand>(LyricsCommand);

    mockUser = {
      id: '1234567890',
      username: 'TestUser',
      displayAvatarURL: jest.fn().mockReturnValue('http://avatar.url'),
    } as unknown as User;

    mockGuild = {
      id: '1234567890',
      name: 'Test Guild',
    } as unknown as Guild;
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should reply with the lyrics of the current song', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
        channel: {
          send: {
            bind: jest.fn(),
            send: jest.fn(),
          },
        },
        edit: jest.fn(),
      } as any;

      jest.spyOn(command, 'getCurrentSongName').mockResolvedValue('Test Song');
      jest.spyOn(command, 'getSongList').mockResolvedValue([
        {
          title: 'Test Song',
          artist: { name: 'Test Artist' },
          lyrics: jest.fn().mockResolvedValue('Test Lyrics'),
          url: 'http://lyrics.url',
          thumbnail: 'http://thumbnail.url',
        } as any,
      ]);

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith('Searching for lyrics...');
    });

    it('should reply with an error if no song is playing', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
        channel: {
          send: jest.fn(),
        },
      } as unknown as DiscordMessage;

      jest.spyOn(command, 'getCurrentSongName').mockResolvedValue(null);

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'There is no song playing right now.',
        ephemeral: true,
      });
    });
  });

  describe('runSlash', () => {
    it('should reply with the lyrics of the provided song', async () => {
      const mockInteraction = {
        guild: mockGuild,
        user: mockUser,
        options: {
          getString: jest.fn().mockReturnValue('Test Song'),
        },
        reply: jest.fn(),
        channel: {
          send: jest.fn(),
        },
      } as unknown as DiscordInteraction;

      jest.spyOn(command, 'getSongList').mockResolvedValue([
        {
          title: 'Test Song',
          artist: { name: 'Test Artist' },
          lyrics: jest.fn().mockResolvedValue('Test Lyrics'),
          url: 'http://lyrics.url',
          thumbnail: 'http://thumbnail.url',
        } as any,
      ]);

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'Searching for lyrics...',
      );
    });

    it('should reply with an error if no song is provided', async () => {
      const mockInteraction = {
        guild: mockGuild,
        user: mockUser,
        options: {
          getString: jest.fn().mockReturnValue(null),
        },
        reply: jest.fn(),
        channel: {
          send: jest.fn(),
        },
      } as unknown as DiscordInteraction;

      jest.spyOn(command, 'getCurrentSongName').mockResolvedValue(null);

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'There is no song playing right now.',
        ephemeral: true,
      });
    });
  });

  describe('getCurrentSongName', () => {
    it('should return the name of the current song', async () => {
      const mockQueue = {
        playing: true,
        songs: [{ name: 'Test Song' }],
      } as never;
      jest.spyOn(command.player, 'getQueue').mockResolvedValue(mockQueue);

      const songName = await command.getCurrentSongName(mockGuild.id);
      expect(songName).toBe('Test Song');
    });

    it('should return null if no song is playing', async () => {
      const mockQueue = {
        playing: false,
        songs: [],
      } as never;
      jest.spyOn(command.player, 'getQueue').mockResolvedValue(mockQueue);

      const songName = await command.getCurrentSongName(mockGuild.id);
      expect(songName).toBeNull();
    });
  });

  describe('getSongList', () => {
    it('should return a list of songs matching the song name', async () => {
      const songs = await command.getSongList('Test Song');
      expect(songs).toBeDefined();
    });
  });

  describe('handleSongSelection', () => {
    it("should send an embed with the selected song's lyrics", async () => {
      const mockInteraction = {
        user: mockUser,
        channel: {
          send: jest.fn(),
        },
      } as unknown as DiscordInteraction;

      const mockSongs: Song[] = [
        {
          title: 'Test Song',
          artist: { name: 'Test Artist' },
          lyrics: jest.fn().mockResolvedValue('Test Lyrics'),
          url: 'http://lyrics.url',
          thumbnail: 'http://thumbnail.url',
        } as any,
      ];

      command.searches.push({
        userId: mockUser.id,
        searches: mockSongs,
      });

      await command.handleSongSelection(mockInteraction, '0');

      expect(mockInteraction.channel.send).toHaveBeenCalledWith({
        embeds: [expect.any(EmbedBuilder)],
      });
    });
  });
});
