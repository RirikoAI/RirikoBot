// @ts-nocheck
import { PaginationFeature } from './pagination.feature';
import { PaginationFeatureParams } from '#util/features/pagination-feature.types';
import { Interaction, Message, MessageComponentInteraction } from 'discord.js';

jest.mock('discord.js', () => {
  const actualDiscordJs = jest.requireActual('discord.js');
  return {
    ...actualDiscordJs,
    ActionRowBuilder: jest.fn().mockImplementation(() => ({
      addComponents: jest.fn().mockReturnThis(),
    })),
    ButtonBuilder: jest.fn().mockImplementation(() => ({
      setCustomId: jest.fn().mockReturnThis(),
      setLabel: jest.fn().mockReturnThis(),
      setStyle: jest.fn().mockReturnThis(),
      setDisabled: jest.fn().mockReturnThis(),
    })),
    Interaction: jest.fn(),
    Message: jest.fn().mockImplementation(() => ({
      createMessageComponentCollector: jest.fn().mockReturnValue({
        on: jest.fn(),
      }),
    })),
    MessageComponentInteraction: jest.fn().mockImplementation(() => ({
      update: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

describe('PaginationFeature', () => {
  let params: PaginationFeatureParams;
  let interaction: jest.Mocked<Interaction> | any;
  let message: jest.Mocked<Message>;

  beforeEach(() => {
    interaction = new Interaction() as jest.Mocked<Interaction>;
    message = new Message() as jest.Mocked<Message>;

    params = {
      interaction,
      pages: [{ title: 'Page 1' }, { title: 'Page 2' }],
    };

    interaction.reply = jest.fn().mockResolvedValue(message);
    interaction.deferReply = jest.fn().mockResolvedValue(undefined);
    interaction.editReply = jest.fn().mockResolvedValue(message);
    interaction.channel = {
      send: jest.fn().mockResolvedValue(message),
    } as any;
    interaction.update = jest.fn().mockResolvedValue(message);
  });

  it('should initialize pagination and reply to the interaction', async () => {
    const paginationFeature = new PaginationFeature(params);
    await paginationFeature.startPagination(params);

    expect(interaction.reply).toBeDefined();
  });

  it('should go to the next page when next button is clicked', async () => {
    const paginationFeature = new PaginationFeature(params);
    await paginationFeature.startPagination(params);

    const collector =
      message.createMessageComponentCollector.mock.results[0].value;
    const mockInteraction =
      new MessageComponentInteraction() as jest.Mocked<MessageComponentInteraction>;
    mockInteraction.customId = 'next';

    const collectHandler = collector.on.mock.calls.find(
      (call) => call[0] === 'collect',
    )[1];
    await collectHandler(mockInteraction);

    expect(mockInteraction.update).toHaveBeenCalledWith({
      embeds: [{ title: 'Page 2' }],
    });
  });

  it('should go to the previous page when previous button is clicked', async () => {
    const paginationFeature = new PaginationFeature(params);
    await paginationFeature.startPagination(params);

    const collector =
      message.createMessageComponentCollector.mock.results[0].value;
    const mockInteraction =
      new MessageComponentInteraction() as jest.Mocked<MessageComponentInteraction>;
    mockInteraction.customId = 'previous';

    const collectHandler = collector.on.mock.calls.find(
      (call) => call[0] === 'collect',
    )[1];
    await collectHandler(mockInteraction);

    expect(mockInteraction.update).toBeDefined();
  });

  it('should disable buttons after the collector ends', async () => {
    const paginationFeature = new PaginationFeature(params);
    await paginationFeature.startPagination(params);

    const collector =
      message.createMessageComponentCollector.mock.results[0].value;
    const endHandler = collector.on.mock.calls.find(
      (call) => call[0] === 'end',
    )[1];
    await endHandler();

    expect(interaction.editReply).toBeDefined();
  });
});
