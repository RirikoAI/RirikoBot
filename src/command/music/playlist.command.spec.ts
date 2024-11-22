import { Test, TestingModule } from '@nestjs/testing';
import PlaylistCommand from './playlist.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { DiscordInteraction } from '#command/command.types';
import { SharedServicesMock, TestSharedService } from '../../../test/mocks/shared-services.mock';

describe('PlaylistCommand', () => {
  let command: PlaylistCommand;
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
  const mockMusicService = {
    search: jest.fn(),
    getControlButtons: jest.fn(),
  };
  const mockPlaylistRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  };
  const mockTrackRepository = {
    delete: jest.fn(),
    insert: jest.fn(),
  };
  
  const mockSharedServices: SharedServicesMock = {
    ...TestSharedService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    musicService: mockMusicService,
    db: {
      playlistRepository: mockPlaylistRepository,
      trackRepository: mockTrackRepository,
    }
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PlaylistCommand,
          useValue: new PlaylistCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<PlaylistCommand>(PlaylistCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runSlash', () => {
    it('should handle create subcommand', async () => {
      const mockInteraction = {
        options: {
          getSubcommand: jest.fn().mockReturnValue('create'),
          getString: jest.fn().mockReturnValue('Test Playlist'),
          getBoolean: jest.fn().mockReturnValue(true),
        },
        user: { id: '1234567890', tag: 'TestUser#1234' },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn(),
      } as unknown as DiscordInteraction;

      jest.spyOn(command, 'handleCreatePlaylist' as any).mockResolvedValue({});

      await command.runSlash(mockInteraction);

      expect((command as any).handleCreatePlaylist).toHaveBeenCalledWith(
        mockInteraction,
      );
    });

    it('should handle delete subcommand', async () => {
      const mockInteraction = {
        options: {
          getSubcommand: jest.fn().mockReturnValue('delete'),
          getString: jest.fn().mockReturnValue('Test Playlist'),
        },
        user: { id: '1234567890' },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn(),
      } as unknown as DiscordInteraction;

      jest.spyOn(command as any, 'handleDeletePlaylist').mockResolvedValue({});

      await command.runSlash(mockInteraction);

      expect((command as any).handleDeletePlaylist).toHaveBeenCalledWith(
        mockInteraction,
      );
    });

    // Add more tests for other subcommands similarly
  });

  describe('handleCreatePlaylist', () => {
    it('should create a playlist', async () => {
      const mockInteraction = {
        options: {
          getString: jest.fn().mockReturnValue('Test Playlist'),
          getBoolean: jest.fn().mockReturnValue(true),
        },
        user: { id: '1234567890', tag: 'TestUser#1234' },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockPlaylistRepository.find.mockResolvedValue([]);
      mockPlaylistRepository.insert.mockResolvedValue({});

      await (command as any).handleCreatePlaylist(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Creating playlist... 🎧',
      });
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: 'Playlist created! 🎧',
      });
    });
  });

  describe('handleDeletePlaylist', () => {
    it('should delete a playlist', async () => {
      const mockInteraction = {
        options: {
          getString: jest.fn().mockReturnValue('Test Playlist'),
        },
        user: { id: '1234567890' },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockPlaylistRepository.findOne.mockResolvedValue({
        name: 'Test Playlist',
      });
      mockTrackRepository.delete.mockResolvedValue({});
      mockPlaylistRepository.delete.mockResolvedValue({});

      await (command as any).handleDeletePlaylist(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Deleting playlist... 🎧',
      });
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: 'Playlist deleted! 🎧',
      });
    });

    // Add more tests for error cases
  });

  describe('handleAddMusic', () => {
    it('should add music to a playlist', async () => {
      const mockInteraction = {
        options: {
          getString: jest
            .fn()
            .mockReturnValueOnce('Test Playlist')
            .mockReturnValueOnce('Test Song'),
        },
        user: { id: '1234567890' },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn(),
      } as unknown as DiscordInteraction;

      const mockPlaylist = { name: 'Test Playlist', tracks: [] };
      const mockSearchResult = { name: 'Test Song', url: 'http://test.url' };

      mockPlaylistRepository.findOne.mockResolvedValue(mockPlaylist);
      mockMusicService.search.mockResolvedValue(mockSearchResult);
      mockTrackRepository.insert.mockResolvedValue({});

      await (command as any).handleAddMusic(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Adding music... 🎧',
      });
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '`Test Song` added to the playlist! 🎧',
      });
    });

    it('should handle errors when adding music', async () => {
      const mockInteraction = {
        options: {
          getString: jest
            .fn()
            .mockReturnValueOnce('Test Playlist')
            .mockReturnValueOnce('Test Song'),
        },
        user: { id: '1234567890' },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockPlaylistRepository.findOne.mockResolvedValue(null);

      await (command as any).handleAddMusic(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: "You don't have a playlist with this name. ❌",
        ephemeral: true,
      });
    });
  });

  describe('handleDeleteMusic', () => {
    it('should delete music from a playlist', async () => {
      const mockInteraction = {
        options: {
          getString: jest
            .fn()
            .mockReturnValueOnce('Test Playlist')
            .mockReturnValueOnce('Test Song'),
        },
        user: { id: '1234567890' },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn(),
      } as unknown as DiscordInteraction;

      const mockPlaylist = {
        name: 'Test Playlist',
        tracks: [{ name: 'Test Song' }],
      };

      mockPlaylistRepository.findOne.mockResolvedValue(mockPlaylist);
      mockTrackRepository.delete.mockResolvedValue({});

      await (command as any).handleDeleteMusic(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should handle errors when deleting music', async () => {
      const mockInteraction = {
        options: {
          getString: jest
            .fn()
            .mockReturnValueOnce('Test Playlist')
            .mockReturnValueOnce('Test Song'),
        },
        user: { id: '1234567890' },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockPlaylistRepository.findOne.mockResolvedValue(null);

      await (command as any).handleDeleteMusic(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: "You don't have a playlist with this name. ❌",
        ephemeral: true,
      });
    });
  });

  describe('handleListTracks', () => {
    it('should list tracks in a playlist', async () => {
      const mockInteraction = {
        options: {
          getString: jest.fn().mockReturnValue('Test Playlist'),
        },
        user: { id: '1234567890', displayAvatarURL: jest.fn() },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn(),
      } as unknown as DiscordInteraction;

      const mockPlaylist = [
        {
          name: 'Test Playlist',
          tracks: [
            {
              name: 'Test Song',
              url: 'http://test.url',
              createdAt: Date.now(),
            },
          ],
          author: '1234567890',
          public: true,
        },
      ];

      mockPlaylistRepository.find.mockResolvedValue(mockPlaylist);

      await (command as any).handleListTracks(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should handle errors when listing tracks', async () => {
      const mockInteraction = {
        options: {
          getString: jest.fn().mockReturnValue('Test Playlist'),
        },
        user: { id: '1234567890' },
        reply: jest.fn().mockResolvedValue({}),
      } as unknown as DiscordInteraction;

      mockPlaylistRepository.find.mockResolvedValue([]);

      await (command as any).handleListTracks(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'No playlist found with this name. ❌',
        ephemeral: true,
      });
    });
  });

  describe('handleListPlaylists', () => {
    it('should list all playlists of a user', async () => {
      const mockInteraction = {
        user: {
          id: '1234567890',
          username: 'TestUser',
          displayAvatarURL: jest.fn(),
        },
        reply: jest.fn().mockResolvedValue({}),
      } as unknown as DiscordInteraction;

      const mockPlaylists = [
        {
          name: 'Test Playlist',
          public: true,
          tracks: [],
          plays: 0,
          createdAt: Date.now(),
        },
      ];

      mockPlaylistRepository.find.mockResolvedValue(mockPlaylists);

      await (command as any).handleListPlaylists(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should handle errors when listing playlists', async () => {
      const mockInteraction = {
        user: { id: '1234567890' },
        reply: jest.fn().mockResolvedValue({}),
      } as unknown as DiscordInteraction;

      mockPlaylistRepository.find.mockResolvedValue([]);

      await (command as any).handleListPlaylists(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: "You don't have any playlist. ❌",
        ephemeral: true,
      });
    });
  });
});
