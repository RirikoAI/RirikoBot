import TwitchStatusCommand from './twitch-status.command';
import { EmbedBuilder } from 'discord.js';
import { DiscordMessage, DiscordInteraction } from '#command/command.types';

describe('TwitchStatusCommand', () => {
  let command: TwitchStatusCommand;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      guildRepository: {
        findOne: jest.fn().mockReturnValue({
          id: 'guild-id',
          configurations: [{ name: 'twitch_channel', value: 'channel-id' }],
        }),
      },
      streamSubscriptionRepository: {
        find: jest
          .fn()
          .mockResolvedValue([
            { twitchUserId: 'streamer1' },
            { twitchUserId: 'streamer2' },
          ]),
      },
    };

    command = new TwitchStatusCommand(jest.fn() as any);
    command.db = mockDb;
  });

  it('should reply with the Twitch channel and subscriptions in runPrefix', async () => {
    const message = {
      reply: jest.fn(),
      guild: { id: 'guild-id' },
    } as unknown as DiscordMessage;

    await command.runPrefix(message);

    expect(mockDb.guildRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'guild-id' },
    });
    expect(mockDb.streamSubscriptionRepository.find).toHaveBeenCalledWith({
      where: { guild: { id: 'guild-id' } },
    });
    expect(message.reply).toHaveBeenCalledWith({
      embeds: [expect.any(EmbedBuilder)],
    });
  });

  it('should reply with the Twitch channel and subscriptions in runSlash', async () => {
    const interaction = {
      reply: jest.fn(),
      guildId: 'guild-id',
    } as unknown as DiscordInteraction;

    await command.runSlash(interaction);

    expect(mockDb.guildRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'guild-id' },
    });
    expect(mockDb.streamSubscriptionRepository.find).toHaveBeenCalledWith({
      where: { guild: { id: 'guild-id' } },
    });
    expect(interaction.reply).toHaveBeenCalledWith({
      embeds: [expect.any(EmbedBuilder)],
    });
  });

  it('should handle no Twitch channel set', async () => {
    mockDb.guildRepository.findOne.mockReturnValue({
      id: 'guild-id',
      configurations: [],
    });

    const message = {
      reply: jest.fn(),
      guild: { id: 'guild-id' },
    } as unknown as DiscordMessage;

    await command.runPrefix(message);

    expect(message.reply).toHaveBeenCalledWith({
      embeds: [expect.any(EmbedBuilder)],
    });
  });

  it('should handle no subscriptions', async () => {
    mockDb.streamSubscriptionRepository.find.mockResolvedValue([]);

    const message = {
      reply: jest.fn(),
      guild: { id: 'guild-id' },
    } as unknown as DiscordMessage;

    await command.runPrefix(message);

    expect(message.reply).toHaveBeenCalledWith({
      embeds: [expect.any(EmbedBuilder)],
    });
  });
});
