/** Source-neutral anime/manga models shared by commands, whichever upstream answered. */
export type AnimeDataSource = 'myanimelist' | 'anilist';

export type AnimeMediaKind = 'ANIME' | 'MANGA';

export interface AnimeMediaDetails {
  source: AnimeDataSource;
  /** Id within `source`. */
  id: number;
  kind: AnimeMediaKind;
  title: string;
  englishTitle: string | null;
  nativeTitle: string | null;
  synopsis: string | null;
  url: string | null;
  imageUrl: string | null;
  /** 0-10 score. */
  score: number | null;
  /** MyAnimeList popularity rank; AniList has no rank. */
  popularityRank: number | null;
  /** Users with the entry on their list. */
  members: number | null;
  /** Raw upstream format/type, e.g. `TV`, `Movie`, `ONE_SHOT`. */
  format: string | null;
  /** Raw upstream status, e.g. `Finished Airing`, `RELEASING`. */
  status: string | null;
  /** Partial ISO date (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`). */
  startDate: string | null;
  endDate: string | null;
  genres: string[];
  /** Age rating (MyAnimeList only), e.g. `PG-13 - Teens 13 or older`. */
  ageRating: string | null;
  isAdult: boolean;
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  studios: string[];
  producers: string[];
  authors: string[];
}

export interface AnimeCharacterSummary {
  source: AnimeDataSource;
  id: number;
  name: string;
  nativeName: string | null;
  imageUrl: string | null;
  favourites: number;
}

export interface AnimeCharacterDetails extends AnimeCharacterSummary {
  nicknames: string[];
  about: string | null;
  url: string | null;
  animeTitles: string[];
  mangaTitles: string[];
  voiceActors: string[];
}

export interface AnimeSearchResult<T> {
  /** Upstream that produced `items`; `anilist` means MyAnimeList (Jikan) was unavailable or skipped. */
  source: AnimeDataSource;
  items: T[];
}
