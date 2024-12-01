import { Image } from 'canvas';

export const ImageUtil = {
  /**
   * Check if a URL is an image.
   * @param url - The URL to check.
   * @returns A boolean indicating if the URL is an image.
   */
  async isImage(url: string): Promise<boolean> {
    try {
      const response = await fetch(url);
      const contentType = response.headers.get('content-type');
      const image = new Image();
      image.src = url;
      // @ts-ignore
      await new Promise((r) => (image.onload = r), (image.src = url));
      return (
        image.width > 0 && image.height > 0 && contentType?.startsWith('image')
      );
    } catch (e) {
      return false;
    }
  },
};
