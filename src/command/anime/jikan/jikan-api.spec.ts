import { JikanApi } from './jikan-api';
import {
  Anime,
  JikanResults,
  JikanResult,
} from '#command/anime/jikan/jikan.types';

global.fetch = jest.fn();

describe('JikanApi', () => {
  let api: JikanApi;

  beforeEach(() => {
    api = new JikanApi();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should search for anime', async () => {
    const mockResponse: JikanResults<Anime> = {
      pagination: {
        last_visible_page: 1,
        has_next_page: false,
        current_page: 1,
        items: {
          count: 1,
          total: 1,
          per_page: 1,
        },
      },
      data: [
        {
          mal_id: 1,
          url: 'https://myanimelist.net/anime/1',
          images: {
            jpg: {
              image_url: 'https://cdn.myanimelist.net/images/anime/1/1.jpg',
              small_image_url:
                'https://cdn.myanimelist.net/images/anime/1/1t.jpg',
              large_image_url:
                'https://cdn.myanimelist.net/images/anime/1/1l.jpg',
            },
            webp: {
              image_url: 'https://cdn.myanimelist.net/images/anime/1/1.webp',
              small_image_url:
                'https://cdn.myanimelist.net/images/anime/1/1t.webp',
              large_image_url:
                'https://cdn.myanimelist.net/images/anime/1/1l.webp',
            },
          },
          trailer: {
            youtube_id: 'abc123',
            url: 'https://www.youtube.com/watch?v=abc123',
            embed_url: 'https://www.youtube.com/embed/abc123',
            images: {
              image_url: 'https://img.youtube.com/vi/abc123/0.jpg',
              small_image_url: 'https://img.youtube.com/vi/abc123/1.jpg',
              medium_image_url: 'https://img.youtube.com/vi/abc123/2.jpg',
              large_image_url: 'https://img.youtube.com/vi/abc123/3.jpg',
              maximum_image_url:
                'https://img.youtube.com/vi/abc123/maxresdefault.jpg',
            },
          },
          approved: true,
          titles: [{ type: 'Default', title: 'Anime Title' }],
          title: 'Anime Title',
          title_english: 'Anime Title',
          title_japanese: 'アニメタイトル',
          title_synonyms: ['Anime Title Synonym'],
          type: 'TV',
          source: 'Manga',
          episodes: 12,
          status: 'Finished Airing',
          airing: false,
          aired: {
            from: '2020-01-01',
            to: '2020-12-31',
            prop: {
              from: { from: '2020-01-01', to: null },
              to: { from: '2020-12-31', to: null },
            },
            string: 'Jan 1, 2020 to Dec 31, 2020',
          },
          duration: '24 min per ep',
          rating: 'PG-13',
          score: 8.5,
          scored_by: 100000,
          rank: 100,
          popularity: 50,
          members: 200000,
          favorites: 5000,
          synopsis: 'This is a synopsis.',
          background: 'This is a background.',
          season: 'Winter',
          year: 2020,
          broadcast: {
            day: 'Saturday',
            time: '17:00',
            timezone: 'Asia/Tokyo',
            string: 'Saturdays at 17:00 (JST)',
          },
          producers: [
            {
              mal_id: 1,
              type: 'Producer',
              name: 'Producer Name',
              url: 'https://myanimelist.net/producer/1',
            },
          ],
          licensors: [],
          studios: [],
          genres: [
            {
              mal_id: 1,
              type: 'Genre',
              name: 'Action',
              url: 'https://myanimelist.net/genre/1',
            },
          ],
          explicit_genres: [],
          themes: [
            {
              mal_id: 1,
              type: 'Theme',
              name: 'Adventure',
              url: 'https://myanimelist.net/theme/1',
            },
          ],
          demographics: [
            {
              mal_id: 1,
              type: 'Demographic',
              name: 'Shounen',
              url: 'https://myanimelist.net/demographic/1',
            },
          ],
        },
      ],
    };

    (fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const result = await api.searchAnime({ q: 'Naruto' });
    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.jikan.moe/v4/anime?q=Naruto',
    );
  });

  it('should get anime details', async () => {
    const mockResponse: JikanResult<Anime> = {
      data: {
        mal_id: 1,
        url: 'https://myanimelist.net/anime/1',
        images: {
          jpg: {
            image_url: 'https://cdn.myanimelist.net/images/anime/1/1.jpg',
            small_image_url:
              'https://cdn.myanimelist.net/images/anime/1/1t.jpg',
            large_image_url:
              'https://cdn.myanimelist.net/images/anime/1/1l.jpg',
          },
          webp: {
            image_url: 'https://cdn.myanimelist.net/images/anime/1/1.webp',
            small_image_url:
              'https://cdn.myanimelist.net/images/anime/1/1t.webp',
            large_image_url:
              'https://cdn.myanimelist.net/images/anime/1/1l.webp',
          },
        },
        trailer: {
          youtube_id: 'abc123',
          url: 'https://www.youtube.com/watch?v=abc123',
          embed_url: 'https://www.youtube.com/embed/abc123',
          images: {
            image_url: 'https://img.youtube.com/vi/abc123/0.jpg',
            small_image_url: 'https://img.youtube.com/vi/abc123/1.jpg',
            medium_image_url: 'https://img.youtube.com/vi/abc123/2.jpg',
            large_image_url: 'https://img.youtube.com/vi/abc123/3.jpg',
            maximum_image_url:
              'https://img.youtube.com/vi/abc123/maxresdefault.jpg',
          },
        },
        approved: true,
        titles: [{ type: 'Default', title: 'Anime Title' }],
        title: 'Anime Title',
        title_english: 'Anime Title',
        title_japanese: 'アニメタイトル',
        title_synonyms: ['Anime Title Synonym'],
        type: 'TV',
        source: 'Manga',
        episodes: 12,
        status: 'Finished Airing',
        airing: false,
        aired: {
          from: '2020-01-01',
          to: '2020-12-31',
          prop: {
            from: { from: '2020-01-01', to: null },
            to: { from: '2020-12-31', to: null },
          },
          string: 'Jan 1, 2020 to Dec 31, 2020',
        },
        duration: '24 min per ep',
        rating: 'PG-13',
        score: 8.5,
        scored_by: 100000,
        rank: 100,
        popularity: 50,
        members: 200000,
        favorites: 5000,
        synopsis: 'This is a synopsis.',
        background: 'This is a background.',
        season: 'Winter',
        year: 2020,
        broadcast: {
          day: 'Saturday',
          time: '17:00',
          timezone: 'Asia/Tokyo',
          string: 'Saturdays at 17:00 (JST)',
        },
        producers: [
          {
            mal_id: 1,
            type: 'Producer',
            name: 'Producer Name',
            url: 'https://myanimelist.net/producer/1',
          },
        ],
        licensors: [],
        studios: [],
        genres: [
          {
            mal_id: 1,
            type: 'Genre',
            name: 'Action',
            url: 'https://myanimelist.net/genre/1',
          },
        ],
        explicit_genres: [],
        themes: [
          {
            mal_id: 1,
            type: 'Theme',
            name: 'Adventure',
            url: 'https://myanimelist.net/theme/1',
          },
        ],
        demographics: [
          {
            mal_id: 1,
            type: 'Demographic',
            name: 'Shounen',
            url: 'https://myanimelist.net/demographic/1',
          },
        ],
      },
    };

    (fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const result = await api.getAnimeDetails(1);
    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith('https://api.jikan.moe/v4/anime/1');
  });
});
