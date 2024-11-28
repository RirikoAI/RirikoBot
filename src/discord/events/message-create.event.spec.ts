import { MessageCreateEvent } from '#discord/events/message-create.event';
import { DiscordClient } from '#discord/discord.client';
import { CommandService } from '#command/command.service';
import { Events } from 'discord.js';
import { DiscordMessage } from '#command/command.types';
import { MusicService } from '#music/music.service';

const musicService = {
  handleMusic: jest.fn(),
} as unknown as MusicService;

const economyService = {
  handleMessage: jest.fn(),
};

describe('MessageCreateEvent', () => {
  it('should be defined', () => {
    expect(MessageCreateEvent).toBeDefined();
  });

  it('should be a function', () => {
    expect(MessageCreateEvent).toBeInstanceOf(Function);
  });

  it('should have 3 parameters', () => {
    expect(MessageCreateEvent).toHaveLength(4);
  });

  it('should call checkPrefixCommand', async () => {
    const client = {
      on: jest.fn(),
    } as unknown as DiscordClient;
    const commandService = {
      checkPrefixCommand: jest.fn(),
    } as unknown as CommandService;

    MessageCreateEvent['economyService'] = {
      handleMessage: jest.fn(),
    };

    MessageCreateEvent(
      client,
      commandService,
      musicService,
      economyService as any,
    );

    // Simulate the message event
    const message = {
      author: { bot: false },
      channel: { send: jest.fn() },
    } as unknown as DiscordMessage;
    const eventHandler = client.on.mock.calls[0][1];
    await eventHandler(message);

    expect(client.on).toHaveBeenCalledWith(
      Events.MessageCreate,
      expect.any(Function),
    );
    expect(commandService.checkPrefixCommand).toHaveBeenCalledWith(message);
  });

  it('should not call checkPrefixCommand if message is from a bot', async () => {
    const client = {
      on: jest.fn(),
    } as unknown as DiscordClient;
    const commandService = {
      checkPrefixCommand: jest.fn(),
    } as unknown as CommandService;

    MessageCreateEvent(client, commandService, musicService, jest.fn() as any);

    // Simulate the message event from a bot
    const message = {
      author: { bot: true },
    } as unknown as DiscordMessage;
    const eventHandler = client.on.mock.calls[0][1];
    await eventHandler(message);

    expect(client.on).toHaveBeenCalledWith(
      Events.MessageCreate,
      expect.any(Function),
    );
    expect(commandService.checkPrefixCommand).not.toHaveBeenCalled();
  });

  it('should catch and log error', async () => {
    const client = {
      on: jest.fn(),
    } as unknown as DiscordClient;
    const commandService = {
      checkPrefixCommand: jest.fn().mockRejectedValue(new Error('Test error')),
    } as unknown as CommandService;

    MessageCreateEvent(client, commandService, musicService, jest.fn() as any);

    // Simulate the message event
    const message = {
      author: { bot: false },
      channel: { send: jest.fn() },
    } as unknown as DiscordMessage;
    const eventHandler = client.on.mock.calls[0][1];
    await eventHandler(message);

    expect(client.on).toHaveBeenCalledWith(
      Events.MessageCreate,
      expect.any(Function),
    );
    expect(commandService.checkPrefixCommand).toHaveBeenCalledWith(message);
  });
});
