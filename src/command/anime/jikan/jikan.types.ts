// Jikan API Service parameters
export type JikanResults<DataType> = {
  pagination?: JikanPagination;
  data: DataType[];
};

export type JikanResult<DataType> = {
  pagination?: JikanPagination;
  data: DataType;
};

export type JikanPaginationParams = {
  page?: string;
  limit?: string;
  sort?: 'desc' | 'asc';
  order_by?: string;
};

export type JikanImage = {
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

export type JikanPerson = {
  mal_id: number;
  url: string;
  images: JikanImage;
  name: string;
};

// Search Anime
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
  letter?: string;
  producers?: string;
  start_date?: string;
  end_date?: string;
} & JikanPaginationParams;

export type JikanPagination = {
  last_visible_page: number;
  has_next_page: boolean;
  current_page: number;
  items: {
    count: number;
    total: number;
    per_page: number;
  };
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

export type FullAnime = {
  relations: {
    relation: string;
    entry: {
      mal_id: number;
      type: string;
      name: string;
      url: string;
    }[];
  };
  theme: {
    openings: string[];
    endings: string[];
  };
  external: {
    name: string;
    url: string;
  }[];
  streaming: {
    name: string;
    url: string;
  }[];
} & Anime;

// Search Manga
export type Manga = {
  mal_id: number;
  url: string;
  images: JikanImage;
  approved: boolean;
  titles: {
    type: string;
    title: string;
  }[];
  title: string;
  title_english: string;
  title_japanese: string;
  type: string;
  chapters: number;
  volumes: number;
  status: string;
  publishing: boolean;
  published: {
    from: string;
    to: string | null;
    prop: {
      from: {
        day: number;
        month: number;
        year: number;
      };
      to: {
        day: number;
        month: number;
        year: number;
      };
      string: string;
    };
  };
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number;
  members: number;
  favorites: number;
  synopsis: string;
  background: string;
  authors: {
    mal_id: number;
    type: string;
    name: string;
    url: string;
  }[];
  serializations: {
    mal_id: number;
    type: string;
    name: string;
    url: string;
  }[];
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

//Search Anime Episodes
export type AnimeEpisode = {
  mal_id: number;
  title: string;
  episode: number;
  aired: string;
  filler: boolean;
  recap: boolean;
  video_url: string;
  forum_url: string;
};

// Search Anime Characters
export type SearchAnimeCharactersParams = {
  q: string;
  letter?: string;
} & JikanPaginationParams;

export type AnimeCharacter = {
  mal_id: number;
  url: string;
  name: string;
  name_kanji: string;
  nicknames: string[];
  favorites: number;
  about: string;
  images: JikanImage;
};

export type FullAnimeCharacter = {
  anime: {
    role: string;
    anime: {
      mal_id: number;
      url: string;
      title: string;
      images: JikanImage;
    };
  }[];
  manga: {
    role: string;
    manga: {
      mal_id: number;
      url: string;
      title: string;
      images: JikanImage;
    };
  }[];
  voices: {
    language: string;
    person: JikanPerson;
  }[];
} & AnimeCharacter;
