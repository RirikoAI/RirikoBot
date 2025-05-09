import { Injectable } from '@nestjs/common';
import { JikanApi } from '#command/anime/jikan/jikan-api';
import {
  Anime,
  AnimeCharacter,
  FullAnimeCharacter,
  JikanResults,
  Manga,
} from '#command/anime/jikan/jikan.types';

/**
 * JikanService
 * @description Service for interacting with Jikan API
 * @category Service
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export class JikanService {
  private jikanApi: JikanApi;

  constructor() {
    this.jikanApi = new JikanApi();
  }

  async searchAnime(search: string): Promise<JikanResults<Anime>> {
    const response = await this.jikanApi.searchAnime({
      q: search,
    });
    return response;
  }

  async getAnimeDetails(id: number): Promise<Anime> {
    const response = await this.jikanApi.getAnimeDetails(id);
    return response.data;
  }

  async searchAnimeCharacters(
    search: string,
  ): Promise<JikanResults<AnimeCharacter>> {
    const response = await this.jikanApi.searchAnimeCharacters({
      q: search,
    });
    return response;
  }

  async getAnimeCharacter(id: number): Promise<FullAnimeCharacter> {
    const response = await this.jikanApi.getAnimeCharacter(id);
    return response.data;
  }

  async searchManga(search: string): Promise<JikanResults<Manga>> {
    const response = await this.jikanApi.searchManga({
      q: search,
    });
    return response;
  }

  async getMangaDetails(id: number): Promise<Manga> {
    const response = await this.jikanApi.getMangaDetails(id);
    return response.data;
  }
}
