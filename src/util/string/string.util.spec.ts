import { StringUtil } from './string.util';
import { DiscordMessage } from '#command/command.types';

describe('StringUtil', () => {
  test('capitalize should capitalize the first letter of a string', () => {
    expect(StringUtil.capitalize('hello')).toBe('Hello');
  });

  test('capitalize should return an empty string if input is empty', () => {
    expect(StringUtil.capitalize('')).toBe('');
  });

  test('capitalize should handle single character strings', () => {
    expect(StringUtil.capitalize('a')).toBe('A');
  });

  test('capitalize should not change the rest of the string', () => {
    expect(StringUtil.capitalize('hELLO')).toBe('HELLO');
  });

  describe('isGibberish', () => {
    const createMockMessage = (content: string): DiscordMessage =>
      ({
        content,
        mentions: {
          users: { size: 0 },
          channels: { size: 0 },
          roles: { size: 0 },
          everyone: false,
        },
        reactions: { cache: { size: 0 } },
        stickers: { size: 0 },
      }) as unknown as DiscordMessage;

    test('should return true if message content length is less than 5', () => {
      const message = createMockMessage('1234');
      expect(StringUtil.isGibberish(message)).toBe(true);
    });

    test('should return true if message content does not include a space', () => {
      const message = createMockMessage('hello');
      expect(StringUtil.isGibberish(message)).toBe(true);
    });

    test('should return true if message content is only numbers', () => {
      const message = createMockMessage('12345');
      expect(StringUtil.isGibberish(message)).toBe(true);
    });

    test('should return true if message content includes a URL', () => {
      const message = createMockMessage('http://example.com');
      expect(StringUtil.isGibberish(message)).toBe(true);
    });

    test('should return true if message mentions users', () => {
      const message: any = createMockMessage('hello');
      message.mentions.users.size = 1;
      expect(StringUtil.isGibberish(message)).toBe(true);
    });

    test('should return true if message mentions channels', () => {
      const message: any = createMockMessage('hello');
      message.mentions.channels.size = 1;
      expect(StringUtil.isGibberish(message)).toBe(true);
    });

    test('should return true if message mentions roles', () => {
      const message: any = createMockMessage('hello');
      message.mentions.roles.size = 1;
      expect(StringUtil.isGibberish(message)).toBe(true);
    });

    test('should return true if message mentions everyone', () => {
      const message = createMockMessage('hello');
      message.mentions.everyone = true;
      expect(StringUtil.isGibberish(message)).toBe(true);
    });

    test('should return true if message has reactions', () => {
      const message: any = createMockMessage('hello');
      message.reactions.cache.size = 1;
      expect(StringUtil.isGibberish(message)).toBe(true);
    });

    test('should return true if message has stickers', () => {
      const message: any = createMockMessage('hello');
      message.stickers.size = 1;
      expect(StringUtil.isGibberish(message)).toBe(true);
    });

    test('should return false if message is not gibberish', () => {
      const message: any = createMockMessage('hello world');
      expect(StringUtil.isGibberish(message)).toBe(false);
    });
  });
});
