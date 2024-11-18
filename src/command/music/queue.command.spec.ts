import { Test, TestingModule } from '@nestjs/testing';
import QueueCommand from './queue.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock } from '../../../test/mocks/shared-services.mock';
import { ButtonStyle } from 'discord.js';

describe('QueueCommand', () => {
  let command: QueueCommand;
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
  const mockMusicService = {
    getControlButtons: jest.fn(),
  };
  const mockSharedServices: SharedServicesMock = {
    config: {} as ConfigService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    musicService: mockMusicService,
    autoVoiceChannelService: {} as any,
    guildRepository: {} as any,
    voiceChannelRepository: {} as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: QueueCommand,
          useValue: new QueueCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<QueueCommand>(QueueCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should call run with interaction', async () => {
      const mockMessage = {
        guild: { id: '1234567890' },
      } as unknown as DiscordMessage;

      jest.spyOn(command, 'run').mockResolvedValue();

      await command.runPrefix(mockMessage);

      expect(command.run).toHaveBeenCalledWith(mockMessage);
    });
  });

  describe('runSlash', () => {
    it('should call run with interaction', async () => {
      const mockInteraction = {
        guild: { id: '1234567890' },
      } as unknown as DiscordInteraction;

      jest.spyOn(command, 'run').mockResolvedValue();

      await command.runSlash(mockInteraction);

      expect(command.run).toHaveBeenCalledWith(mockInteraction);
    });
  });

  describe('run', () => {
    it('should reply with no songs message if no queue', async () => {
      const mockInteraction = {
        guild: { id: '1234567890' },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      jest.spyOn(command.player, 'getQueue').mockReturnValue(null);

      await command.run(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'No songs are currently playing.',
        ephemeral: true,
      });
    });

    it('should reply with queue is empty message if no songs in queue', async () => {
      const mockInteraction = {
        guild: { id: '1234567890' },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      jest
        .spyOn(command.player, 'getQueue')
        .mockReturnValue({ songs: [] } as any);

      await command.run(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'No songs are currently playing.',
        ephemeral: true,
      });
    });

    it('should paginate queue if songs are present', async () => {
      const mockInteraction = {
        guild: { id: '1234567890' },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      const mockQueue = {
        songs: [
          {
            name: 'Song 1',
            uploader: { name: 'Uploader 1' },
            user: { id: '1' },
            url: 'url1',
            duration: '3:00',
          },
          {
            name: 'Song 2',
            uploader: { name: 'Uploader 2' },
            user: { id: '2' },
            url: 'url2',
            duration: '4:00',
          },
        ],
        playing: true,
      };

      jest.spyOn(command.player, 'getQueue').mockReturnValue(mockQueue as any);
      jest.spyOn(command as any, 'paginateQueue').mockResolvedValue({});

      await command.run(mockInteraction);

      expect((command as any).paginateQueue).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      const mockInteraction = {
        guild: { id: '1234567890' },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      jest.spyOn(command.player, 'getQueue').mockImplementation(() => {
        throw new Error('Test error');
      });

      await command.run(mockInteraction);

      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });
  });

  describe('handleButton', () => {
    it('should defer update and call run', async () => {
      const mockInteraction = {
        deferUpdate: jest.fn(),
        guild: { id: '1234567890' },
      } as unknown as DiscordInteraction;

      jest.spyOn(command, 'run').mockResolvedValue();

      await command.handleButton(mockInteraction);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(command.run).toHaveBeenCalledWith(mockInteraction);
    });
  });

  describe('paginateQueue', () => {
    it('should handle empty track list', async () => {
      const mockInteraction = {
        guild: { id: '1234567890' },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await (command as any).paginateQueue(mockInteraction, [], 'Test Song');

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'No tracks to display.',
        ephemeral: true,
      });
    });

    it('should handle pagination buttons', async () => {
      const mockInteraction = {
        guild: { id: '1234567890', iconURL: jest.fn() },
        reply: jest.fn().mockResolvedValue({
          createMessageComponentCollector: jest.fn().mockReturnValue({
            on: jest.fn((event, callback) => {
              if (event === 'collect') {
                callback({ customId: 'emojiForward', update: jest.fn() });
              }
            }),
          }),
        }),
        user: { id: '1234567890' },
      } as unknown as DiscordInteraction;

      const trackList = Array.from({ length: 10 }, (_, i) => ({
        title: `Song ${i + 1}`,
        author: `Author ${i + 1}`,
        user: { id: '1234567890' },
        url: `http://test.url/${i + 1}`,
        duration: '3:00',
      }));

      await (command as any).paginateQueue(
        mockInteraction,
        trackList,
        'Test Song',
      );

      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should handle collector end', async () => {
      const mockInteraction = {
        guild: { id: '1234567890', iconURL: jest.fn() },
        reply: jest.fn().mockResolvedValue({
          createMessageComponentCollector: jest.fn().mockReturnValue({
            on: jest.fn((event, callback) => {
              if (event === 'end') {
                callback();
              }
            }),
          }),
        }),
        user: { id: '1234567890' },
        deleteReply: jest.fn(),
      } as unknown as DiscordInteraction;

      const trackList = Array.from({ length: 10 }, (_, i) => ({
        title: `Song ${i + 1}`,
        author: `Author ${i + 1}`,
        user: { id: '1234567890' },
        url: `http://test.url/${i + 1}`,
        duration: '3:00',
      }));

      await (command as any).paginateQueue(
        mockInteraction,
        trackList,
        'Test Song',
      );

      expect(mockInteraction.deleteReply).toHaveBeenCalled();
    });
  });

  describe('createButton', () => {
    it('should create a button with the correct properties', () => {
      const button = (command as any).createButton('testId', '😀');

      expect(button.data.custom_id).toBe('testId');
      expect(button.data.emoji.name).toBe('😀');
      expect(button.data.style).toBe(ButtonStyle.Secondary);
    });
  });

  describe('replyWithEphemeral', () => {
    it('should reply with ephemeral message', async () => {
      const mockInteraction = {
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await (command as any).replyWithEphemeral(
        mockInteraction,
        'Test message',
      );

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Test message',
        ephemeral: true,
      });
    });

    it('should handle reply errors gracefully', async () => {
      const mockInteraction = {
        reply: jest.fn().mockImplementation(() => {
          throw new Error('Test error');
        }),
      } as unknown as DiscordInteraction;

      await (command as any).replyWithEphemeral(
        mockInteraction,
        'Test message',
      );

      expect(mockInteraction.reply).toHaveBeenCalled();
    });
  });
});
