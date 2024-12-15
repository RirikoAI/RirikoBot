import { createMock } from '@golevelup/ts-jest';
import WaifuCommand from '#command/anime/waifu.command';
import { DiscordMessage, DiscordInteraction } from '#command/command.types';
import { WaifuImService } from '#command/anime/waifu-im/waifu-im.service';
import { WaifuImResults } from '#command/anime/waifu-im/waifu-im.types';
import { EmbedBuilder } from 'discord.js';

jest.mock('#command/anime/waifu-im/waifu-im.service');

describe('WaifuCommand', () => {
  let waifuCommand: WaifuCommand;
  let mockMessage: DiscordMessage;
  let mockInteraction: DiscordInteraction;

  beforeEach(() => {
    waifuCommand = new WaifuCommand(jest.fn() as any);
    mockMessage = createMock<DiscordMessage>();
    mockInteraction = createMock<DiscordInteraction>();
  });

  it('should set the correct properties', () => {
    expect(waifuCommand.name).toBe('waifu');
    expect(waifuCommand.description).toBe('Get a random waifu image');
    expect(waifuCommand.regex).toEqual(new RegExp('^waifu$', 'i'));
    expect(waifuCommand.category).toBe('anime');
    expect(waifuCommand.usageExamples).toEqual(['waifu']);
  });

  it('should run prefix command and send a waifu image', async () => {
    const mockWaifuData: WaifuImResults = {
      images: [
        {
          url: 'https://example.com/waifu.jpg',
          source: 'https://example.com',
          tags: [{ name: 'cute' } as any],
          favorites: 100,
          artist: { name: 'Artist', twitter: 'https://twitter.com/artist' },
        } as any,
      ],
    };
    jest
      .spyOn(WaifuImService.prototype, 'getRandomSelfies')
      .mockResolvedValue(mockWaifuData);
    const sendSpy = jest
      .spyOn(mockMessage.channel, 'send')
      .mockResolvedValue({} as any);

    await waifuCommand.runPrefix(mockMessage);

    expect(sendSpy).toHaveBeenCalledWith({
      embeds: [expect.any(EmbedBuilder)],
    });
  });

  it('should run slash command and reply with a waifu image', async () => {
    const mockWaifuData: WaifuImResults = {
      images: [
        {
          url: 'https://example.com/waifu.jpg',
          source: 'https://example.com',
          tags: [{ name: 'cute' }] as any,
          favorites: 100,
          artist: { name: 'Artist', twitter: 'https://twitter.com/artist' },
        } as any,
      ],
    };
    jest
      .spyOn(WaifuImService.prototype, 'getRandomSelfies')
      .mockResolvedValue(mockWaifuData);
    const replySpy = jest
      .spyOn(mockInteraction, 'reply')
      .mockResolvedValue({} as any);

    await waifuCommand.runSlash(mockInteraction);

    expect(replySpy).toHaveBeenCalledWith({
      embeds: [expect.any(EmbedBuilder)],
    });
  });

  it('should prepare an embed with waifu data', async () => {
    const mockWaifuData: WaifuImResults = {
      images: [
        {
          url: 'https://example.com/waifu.jpg',
          source: 'https://example.com',
          tags: [{ name: 'cute' }] as any,
          favorites: 100,
          artist: { name: 'Artist', twitter: 'https://twitter.com/artist' },
        } as any,
      ],
    };

    const embed = await waifuCommand.prepareEmbed({ waifu: mockWaifuData });

    expect(embed).toBeInstanceOf(EmbedBuilder);
    expect(embed.data.title).toBe('Random Waifu Image');
    expect(embed.data.image.url).toBe('https://example.com/waifu.jpg');
    expect(embed.data.url).toBe('https://example.com');
    expect(embed.data.fields).toEqual([
      { name: 'Tags', value: 'cute', inline: true },
      { name: 'Favorites', value: '100', inline: true },
    ]);
    expect(embed.data.author.name).toBe('Artist via Waifu.im');
    expect(embed.data.author.url).toBe('https://twitter.com/artist');
  });
});
