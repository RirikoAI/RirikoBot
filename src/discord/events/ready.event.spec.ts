import { InteractionCreateEvent } from '#discord/events/interaction-create.event';
import { DiscordClient } from '#discord/discord.client';
import { CommandService } from '#command/command.service';
import { Events } from 'discord.js';
import { DiscordInteraction } from '#command/command.types';

describe('InteractionCreateEvent', () => {
  it('should be defined', () => {
    expect(InteractionCreateEvent).toBeDefined();
  });

  it('should be a function', () => {
    expect(InteractionCreateEvent).toBeInstanceOf(Function);
  });

  it('should have 2 parameters', () => {
    expect(InteractionCreateEvent).toHaveLength(2);
  });

  it('should call checkSlashCommand command', async () => {
    const client = {
      on: jest.fn(),
    } as unknown as DiscordClient;
    const commandService = {
      checkInteractionCommand: jest.fn(),
    } as unknown as CommandService;

    InteractionCreateEvent(client, commandService);

    // Simulate the interaction event
    const interaction = {
      isButton: jest.fn(),
      isModalSubmit: jest.fn(),
    } as unknown as DiscordInteraction;
    const eventHandler = client.on.mock.calls[0][1];
    await eventHandler(interaction);

    expect(client.on).toHaveBeenCalledWith(
      Events.InteractionCreate,
      expect.any(Function),
    );
    expect(commandService.checkInteractionCommand).toHaveBeenCalledWith(
      interaction,
    );
  });
});
