import { ImageUtil } from '#util/image/image.util';

describe('ImageUtil.isImage', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    // Mock the global fetch function
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    // Mock Image class
    jest.spyOn(require('canvas'), 'Image').mockImplementation(() => {
      return {
        width: 0,
        height: 0,
        set src(value: string) {
          if (this.onload) {
            // Simulate async onload behavior
            setImmediate(() => this.onload());
          }
        },
        onload: jest.fn(),
      } as unknown as HTMLImageElement;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return true if the URL is a valid image', async () => {
    // Mock fetch response with valid content type
    mockFetch.mockResolvedValue({
      headers: {
        get: jest.fn(() => 'image/png'),
      },
    });

    // Set mock Image dimensions
    const mockImage = require('canvas').Image;
    mockImage.width = 100;
    mockImage.height = 100;

    jest.spyOn(require('canvas'), 'Image').mockImplementation(() => {
      return {
        width: 110,
        height: 110,
        set src(value: string) {
          if (this.onload) {
            // Simulate async onload behavior
            setImmediate(() => this.onload());
          }
        },
        onload: jest.fn(),
      } as unknown as HTMLImageElement;
    });

    const isValid = await ImageUtil.isImage('http://example.com/image.png');

    expect(isValid).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('http://example.com/image.png');
  });

  it('should return false if fetch fails', async () => {
    // Simulate fetch rejection
    mockFetch.mockRejectedValue(new Error('Network error'));

    const isValid = await ImageUtil.isImage('http://example.com/image.png');

    expect(isValid).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith('http://example.com/image.png');
  });

  it('should return false if content type is not an image', async () => {
    // Mock fetch response with invalid content type
    mockFetch.mockResolvedValue({
      headers: {
        get: jest.fn(() => 'text/html'),
      },
    });

    const isValid = await ImageUtil.isImage('http://example.com/not-an-image');

    expect(isValid).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith('http://example.com/not-an-image');
  });

  it('should return false if image dimensions are invalid', async () => {
    // Mock fetch response with valid content type
    mockFetch.mockResolvedValue({
      headers: {
        get: jest.fn(() => 'image/png'),
      },
    });

    // Set mock Image dimensions to invalid
    const mockImage = require('canvas').Image;
    mockImage.prototype.width = 0;
    mockImage.prototype.height = 0;

    const isValid = await ImageUtil.isImage(
      'http://example.com/invalid-image.png',
    );

    expect(isValid).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://example.com/invalid-image.png',
    );
  });
});
