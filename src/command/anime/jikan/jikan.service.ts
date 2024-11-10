import { Injectable } from '@nestjs/common';
import { JikanApi, SearchAnimeResults } from '#command/anime/jikan/jikan-api';

@Injectable()
export class JikanService {
  private jikanApi: JikanApi;

  constructor() {
    this.jikanApi = new JikanApi();
  }

  async searchAnime(search: string): Promise<SearchAnimeResults> {
    const response = await this.jikanApi.searchAnime({
      q: search,
    });
    return response;
  }

  async getAnimeDetails(id: number) {
    const response = await this.jikanApi.getAnimeDetails(id);
    return response.data;
  }
}
