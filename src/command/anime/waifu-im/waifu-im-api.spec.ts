import { WaifuImApi } from './waifu-im-api';

global.fetch = jest.fn();

describe('WaifuImApi', () => {
  let api: WaifuImApi;

  beforeEach(() => {
    api = new WaifuImApi();
    (fetch as jest.Mock).mockClear();
  });

  it('should get random selfies', async () => {
    const mockResponse = { images: [] };
    (fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const result = await api.getRandomSelfies();

    expect(fetch).toHaveBeenCalledWith('https://api.waifu.im/search');
    expect(result).toEqual(mockResponse);
  });

  it('should set base URL', () => {
    const newUrl = 'https://new.api.waifu.im';
    api.setBaseUrl = newUrl;

    expect((api as any).baseUrl).toBe(newUrl);
  });
});
