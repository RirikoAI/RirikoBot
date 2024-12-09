import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import ImagineCommand from './imagine.command';

jest.mock('#command/command.class');
jest.mock('#command/command.interface');
jest.mock('replicate');
jest.mock('discord.js', () => ({
  EmbedBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setColor: jest.fn().mockReturnThis(),
    setTimestamp: jest.fn().mockReturnThis(),
    setImage: jest.fn().mockReturnThis(),
    setURL: jest.fn().mockReturnThis(),
    setFooter: jest.fn().mockReturnThis(),
  })),
}));

describe('ImagineCommand', () => {
  let imagineCommand: ImagineCommand;
  let mockMessage: DiscordMessage;
  let mockInteraction: DiscordInteraction;

  beforeEach(() => {
    imagineCommand = new ImagineCommand(jest.fn() as any);
    mockMessage = {
      reply: jest.fn(),
      member: { id: 'user-id' },
      guild: { id: 'guild-id' },
      author: { id: 'author-id' },
    } as unknown as DiscordMessage;
    mockInteraction = {
      deferReply: jest.fn(),
      editReply: jest.fn(),
      options: { getString: jest.fn().mockReturnValue('prompt') },
      user: { id: 'user-id' },
      guild: { id: 'guild-id' },
    } as unknown as DiscordInteraction;
  });

  it('should reply with an error if no prompt is provided in runPrefix', async () => {
    imagineCommand.allParams = '';
    await imagineCommand.runPrefix(mockMessage);
    expect(mockMessage.reply).toBeCalled();
  });

  it('should reply with an error if no prompt is provided in runSlash', async () => {
    mockInteraction.options.getString = jest.fn().mockReturnValue('');
    await imagineCommand.runSlash(mockInteraction);
    expect(mockInteraction.editReply).toBeCalled();
  });

  it('should call imagine and reply with the result in runPrefix', async () => {
    imagineCommand.allParams = 'prompt';
    imagineCommand.imagine = jest
      .fn()
      .mockResolvedValue({ url: () => new URL('http://example.com') });
    await imagineCommand.runPrefix(mockMessage);
    expect(imagineCommand.imagine).toHaveBeenCalledWith(
      'prompt',
      'guild-id',
      'author-id',
    );
    expect(mockMessage.reply).toBeCalled();
  });

  it('should call imagine and reply with the result in runSlash', async () => {
    imagineCommand.imagine = jest
      .fn()
      .mockResolvedValue({ url: () => new URL('http://example.com') });
    await imagineCommand.runSlash(mockInteraction);
    expect(imagineCommand.imagine).toHaveBeenCalledWith(
      'prompt',
      'guild-id',
      'user-id',
    );
    expect(mockInteraction.editReply).toBeCalled();
  });
});
