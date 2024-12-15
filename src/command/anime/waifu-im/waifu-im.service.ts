import { Injectable } from '@nestjs/common';
import { WaifuImApi } from '#command/anime/waifu-im/waifu-im-api';

export
@Injectable()
class WaifuImService {
  private waifuImApi: WaifuImApi;

  constructor() {
    this.waifuImApi = new WaifuImApi();
  }

  async getRandomSelfies(): Promise<any> {
    return await this.waifuImApi.getRandomSelfies();
  }
}
