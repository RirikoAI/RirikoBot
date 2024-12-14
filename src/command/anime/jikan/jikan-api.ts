import {
  Anime,
  AnimeCharacter,
  AnimeEpisode,
  FullAnime, FullAnimeCharacter,
  JikanResult,
  JikanResults,
  SearchAnimeCharactersParams,
  SearchAnimeParams
} from "#command/anime/jikan/jikan.types";

export class JikanApi {
  /**
   * @see api-docs.json
   * @private
   */
  private baseUrl = 'https://api.jikan.moe/v4';

  set setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  async searchAnime(params: SearchAnimeParams): Promise<JikanResults<Anime>> {
    const query = new URLSearchParams(params).toString();
    const url = `${this.baseUrl}/anime?${query}`;
    const response = await fetch(url);
    return response.json();
  }

  async getAnimeDetails(id: number): Promise<JikanResult<Anime>> {
    const url = `${this.baseUrl}/anime/${id}`;
    const response = await fetch(url);
    return response.json();
  }

  async getFullAnimeDetails(id: number): Promise<JikanResult<FullAnime>> {
    const url = `${this.baseUrl}/anime/${id}`;
    const response = await fetch(url);
    return response.json();
  }

  async getAnimeEpisodes(id: number): Promise<JikanResult<AnimeEpisode>> {
    const url = `${this.baseUrl}/anime/${id}/episodes`;
    const response = await fetch(url);
    return response.json();
  }

  async searchAnimeCharacters(
    params: SearchAnimeCharactersParams,
  ): Promise<JikanResults<AnimeCharacter>> {
    const query = new URLSearchParams(params).toString();
    const url = `${this.baseUrl}/characters?${query}`;
    const response = await fetch(url);
    return response.json();
  }

  async getAnimeCharacter(
    id: number,
  ): Promise<JikanResult<FullAnimeCharacter>> {
    const url = `${this.baseUrl}/characters/${id}/full`;
    const response = await fetch(url);
    return response.json();
  }
}
