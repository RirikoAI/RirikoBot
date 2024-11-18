import { JikanService } from './jikan.service';
import { JikanApi } from '#command/anime/jikan/jikan-api';
import { Anime, JikanResults } from '#command/anime/jikan/jikan.types';

jest.mock('#command/anime/jikan/jikan-api');

describe('JikanService', () => {
  let service: JikanService;
  let jikanApiMock: jest.Mocked<JikanApi>;

  beforeEach(() => {
    jikanApiMock = new JikanApi() as jest.Mocked<JikanApi>;
    (JikanApi as jest.Mock).mockImplementation(() => jikanApiMock);
    service = new JikanService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  
  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(jikanApiMock).toBeDefined();
  });
  
  describe('searchAnime', () => {
    it('should return search results for anime', async () => {
      const mockSearch = 'Naruto';
      const mockResults: JikanResults<Anime> = {
        data: [
          { mal_id: 1, title: 'Naruto', url: 'https://example.com/naruto' } as any,
        ],
        pagination: {
          last_visible_page: 1,
          has_next_page: false,
          current_page: 1,
          items: { count: 1, total: 1, per_page: 10 },
        },
      };

      jikanApiMock.searchAnime.mockResolvedValue(mockResults);

      const result = await service.searchAnime(mockSearch);

      expect(jikanApiMock.searchAnime).toHaveBeenCalledWith({ q: mockSearch });
      expect(result).toEqual(mockResults);
    });
  });

  describe('getAnimeDetails', () => {
    it('should return details of a specific anime', async () => {
      const mockId = 1;
      const mockAnime: any = {
        mal_id: mockId,
        title: 'Naruto',
        url: 'https://example.com/naruto',
      };

      jikanApiMock.getAnimeDetails.mockResolvedValue({ data: mockAnime });

      const result = await service.getAnimeDetails(mockId);

      expect(jikanApiMock.getAnimeDetails).toHaveBeenCalledWith(mockId);
      expect(result).toEqual(mockAnime);
    });
  });
});
