import SubscribeCommand from './subscribe.command';
import { EmbedBuilder } from 'discord.js';
import { DiscordMessage, DiscordInteraction } from '#command/command.types';

describe('SubscribeCommand', () => {
  let command: SubscribeCommand;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      twitchStreamerRepository: {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      },
      streamSubscriptionRepository: {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      },
      guildRepository: {
        findOne: jest.fn().mockReturnValue({
          id: 'guild-id',
          configurations: [{ name: 'twitch_channel', value: 'channel-id' }],
        }),
      },
    };

    command = new SubscribeCommand(jest.fn() as any);
    command.db = mockDb;
    command.getGuildPrefix = jest.fn().mockResolvedValue('prefix');
  });

  it('should reply with an error if no streamer name is provided in runPrefix', async () => {
    const message = {
      reply: jest.fn(),
      guild: { id: 'guild-id' },
    } as unknown as DiscordMessage;

    await command.runPrefix(message);

    expect(message.reply).toHaveBeenCalledWith({
      embeds: [expect.any(EmbedBuilder)],
    });
  });

  it('should subscribe to a streamer in runPrefix', async () => {
    const message = {
      reply: jest.fn(),
      guild: { id: 'guild-id' },
    } as unknown as DiscordMessage;
    command.allParams = 'test-streamer';

    await command.runPrefix(message);

    expect(mockDb.twitchStreamerRepository.findOne).toHaveBeenCalledWith({
      where: { twitchUserId: 'test-streamer' },
    });
    expect(message.reply).toHaveBeenCalledWith({
      embeds: [expect.any(EmbedBuilder)],
    });
  });

  it('should reply with an error if no streamer name is provided in runSlash', async () => {
    const interaction = {
      options: { getString: jest.fn().mockReturnValue(null) },
      reply: jest.fn(),
      guildId: 'guild-id',
    } as unknown as DiscordInteraction;

    await command.runSlash(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      embeds: [expect.any(EmbedBuilder)],
    });
  });

  it('should subscribe to a streamer in runSlash', async () => {
    const interaction = {
      options: { getString: jest.fn().mockReturnValue('test-streamer') },
      reply: jest.fn(),
      guildId: 'guild-id',
      guild: {
        id: 'guild-id',
        configurations: [{ name: 'twitch_channel', value: 'channel-id' }],
      },
    } as unknown as DiscordInteraction;

    await command.runSlash(interaction);

    expect(mockDb.twitchStreamerRepository.findOne).toHaveBeenCalledWith({
      where: { twitchUserId: 'test-streamer' },
    });
    expect(interaction.reply).toBeDefined();
  });

  it('should create a new streamer if not found', async () => {
    mockDb.twitchStreamerRepository.findOne.mockResolvedValue(null);

    await command.subscribe('guild-id', 'test-streamer');

    expect(mockDb.twitchStreamerRepository.create).toHaveBeenCalledWith({
      twitchUserId: 'test-streamer',
    });
    expect(mockDb.twitchStreamerRepository.save).toHaveBeenCalled();
  });

  it('should not create a subscription if it already exists', async () => {
    mockDb.streamSubscriptionRepository.findOne.mockResolvedValue({
      twitchUserId: 'test-streamer',
      guild: { id: 'guild-id' },
    });

    const result = await command.subscribe('guild-id', 'test-streamer');

    expect(result).toBe(false);
  });

  it('should create a new subscription if not found', async () => {
    mockDb.streamSubscriptionRepository.findOne.mockResolvedValue(null);

    const result = await command.subscribe('guild-id', 'test-streamer');

    expect(result).toBe(true);
    expect(mockDb.streamSubscriptionRepository.create).toHaveBeenCalledWith({
      twitchUserId: 'test-streamer',
      channelId: 'channel-id',
      guild: { id: 'guild-id' },
    });
    expect(mockDb.streamSubscriptionRepository.save).toHaveBeenCalled();
  });
});
