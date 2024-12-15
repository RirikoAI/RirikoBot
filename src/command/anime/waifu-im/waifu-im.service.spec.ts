import { WaifuImService } from './waifu-im.service';
import { WaifuImApi } from '#command/anime/waifu-im/waifu-im-api';

jest.mock('#command/anime/waifu-im/waifu-im-api');

describe('WaifuImService', () => {
  let service: WaifuImService;
  let waifuImApiMock: jest.Mocked<WaifuImApi>;

  beforeEach(() => {
    waifuImApiMock = new WaifuImApi() as jest.Mocked<WaifuImApi>;
    (WaifuImApi as jest.Mock).mockImplementation(() => waifuImApiMock);
    service = new WaifuImService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(waifuImApiMock).toBeDefined();
  });

  describe('getRandomSelfies', () => {
    it('should return random selfies', async () => {
      const mockSelfies = [{ id: 1, url: 'https://example.com/selfie1.jpg' }];
      waifuImApiMock.getRandomSelfies.mockResolvedValue(mockSelfies);

      const result = await service.getRandomSelfies();

      expect(waifuImApiMock.getRandomSelfies).toHaveBeenCalled();
      expect(result).toEqual(mockSelfies);
    });
  });
});
