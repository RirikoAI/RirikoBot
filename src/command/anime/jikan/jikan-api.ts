export class JikanApi {
  /**
   * @see api-docs.json
   * @private
   */
  private baseUrl = 'https://api.jikan.moe/v4';

  async searchAnime(params: SearchAnimeParams): Promise<SearchAnimeResults> {
    const query = new URLSearchParams(params).toString();
    const url = `${this.baseUrl}/anime?${query}`;
    const response = await fetch(url);
    return response.json();
  }

  async getAnimeDetails(id: number): Promise<any> {
    const url = `${this.baseUrl}/anime/${id}`;
    const response = await fetch(url);
    return response.json();
  }
}

export type SearchAnimeParams = {
  q: string;
  type?: string;
  score?: string;
  min_score?: string;
  max_score?: string;
  status?: string;
  rating?: string;
  sfw?: string;
  genres?: string;
  genres_exclude?: string;
  order_by?: string;
  sort?: string;
  letter?: string;
  producers?: string;
  start_date?: string;
  end_date?: string;
};

export type SearchAnimeResults = {
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
    current_page: number;
    items: {
      count: number;
      total: number;
      per_page: number;
    };
  };
  data: Anime[];
};

export type Anime = {
  mal_id: number;
  url: string;
  images: {
    jpg: {
      image_url: string;
      small_image_url: string;
      large_image_url: string;
    };
    webp: {
      image_url: string;
      small_image_url: string;
      large_image_url: string;
    };
  };
  trailer: {
    youtube_id: string;
    url: string;
    embed_url: string;
    images: {
      image_url: string;
      small_image_url: string;
      medium_image_url: string;
      large_image_url: string;
      maximum_image_url: string;
    };
  };
  approved: boolean;
  titles: {
    type: string;
    title: string;
  }[];
  title: string;
  title_english: string;
  title_japanese: string;
  title_synonyms: string[];
  type: string;
  source: string;
  episodes: number | null;
  status: string;
  airing: boolean;
  aired: {
    from: string;
    to: string | null;
    prop: {
      from: {
        from: string;
        to: string | null;
      };
      to: {
        from: string;
        to: string | null;
      };
    };
    string: string;
  };
  duration: string;
  rating: string;
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number;
  members: number;
  favorites: number;
  synopsis: string;
  background: string;
  season: string | null;
  year: number | null;
  broadcast: {
    day: string | null;
    time: string | null;
    timezone: string | null;
    string: string;
  };
  producers: {
    mal_id: number;
    type: string;
    name: string;
    url: string;
  }[];
  licensors: any[];
  studios: any[];
  genres: {
    mal_id: number;
    type: string;
    name: string;
    url: string;
  }[];
  explicit_genres: any[];
  themes: {
    mal_id: number;
    type: string;
    name: string;
    url: string;
  }[];
  demographics: {
    mal_id: number;
    type: string;
    name: string;
    url: string;
  }[];
};
