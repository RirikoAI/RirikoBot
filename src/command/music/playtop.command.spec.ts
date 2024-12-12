import { Test, TestingModule } from '@nestjs/testing';
import PlayTopCommand from './playtop.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock } from '../../../test/mocks/shared-services.mock';

describe('PlayTopCommand', () => {
  let command: PlayTopCommand;
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
  const mockPlayer = {
    play: jest.fn(),
  };
  const mockSharedServices: SharedServicesMock = {
    config: {} as ConfigService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    musicService: {} as any,
    autoVoiceChannelService: {} as any,
    guildRepository: {} as any,
    voiceChannelRepository: {} as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PlayTopCommand,
          useValue: new PlayTopCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<PlayTopCommand>(PlayTopCommand);
    command['player'] = mockPlayer as any; // Mock the player property
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should reply with "Please provide a song name." if no song name is provided', async () => {
      const mockMessage = {
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      command['allParams'] = '';

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith(
        'Please provide a song name.',
      );
    });

    it('should reply with "Please set the music channel first. Run the `setup-music` command." if no music channel is found', async () => {
      const mockMessage = {
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      command['allParams'] = 'song name';
      jest.spyOn(command, 'findMusicChannel').mockResolvedValue(null);

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith(
        'Please set the music channel first. Run the `setup-music` command.',
      );
    });

    it('should play the song and reply with confirmation', async () => {
      const mockMessage = {
        member: { voice: { channel: {} } },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const mockTextChannel = {};
      command['allParams'] = 'song name';
      jest
        .spyOn(command, 'findMusicChannel')
        .mockResolvedValue(mockTextChannel);

      await command.runPrefix(mockMessage);

      expect(mockPlayer.play).toHaveBeenCalledWith(
        mockMessage.member.voice.channel,
        'song name',
        expect.objectContaining({
          member: mockMessage.member,
          textChannel: mockTextChannel,
          message: mockMessage,
          position: 1,
        }),
      );
    });
  });

  describe('runSlash', () => {
    it('should reply with "Please provide a song name." if no song name is provided', async () => {
      const mockInteraction = {
        options: { getString: jest.fn().mockReturnValue(null) },
        reply: jest.fn(),
        editReply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'Please provide a song name.',
      );
    });

    it('should reply with "Please set the music channel first. Run the `setup-music` command." if no music channel is found', async () => {
      const mockInteraction = {
        options: { getString: jest.fn().mockReturnValue('song name') },
        reply: jest.fn(),
        editReply: jest.fn(),
      } as unknown as DiscordInteraction;

      jest.spyOn(command, 'findMusicChannel').mockResolvedValue(null);

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'Please set the music channel first. Run the `setup-music` command.',
      );
    });

    it('should play the song and reply with confirmation', async () => {
      const mockInteraction = {
        options: { getString: jest.fn().mockReturnValue('song name') },
        member: { voice: { channel: {} } },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
        channel: { send: jest.fn().mockResolvedValue({ delete: jest.fn() }) },
      } as unknown as DiscordInteraction;

      const mockTextChannel = {};
      jest
        .spyOn(command, 'findMusicChannel')
        .mockResolvedValue(mockTextChannel);

      await command.runSlash(mockInteraction);

      expect(mockPlayer.play).toHaveBeenCalledWith(
        mockInteraction.member.voice.channel,
        'song name',
        expect.objectContaining({
          member: mockInteraction.member,
          textChannel: mockTextChannel,
          message: expect.any(Object),
          position: 1,
        }),
      );
    });
  });
});
