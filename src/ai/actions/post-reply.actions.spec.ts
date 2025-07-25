import { PostReplyActions } from './post-reply.actions';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import PlayCommand from '#command/music/play.command';
import { AvailableSharedServices } from '#command/command.module';

describe('PostReplyActions', () => {
  let mockMessage: DiscordMessage | DiscordInteraction;
  let mockServices: AvailableSharedServices;

  beforeEach(() => {
    mockMessage = {
      member: {
        voice: {
          channel: {},
        },
      },
    } as unknown as DiscordMessage | DiscordInteraction;

    mockServices = {
      musicService: {
        distube: {
          play: jest.fn(),
        },
      },
      commandService: {
        getCommand: jest.fn().mockResolvedValue({
          findMusicChannel: jest.fn().mockResolvedValue({}),
        }),
      },
    } as unknown as AvailableSharedServices;

    mockServices.commandService.getCommand = jest.fn().mockReturnValue({
      findMusicChannel: jest.fn().mockResolvedValue({}),
    } as any);
  });

  it('should play the song using the music service', async () => {
    const action = { payload: 'song name' };

    await PostReplyActions.play(action, mockMessage, mockServices);

    expect(mockServices.musicService.distube.play).toHaveBeenCalledWith(
      mockMessage.member.voice.channel,
      'song name',
      expect.objectContaining({
        member: mockMessage.member,
        textChannel: expect.any(Object),
      }),
    );
  });

  it('should find the music channel using the play command', async () => {
    const action = { payload: 'song name' };

    await PostReplyActions.play(action, mockMessage, mockServices);

    expect(mockServices.commandService.getCommand).toHaveBeenCalledWith('play');
    const playCommand = (await mockServices.commandService.getCommand(
      'play',
    )) as PlayCommand;
    expect(playCommand.findMusicChannel).toHaveBeenCalledWith(mockMessage);
  });
});
