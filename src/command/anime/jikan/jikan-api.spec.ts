import { JikanApi } from './jikan-api';
import {
  Anime,
  AnimeEpisode,
  FullAnime,
  JikanResult,
  JikanResults,
  SearchAnimeParams,
} from '#command/anime/jikan/jikan.types';

global.fetch = jest.fn();

describe('JikanApi', () => {
  let api: JikanApi;

  beforeEach(() => {
    api = new JikanApi();
    (fetch as jest.Mock).mockClear();
  });

  it('should search anime', async () => {
    const params: SearchAnimeParams = { q: 'Naruto' };
    const mockResponse: JikanResults<Anime> = { data: [] };
    (fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const result = await api.searchAnime(params);

    expect(fetch).toHaveBeenCalledWith('https://api.jikan.moe/v4/anime?q=Naruto');
    expect(result).toEqual(mockResponse);
  });

  it('should get anime details', async () => {
    const id = 1;
    const mockResponse: JikanResult<Anime> = { data: {} as Anime };
    (fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const result = await api.getAnimeDetails(id);

    expect(fetch).toHaveBeenCalledWith('https://api.jikan.moe/v4/anime/1');
    expect(result).toEqual(mockResponse);
  });

  it('should get full anime details', async () => {
    const id = 1;
    const mockResponse: JikanResult<FullAnime> = { data: {} as FullAnime };
    (fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const result = await api.getFullAnimeDetails(id);

    expect(fetch).toHaveBeenCalledWith('https://api.jikan.moe/v4/anime/1');
    expect(result).toEqual(mockResponse);
  });

  it('should get anime episodes', async () => {
    const id = 1;
    const mockResponse: JikanResult<AnimeEpisode> = { data: {} as AnimeEpisode };
    (fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const result = await api.getAnimeEpisodes(id);

    expect(fetch).toHaveBeenCalledWith('https://api.jikan.moe/v4/anime/1/episodes');
    expect(result).toEqual(mockResponse);
  });
});