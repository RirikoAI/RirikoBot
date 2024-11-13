// @ts-nocheck
import { MenuFeature } from './menu.feature';
import { MenuFeatureParams } from '#util/features/menu-feature.types';
import {
  Interaction,
  Message,
  MessageComponentInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';

jest.mock('discord.js', () => {
  const actualDiscordJs = jest.requireActual('discord.js');
  return {
    ...actualDiscordJs,
    ActionRowBuilder: jest.fn().mockImplementation(() => ({
      addComponents: jest.fn().mockReturnThis(),
    })),
    StringSelectMenuBuilder: jest.fn().mockImplementation(() => ({
      setCustomId: jest.fn().mockReturnThis(),
      setPlaceholder: jest.fn().mockReturnThis(),
      addOptions: jest.fn().mockReturnThis(),
    })),
    Interaction: jest.fn(),
    Message: jest.fn().mockImplementation(() => ({
      createMessageComponentCollector: jest.fn().mockReturnValue({
        on: jest.fn(),
      }),
    })),
    MessageComponentInteraction: jest.fn(),
  };
});

describe('MenuFeature', () => {
  let params: MenuFeatureParams;
  let interaction: jest.Mocked<Interaction>;
  let message: jest.Mocked<Message>;

  beforeEach(() => {
    interaction = new Interaction() as jest.Mocked<Interaction>;
    message = new Message() as jest.Mocked<Message>;

    params = {
      interaction,
      text: 'Select an option',
      options: [{ label: 'Option 1', value: '1' }],
      callback: jest.fn(),
      context: {},
      followUp: false,
    };

    interaction.reply = jest.fn().mockResolvedValue(message);
    interaction.deferReply = jest.fn().mockResolvedValue(undefined);
    interaction.editReply = jest.fn().mockResolvedValue(message);
    interaction.channel = {
      send: jest.fn().mockResolvedValue(message),
    } as any;
  });

  it('should create a menu and reply to the interaction', async () => {
    const menuFeature = new MenuFeature(params);
    await menuFeature.createMenu(params);

    expect(interaction.reply).toBeDefined();
  });

  it('should defer reply if interaction is deferrable', async () => {
    interaction.deferrable = true;
    const menuFeature = new MenuFeature(params);
    await menuFeature.createMenu(params);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toBeDefined();
  });

  it('should call the callback when an option is selected', async () => {
    const menuFeature = new MenuFeature(params);
    await menuFeature.createMenu(params);

    const collector =
      message.createMessageComponentCollector.mock.results[0].value;
    const mockInteraction =
      new MessageComponentInteraction() as jest.Mocked<MessageComponentInteraction>;
    mockInteraction.customId = 'someId';
    mockInteraction.values = ['1'];

    const collectHandler = collector.on.mock.calls.find(
      (call) => call[0] === 'collect',
    )[1];
    await collectHandler(mockInteraction);

    expect(params.callback).toHaveBeenCalledWith(mockInteraction, '1', {});
  });

  it('should send a follow-up message if followUp is true', async () => {
    params.followUp = true;
    const menuFeature = new MenuFeature(params);
    await menuFeature.createMenu(params);

    expect(interaction.channel.send).toBeDefined();
  });
});
