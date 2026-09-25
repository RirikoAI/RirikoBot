import { describe, expect, it } from 'vitest';
import {
  GUILD_CONFIG_MODULES,
  GuildConfigSchemas,
  isGuildConfigModule,
  PrefixSchema,
  TimezoneSchema,
} from './guild-config.js';

describe('PrefixSchema', () => {
  it('accepts short prefixes and trims surrounding whitespace', () => {
    expect(PrefixSchema.parse('!')).toBe('!');
    expect(PrefixSchema.parse(' ?? ')).toBe('??');
    expect(PrefixSchema.parse('r!')).toBe('r!');
  });

  it.each([
    ['   ', 'cannot be empty'],
    ['!help!', 'between 1 and 5'],
    ['! a', 'spaces or tabs'],
    ['`', 'backtick'],
    ['@', '`@` or `#`'],
    ['#r', '`@` or `#`'],
  ])('rejects %j', (value, message) => {
    const result = PrefixSchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(message);
  });
});

describe('TimezoneSchema', () => {
  it('canonicalises IANA names', () => {
    expect(TimezoneSchema.parse('asia/kuala lumpur')).toBe('Asia/Kuala_Lumpur');
    expect(TimezoneSchema.parse('utc')).toBe('UTC');
  });

  it('rejects offsets and unknown zones', () => {
    expect(TimezoneSchema.safeParse('GMT+8').success).toBe(false);
    expect(TimezoneSchema.safeParse('Mars/Olympus').success).toBe(false);
  });
});

describe('GuildConfigSchemas', () => {
  it('lists the general module with only keys the bot reads', () => {
    expect(GUILD_CONFIG_MODULES).toEqual(['general']);
    expect(Object.keys(GuildConfigSchemas.general.shape)).toEqual(['prefix', 'timezone']);
    expect(isGuildConfigModule('general')).toBe(true);
    expect(isGuildConfigModule('toString')).toBe(false);
  });

  it('rejects unknown keys', () => {
    const result = GuildConfigSchemas.general.safeParse({
      prefix: '!',
      timezone: 'UTC',
      locale: 'en-US',
    });
    expect(result.success).toBe(false);
  });
});
