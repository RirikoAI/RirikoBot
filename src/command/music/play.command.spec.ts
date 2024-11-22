import { Test, TestingModule } from '@nestjs/testing';
import PlayCommand from './play.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock, TestSharedService } from '../../../test/mocks/shared-services.mock';

describe('PlayCommand', () => {
  let command: PlayCommand;
  const mockDiscordService = {
    client: {
      user: {
        displayAvatarURL: jest.fn(),
      },
      musicPlayer: {
        play: jest.fn(),
        createCustomPlaylist: jest.fn(),
      },
    },
  };
  const mockCommandService = {
    getGuildPrefix: jest.fn(),
  };
  const mockMusicService = {
    resumeMusic: jest.fn(),
  };
  const mockSharedServices: SharedServicesMock = {
    ...TestSharedService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    musicService: mockMusicService,
    db: {
      playlistRepository: {
        findOne: jest.fn(),
      },
      musicChannelRepository: {
        findOne: jest.fn(),
      }
    } as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PlayCommand,
          useValue: new PlayCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<PlayCommand>(PlayCommand);

    // Mock the player
    command.player = {
      play: jest.fn(),
      createCustomPlaylist: jest.fn(),
    } as any;
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should play a song and reply with a confirmation message', async () => {
      const mockMessage = {
        guild: { id: '1234567890' },
        member: { voice: { channel: {} } },
        reply: jest.fn(),
        channel: {},
      } as unknown as DiscordMessage;

      command.setParams('play Test Song');
      jest
        .spyOn(command, 'findMusicChannel')
        .mockResolvedValue(mockMessage.channel);
      jest.spyOn(command.player, 'play').mockResolvedValue();

      await command.runPrefix(mockMessage);

      expect(command.player.play).toHaveBeenCalledWith(
        mockMessage.member.voice.channel,
        'Test Song',
        expect.any(Object),
      );
    });
  });

  describe('handleButton', () => {
    it('should defer the update and resume the music', async () => {
      const mockInteraction = {
        guild: { id: '1234567890' },
        deferUpdate: jest.fn(),
      } as unknown as DiscordInteraction;

      jest
        .spyOn(command.services.musicService, 'resumeMusic')
        .mockResolvedValue();

      await command.handleButton(mockInteraction);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(command.services.musicService.resumeMusic).toHaveBeenCalledWith(
        mockInteraction,
      );
    });
  });

  describe('runSlash', () => {
    it('should play music when the subcommand is music', async () => {
      const mockInteraction = {
        options: {
          getSubcommand: jest.fn().mockReturnValue('music'),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      jest.spyOn(command, 'playMusic').mockResolvedValue();

      await command.runSlash(mockInteraction);

      expect(command.playMusic).toHaveBeenCalledWith(mockInteraction);
    });

    it('should play playlist when the subcommand is playlist', async () => {
      const mockInteraction = {
        options: {
          getSubcommand: jest.fn().mockReturnValue('playlist'),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      jest.spyOn(command, 'playPlaylist').mockResolvedValue({});

      await command.runSlash(mockInteraction);

      expect(command.playPlaylist).toHaveBeenCalledWith(mockInteraction);
    });
  });

  describe('playMusic', () => {
    it('should play a song and reply with a confirmation message', async () => {
      const mockInteraction = {
        deferReply: jest.fn(),
        editReply: jest.fn(),
        options: {
          getString: jest.fn().mockReturnValue('Test Song'),
        },
        member: { voice: { channel: {} } },
        channel: { send: jest.fn() },
      } as unknown as DiscordInteraction;

      jest
        .spyOn(command, 'findMusicChannel')
        .mockResolvedValue(mockInteraction.channel);
      jest.spyOn(command.player, 'play').mockResolvedValue();

      await command.playMusic(mockInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: 'Loading command...',
      });
      expect(command.player.play).toHaveBeenCalledWith(
        mockInteraction.member.voice.channel,
        'Test Song',
        expect.any(Object),
      );
    });
  });

  describe('playPlaylist', () => {
    it('should play a playlist and reply with a confirmation message', async () => {
      const mockInteraction = {
        reply: jest.fn(),
        editReply: jest.fn(),
        options: {
          getString: jest.fn().mockReturnValue('Test Playlist'),
        },
        member: { id: '1234567890', voice: { channel: {} } },
        channel: { send: jest.fn() },
      } as unknown as DiscordInteraction;

      const mockPlaylist = {
        name: 'Test Playlist',
        tracks: [{ url: 'http://test.url' }],
      };

      jest
        .spyOn(command.db.playlistRepository, 'findOne')
        .mockResolvedValue(mockPlaylist as any);
      jest
        .spyOn(command.player, 'createCustomPlaylist')
        .mockResolvedValue('queuedPlaylist' as any);
      jest.spyOn(command.player, 'play').mockResolvedValue();

      await command.playPlaylist(mockInteraction);

      expect(command.db.playlistRepository.findOne).toHaveBeenCalledWith({
        where: { name: 'Test Playlist', userId: '1234567890' },
      });
      expect(command.player.createCustomPlaylist).toHaveBeenCalledWith(
        ['http://test.url'],
        expect.any(Object),
      );
      expect(command.player.play).toBeDefined();
    });
  });

  describe('findMusicChannel', () => {
    it('should find and return the music channel', async () => {
      const mockMessage = {
        guild: {
          id: '1234567890',
          channels: {
            cache: {
              get: jest.fn().mockReturnValue({ id: 'musicChannelId' }),
            },
          },
        },
      } as unknown as DiscordMessage;

      jest
        .spyOn(command.db.musicChannelRepository, 'findOne')
        .mockResolvedValue({ id: 'musicChannelId' } as any);

      const result = await command.findMusicChannel(mockMessage);

      expect(
        command.db.musicChannelRepository.findOne,
      ).toHaveBeenCalledWith({
        where: { guild: { id: '1234567890' } },
      });
      expect(result).toEqual({ id: 'musicChannelId' });
    });
  });
});
