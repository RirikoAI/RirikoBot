import { createMock } from '@golevelup/ts-jest';
import AnimeCommand from '#command/anime/anime.command';
import { DiscordMessage, DiscordInteraction } from '#command/command.types';
import { CommandFeatures } from '#command/command.features';
import { EmbedBuilder } from 'discord.js';
import { Anime, JikanResults } from '#command/anime/jikan/jikan.types';
import { JikanService } from '#command/anime/jikan/jikan.service';

jest.mock('#command/anime/jikan/jikan.service');
jest.mock('#command/command.features');

describe('AnimeCommand', () => {
  let animeCommand: AnimeCommand;
  let mockMessage: DiscordMessage;
  let mockInteraction: DiscordInteraction;

  beforeEach(() => {
    animeCommand = new AnimeCommand(createMock<CommandFeatures>() as any);
    mockMessage = createMock<DiscordMessage>();
    mockInteraction = createMock<DiscordInteraction>();
  });

  it('should set the correct properties', () => {
    expect(animeCommand.name).toBe('anime');
    expect(animeCommand.description).toBe('Search for an anime');
    expect(animeCommand.regex).toEqual(new RegExp('^anime$|^anime ', 'i'));
    expect(animeCommand.category).toBe('anime');
    expect(animeCommand.usageExamples).toEqual(['anime <search>']);
  });

  it('should run prefix command and search for anime', async () => {
    mockMessage.content = 'anime naruto';
    const searchAnimeSpy = jest
      .spyOn(animeCommand, 'searchAnime' as any)
      .mockResolvedValue({});

    await animeCommand.runPrefix(mockMessage);

    expect(animeCommand.currentUserSearch).toEqual([
      { userId: mockMessage.author.id, search: 'naruto' },
    ]);
    expect(searchAnimeSpy).toHaveBeenCalledWith(mockMessage, 'naruto');
  });

  it('should run slash command and search for anime', async () => {
    mockInteraction.options.getString = jest.fn().mockReturnValue('naruto');
    const searchAnimeSpy = jest
      .spyOn(animeCommand, 'searchAnime' as any)
      .mockResolvedValue({});

    await animeCommand.runSlash(mockInteraction);

    expect(animeCommand.currentUserSearch).toEqual([
      { userId: mockInteraction.user.id, search: 'naruto' },
    ]);
    expect(searchAnimeSpy).toHaveBeenCalledWith(mockInteraction, 'naruto');
  });

  it('should handle anime selection', async () => {
    const mockInteraction = createMock<DiscordInteraction>();
    const mockAnimeDetails = new EmbedBuilder().setTitle('Naruto');
    jest
      .spyOn(animeCommand, 'getAnimeDetails')
      .mockResolvedValue(mockAnimeDetails);
    const createMenuSpy = jest
      .spyOn(animeCommand, 'createMenu')
      .mockResolvedValue({} as any);

    await (animeCommand as any).handleAnimeSelection(mockInteraction, '1');

    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(mockInteraction.editReply).toHaveBeenCalledWith({
      embeds: [mockAnimeDetails],
    });
    expect(createMenuSpy).toHaveBeenCalled();
  });

  it('should handle next action and search again', async () => {
    const mockInteraction = createMock<DiscordInteraction>();
    animeCommand.currentUserSearch = [
      { userId: mockInteraction.user.id, search: 'naruto' },
    ];
    const searchAnimeSpy = jest
      .spyOn(animeCommand, 'searchAnime' as any)
      .mockResolvedValue({});

    await animeCommand.handleNextAction(mockInteraction, 'search');

    expect(searchAnimeSpy).toHaveBeenCalledWith(
      mockInteraction,
      'naruto',
      true,
    );
  });

  it('should handle next action and exit', async () => {
    const mockInteraction = createMock<DiscordInteraction>();
    animeCommand.currentUserSearch = [
      { userId: mockInteraction.user.id, search: 'naruto' },
    ];

    await animeCommand.handleNextAction(mockInteraction, 'exit');

    expect(animeCommand.currentUserSearch).toEqual([]);
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      'Thank you for using the anime command! Made with ❤️ by Ririko',
    );
  });

  describe('searchAnime', () => {
    it('should search for anime and create a menu', async () => {
      const mockInteraction = createMock<DiscordInteraction>();
      const mockAnimeData = [
        { mal_id: 1, title: 'Naruto', genres: [{ name: 'Action' }] },
      ];
      jest
        .spyOn(JikanService.prototype, 'searchAnime')
        .mockResolvedValue({ data: mockAnimeData } as JikanResults<Anime>);
      const createMenuSpy = jest
        .spyOn(animeCommand, 'createMenu')
        .mockResolvedValue({} as any);

      await (animeCommand as any).searchAnime(mockInteraction, 'naruto');

      expect(createMenuSpy).toHaveBeenCalled();
    });

    it('should handle follow-up search', async () => {
      const mockInteraction = createMock<DiscordInteraction>();
      const mockAnimeData = [
        { mal_id: 1, title: 'Naruto', genres: [{ name: 'Action' }] },
      ];
      jest
        .spyOn(JikanService.prototype, 'searchAnime')
        .mockResolvedValue({ data: mockAnimeData } as JikanResults<Anime>);
      const createMenuSpy = jest
        .spyOn(animeCommand, 'createMenu')
        .mockResolvedValue({} as any);

      await (animeCommand as any).searchAnime(mockInteraction, 'naruto', true);

      expect(createMenuSpy).toHaveBeenCalled();
    });
  });
});
