import SetupTwitchCommand from './setup-twitch.command';
import { EmbedBuilder } from 'discord.js';
import { DiscordMessage, DiscordInteraction } from '#command/command.types';

describe('SetupTwitchCommand', () => {
  let command: SetupTwitchCommand;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      guildRepository: {
        findOne: jest.fn().mockReturnValue({
          id: 'guild-id',
          configurations: [],
        }),
      },
      guildConfigRepository: {
        save: jest.fn(),
      },
      streamSubscriptionRepository: {
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn(),
      },
    };

    command = new SetupTwitchCommand(jest.fn() as any);
    command.db = mockDb;
  });

  it('should reply with an error if no channel is mentioned in runPrefix', async () => {
    const message = {
      mentions: { channels: { first: jest.fn().mockReturnValue(null) } },
      reply: jest.fn(),
    } as unknown as DiscordMessage;

    await command.runPrefix(message);

    expect(message.reply).toHaveBeenCalledWith({
      embeds: [expect.any(EmbedBuilder)],
    });
  });

  it('should set up the Twitch channel in runPrefix', async () => {
    const channel = { id: '12345' };
    const message = {
      mentions: { channels: { first: jest.fn().mockReturnValue(channel) } },
      reply: jest.fn(),
      guild: { id: 'guild-id' },
    } as unknown as DiscordMessage;

    await command.runPrefix(message);

    expect(mockDb.guildRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'guild-id' },
    });
    expect(message.reply).toHaveBeenCalledWith({
      embeds: [expect.any(EmbedBuilder)],
    });
  });

  it('should reply with an error if no channel is mentioned in runSlash', async () => {
    const interaction = {
      options: { getChannel: jest.fn().mockReturnValue(null) },
      reply: jest.fn(),
    } as unknown as DiscordInteraction;

    await command.runSlash(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      embeds: [expect.any(EmbedBuilder)],
    });
  });

  it('should set up the Twitch channel in runSlash', async () => {
    const channel = { id: '12345' };
    const interaction = {
      options: { getChannel: jest.fn().mockReturnValue(channel) },
      reply: jest.fn(),
      guildId: 'guild-id',
    } as unknown as DiscordInteraction;

    await command.runSlash(interaction);

    expect(mockDb.guildRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'guild-id' },
    });
    expect(interaction.reply).toHaveBeenCalledWith({
      embeds: [expect.any(EmbedBuilder)],
    });
  });

  it('should save the Twitch channel configuration', async () => {
    const guildDB = { id: 'guild-id', configurations: [] };
    mockDb.guildRepository.findOne.mockResolvedValue(guildDB);

    await command.setupTwitchChannel('guild-id', 'channel-id');

    expect(mockDb.guildConfigRepository.save).toHaveBeenCalledWith({
      name: 'twitch_channel',
      value: 'channel-id',
      guild: guildDB,
    });
  });

  it('should update existing subscriptions with the new channel', async () => {
    const guildDB = { id: 'guild-id', configurations: [] };
    const subscriptions = [{ channelId: 'old-channel-id' }];
    mockDb.guildRepository.findOne.mockResolvedValue(guildDB);
    mockDb.streamSubscriptionRepository.find.mockResolvedValue(subscriptions);

    await command.setupTwitchChannel('guild-id', 'channel-id');

    expect(subscriptions[0].channelId).toBe('channel-id');
    expect(mockDb.streamSubscriptionRepository.save).toHaveBeenCalledWith(
      subscriptions[0],
    );
  });
});
