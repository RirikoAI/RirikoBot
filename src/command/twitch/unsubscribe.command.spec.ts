import UnsubscribeCommand from './unsubscribe.command';
import { EmbedBuilder } from 'discord.js';
import { DiscordMessage, DiscordInteraction } from '#command/command.types';

describe('UnsubscribeCommand', () => {
  let command: UnsubscribeCommand;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      twitchStreamerRepository: {
        findOne: jest.fn(),
      },
      streamSubscriptionRepository: {
        findOne: jest.fn(),
        remove: jest.fn(),
      },
    };

    command = new UnsubscribeCommand(jest.fn() as any);
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

  it('should unsubscribe from a streamer in runPrefix', async () => {
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

  it('should unsubscribe from a streamer in runSlash', async () => {
    const interaction = {
      options: { getString: jest.fn().mockReturnValue('test-streamer') },
      reply: jest.fn(),
      guildId: 'guild-id',
      guild: { id: 'guild-id' },
    } as unknown as DiscordInteraction;

    await command.runSlash(interaction);

    expect(mockDb.twitchStreamerRepository.findOne).toHaveBeenCalledWith({
      where: { twitchUserId: 'test-streamer' },
    });
    expect(interaction.reply).toBeDefined();
  });

  it('should not unsubscribe if the streamer does not exist', async () => {
    mockDb.twitchStreamerRepository.findOne.mockResolvedValue(null);

    const result = await command.unsubscribe('guild-id', 'test-streamer');

    expect(result).toBe(false);
  });

  it('should not unsubscribe if the subscription does not exist', async () => {
    mockDb.streamSubscriptionRepository.findOne.mockResolvedValue(null);

    const result = await command.unsubscribe('guild-id', 'test-streamer');

    expect(result).toBe(false);
  });

  it('should remove the subscription if it exists', async () => {
    command.db.twitchStreamerRepository.findOne = jest.fn().mockResolvedValue({
      twitchUserId: 'test-streamer',
      guild: { id: 'guild-id' },
    });

    command.db.streamSubscriptionRepository.findOne = jest
      .fn()
      .mockResolvedValue({
        twitchUserId: 'test-streamer',
        guild: { id: 'guild-id' },
      });

    const result = await command.unsubscribe('guild-id', 'test-streamer');

    expect(result).toBe(true);
    expect(mockDb.streamSubscriptionRepository.remove).toHaveBeenCalled();
  });
});
