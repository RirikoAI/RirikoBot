import {
  Anime,
  AnimeEpisode,
  FullAnime,
  JikanResult,
  JikanResults,
  SearchAnimeParams,
} from '#command/anime/jikan/jikan.types';

export class JikanApi {
  /**
   * @see api-docs.json
   * @private
   */
  private baseUrl = 'https://api.jikan.moe/v4';

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
}
