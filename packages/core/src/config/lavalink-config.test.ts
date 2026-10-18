import { describe, expect, it } from 'vitest';
import { parseConfig } from './loader.js';
import { AppConfigSchema } from './schema.js';

const BASE = { DISCORD_TOKEN: 'token', DISCORD_CLIENT_ID: '100000000000000001' };

describe('Lavalink settings', () => {
  it('leaves them unset by default and counts empty values as unset', () => {
    const config = parseConfig(AppConfigSchema, {
      ...BASE,
      LAVALINK_HOST: '',
      LAVALINK_PORT: '',
      LAVALINK_PASSWORD: '',
      LAVALINK_SECURE: '',
    });
    expect(config.LAVALINK_HOST).toBeUndefined();
    expect(config.LAVALINK_PORT).toBeUndefined();
    expect(config.LAVALINK_PASSWORD).toBeUndefined();
    expect(config.LAVALINK_SECURE).toBeUndefined();
  });

  it('accepts an address, a port, a password and a connection type', () => {
    const config = parseConfig(AppConfigSchema, {
      ...BASE,
      LAVALINK_HOST: '192.0.2.10',
      LAVALINK_PORT: '2333',
      LAVALINK_PASSWORD: 'secret',
      LAVALINK_SECURE: 'true',
    });
    expect(config.LAVALINK_HOST).toBe('192.0.2.10');
    expect(config.LAVALINK_PORT).toBe(2333);
    expect(config.LAVALINK_PASSWORD).toBe('secret');
    expect(config.LAVALINK_SECURE).toBe('true');
  });

  it.each(['http://192.0.2.10', '192.0.2.10/path', 'with space'])(
    'rejects the address %j',
    (value) => {
      expect(() => parseConfig(AppConfigSchema, { ...BASE, LAVALINK_HOST: value })).toThrow(
        /LAVALINK_HOST/,
      );
    },
  );

  it.each(['0', '65536', 'abc', '2333.5'])('rejects the port %j', (value) => {
    expect(() => parseConfig(AppConfigSchema, { ...BASE, LAVALINK_PORT: value })).toThrow(
      /LAVALINK_PORT/,
    );
  });

  it('accepts only true or false as the connection type', () => {
    expect(() => parseConfig(AppConfigSchema, { ...BASE, LAVALINK_SECURE: 'yes' })).toThrow(
      /LAVALINK_SECURE/,
    );
  });
});
