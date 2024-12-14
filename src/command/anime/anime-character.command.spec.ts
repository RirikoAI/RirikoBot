import { createMock } from '@golevelup/ts-jest';
import AnimeCharacterCommand from '#command/anime/anime-character.command';
import { DiscordMessage, DiscordInteraction } from '#command/command.types';
import { CommandFeatures } from '#command/command.features';
import { EmbedBuilder } from 'discord.js';
import { AnimeCharacter, JikanResults } from '#command/anime/jikan/jikan.types';
import { JikanService } from '#command/anime/jikan/jikan.service';

jest.mock('#command/anime/jikan/jikan.service');
jest.mock('#command/command.features');

describe('AnimeCharacterCommand', () => {
  let animeCharacterCommand: AnimeCharacterCommand;
  let mockMessage: DiscordMessage;
  let mockInteraction: DiscordInteraction;

  beforeEach(() => {
    animeCharacterCommand = new AnimeCharacterCommand(
      createMock<CommandFeatures>() as any,
    );
    mockMessage = createMock<DiscordMessage>();
    mockInteraction = createMock<DiscordInteraction>();
  });

  it('should set the correct properties', () => {
    expect(animeCharacterCommand.name).toBe('anime-character');
    expect(animeCharacterCommand.description).toBe(
      'Search for an anime character',
    );
    expect(animeCharacterCommand.regex).toEqual(
      new RegExp('^anime-character', 'i'),
    );
    expect(animeCharacterCommand.category).toBe('anime');
    expect(animeCharacterCommand.usageExamples).toEqual([
      'anime-character <search>',
    ]);
  });

  it('should run prefix command and search for anime character', async () => {
    mockMessage.content = 'anime-character naruto';
    const searchAnimeCharacterSpy = jest
      .spyOn(animeCharacterCommand, 'searchAnimeCharacter' as any)
      .mockResolvedValue({});

    await animeCharacterCommand.runPrefix(mockMessage);

    expect(animeCharacterCommand.currentUserSearch).toEqual([
      { userId: mockMessage.author.id, search: 'naruto' },
    ]);
    expect(searchAnimeCharacterSpy).toHaveBeenCalledWith(mockMessage, 'naruto');
  });

  it('should run slash command and search for anime character', async () => {
    mockInteraction.options.getString = jest.fn().mockReturnValue('naruto');
    const searchAnimeCharacterSpy = jest
      .spyOn(animeCharacterCommand, 'searchAnimeCharacter' as any)
      .mockResolvedValue({});

    await animeCharacterCommand.runSlash(mockInteraction);

    expect(animeCharacterCommand.currentUserSearch).toEqual([
      { userId: mockInteraction.user.id, search: 'naruto' },
    ]);
    expect(searchAnimeCharacterSpy).toHaveBeenCalledWith(
      mockInteraction,
      'naruto',
    );
  });

  it('should handle anime character selection', async () => {
    const mockInteraction = createMock<DiscordInteraction>();
    const mockAnimeCharacterDetails = new EmbedBuilder().setTitle('Naruto');
    jest
      .spyOn(animeCharacterCommand, 'getAnimeCharacterDetails')
      .mockResolvedValue(mockAnimeCharacterDetails);
    const createMenuSpy = jest
      .spyOn(animeCharacterCommand, 'createMenu')
      .mockResolvedValue({} as any);

    await (animeCharacterCommand as any).handleAnimeCharacterSelection(
      mockInteraction,
      '1',
    );

    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(mockInteraction.editReply).toHaveBeenCalledWith({
      embeds: [mockAnimeCharacterDetails],
    });
    expect(createMenuSpy).toHaveBeenCalled();
  });

  it('should handle next action and search again', async () => {
    const mockInteraction = createMock<DiscordInteraction>();
    animeCharacterCommand.currentUserSearch = [
      { userId: mockInteraction.user.id, search: 'naruto' },
    ];
    const searchAnimeCharacterSpy = jest
      .spyOn(animeCharacterCommand, 'searchAnimeCharacter' as any)
      .mockResolvedValue({});

    await animeCharacterCommand.handleNextAction(mockInteraction, 'search');

    expect(searchAnimeCharacterSpy).toHaveBeenCalledWith(
      mockInteraction,
      'naruto',
      true,
    );
  });

  it('should handle next action and exit', async () => {
    const mockInteraction = createMock<DiscordInteraction>();
    animeCharacterCommand.currentUserSearch = [
      { userId: mockInteraction.user.id, search: 'naruto' },
    ];

    await animeCharacterCommand.handleNextAction(mockInteraction, 'exit');

    expect(animeCharacterCommand.currentUserSearch).toEqual([]);
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      'Thank you for using the anime command! Made with ❤️ by Ririko',
    );
  });

  describe('searchAnimeCharacter', () => {
    it('should search for anime character and create a menu', async () => {
      const mockInteraction = createMock<DiscordInteraction>();
      const mockAnimeCharacterData = [
        { mal_id: 1, name: 'Naruto', about: 'A ninja' },
      ];
      jest
        .spyOn(JikanService.prototype, 'searchAnimeCharacters')
        .mockResolvedValue({
          data: mockAnimeCharacterData,
        } as JikanResults<AnimeCharacter>);
      const createMenuSpy = jest
        .spyOn(animeCharacterCommand, 'createMenu')
        .mockResolvedValue({} as any);

      await (animeCharacterCommand as any).searchAnimeCharacter(
        mockInteraction,
        'naruto',
      );

      expect(createMenuSpy).toHaveBeenCalled();
    });

    it('should handle follow-up search', async () => {
      const mockInteraction = createMock<DiscordInteraction>();
      const mockAnimeCharacterData = [
        { mal_id: 1, name: 'Naruto', about: 'A ninja' },
      ];
      jest
        .spyOn(JikanService.prototype, 'searchAnimeCharacters')
        .mockResolvedValue({
          data: mockAnimeCharacterData,
        } as JikanResults<AnimeCharacter>);
      const createMenuSpy = jest
        .spyOn(animeCharacterCommand, 'createMenu')
        .mockResolvedValue({} as any);

      await (animeCharacterCommand as any).searchAnimeCharacter(
        mockInteraction,
        'naruto',
        true,
      );

      expect(createMenuSpy).toHaveBeenCalled();
    });
  });
});
