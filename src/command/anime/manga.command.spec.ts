import { createMock } from '@golevelup/ts-jest';
import MangaCommand from '#command/anime/manga.command';
import { DiscordMessage, DiscordInteraction } from '#command/command.types';
import { CommandFeatures } from '#command/command.features';
import { EmbedBuilder } from 'discord.js';
import { Manga, JikanResults } from '#command/anime/jikan/jikan.types';
import { JikanService } from '#command/anime/jikan/jikan.service';

jest.mock('#command/anime/jikan/jikan.service');
jest.mock('#command/command.features');

describe('MangaCommand', () => {
  let mangaCommand: MangaCommand;
  let mockMessage: DiscordMessage;
  let mockInteraction: DiscordInteraction;

  beforeEach(() => {
    mangaCommand = new MangaCommand(createMock<CommandFeatures>() as any);
    mockMessage = createMock<DiscordMessage>();
    mockInteraction = createMock<DiscordInteraction>();
  });

  it('should set the correct properties', () => {
    expect(mangaCommand.name).toBe('manga');
    expect(mangaCommand.description).toBe('Search for a manga');
    expect(mangaCommand.regex).toEqual(new RegExp('^manga$|^manga ', 'i'));
    expect(mangaCommand.category).toBe('anime');
    expect(mangaCommand.usageExamples).toEqual(['manga <search>']);
  });

  it('should run prefix command and search for manga', async () => {
    mockMessage.content = 'manga naruto';
    const searchMangaSpy = jest
      .spyOn(mangaCommand, 'searchManga' as any)
      .mockResolvedValue({});

    await mangaCommand.runPrefix(mockMessage);

    expect(mangaCommand.currentUserSearch).toEqual([
      { userId: mockMessage.author.id, search: 'naruto' },
    ]);
    expect(searchMangaSpy).toHaveBeenCalledWith(mockMessage, 'naruto');
  });

  it('should run slash command and search for manga', async () => {
    mockInteraction.options.getString = jest.fn().mockReturnValue('naruto');
    const searchMangaSpy = jest
      .spyOn(mangaCommand, 'searchManga' as any)
      .mockResolvedValue({});

    await mangaCommand.runSlash(mockInteraction);

    expect(mangaCommand.currentUserSearch).toEqual([
      { userId: mockInteraction.user.id, search: 'naruto' },
    ]);
    expect(searchMangaSpy).toHaveBeenCalledWith(mockInteraction, 'naruto');
  });

  it('should handle manga selection', async () => {
    const mockMangaDetails = new EmbedBuilder().setTitle('Naruto');
    jest
      .spyOn(mangaCommand, 'getMangaDetails')
      .mockResolvedValue(mockMangaDetails);
    const createMenuSpy = jest
      .spyOn(mangaCommand, 'createMenu')
      .mockResolvedValue({} as any);

    await (mangaCommand as any).handleMangaSelection(mockInteraction, '1');

    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(mockInteraction.editReply).toHaveBeenCalledWith({
      embeds: [mockMangaDetails],
    });
    expect(createMenuSpy).toHaveBeenCalled();
  });

  it('should handle next action and search again', async () => {
    mangaCommand.currentUserSearch = [
      { userId: mockInteraction.user.id, search: 'naruto' },
    ];
    const searchMangaSpy = jest
      .spyOn(mangaCommand, 'searchManga' as any)
      .mockResolvedValue({});

    await mangaCommand.handleNextAction(mockInteraction, 'search');

    expect(searchMangaSpy).toHaveBeenCalledWith(
      mockInteraction,
      'naruto',
      true,
    );
  });

  it('should handle next action and exit', async () => {
    mangaCommand.currentUserSearch = [
      { userId: mockInteraction.user.id, search: 'naruto' },
    ];

    await mangaCommand.handleNextAction(mockInteraction, 'exit');

    expect(mangaCommand.currentUserSearch).toEqual([]);
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      'Thank you for using the manga command! Made with ❤️ by Ririko',
    );
  });

  describe('searchManga', () => {
    it('should search for manga and create a menu', async () => {
      const mockMangaData = [
        { mal_id: 1, title: 'Naruto', genres: [{ name: 'Action' }] },
      ];
      jest
        .spyOn(JikanService.prototype, 'searchManga')
        .mockResolvedValue({ data: mockMangaData } as JikanResults<Manga>);
      const createMenuSpy = jest
        .spyOn(mangaCommand, 'createMenu')
        .mockResolvedValue({} as any);

      await (mangaCommand as any).searchManga(mockInteraction, 'naruto');

      expect(createMenuSpy).toHaveBeenCalled();
    });

    it('should handle follow-up search', async () => {
      const mockMangaData = [
        { mal_id: 1, title: 'Naruto', genres: [{ name: 'Action' }] },
      ];
      jest
        .spyOn(JikanService.prototype, 'searchManga')
        .mockResolvedValue({ data: mockMangaData } as JikanResults<Manga>);
      const createMenuSpy = jest
        .spyOn(mangaCommand, 'createMenu')
        .mockResolvedValue({} as any);

      await (mangaCommand as any).searchManga(mockInteraction, 'naruto', true);

      expect(createMenuSpy).toHaveBeenCalled();
    });
  });
});
