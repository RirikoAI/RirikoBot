export class WaifuImApi {
  private baseUrl = 'https://api.waifu.im';

  set setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  async getRandomSelfies(): Promise<any> {
    const url = `${this.baseUrl}/search`;
    const response = await fetch(url);
    return response.json();
  }
}
