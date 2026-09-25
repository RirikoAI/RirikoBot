import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  FlagSetting,
  GUILD_CONFIG_MODULES,
  GuildConfigSchemas,
  IntSetting,
  isGuildConfigModule,
  JsonSetting,
  OptionalSnowflakeSetting,
  PrefixSchema,
  SnowflakeListSetting,
  TimezoneSchema,
} from './guild-config.js';
import { DEFAULT_ESCALATION_STEPS, EscalationPolicySchema } from './moderation-settings.js';

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

describe('setting types', () => {
  it('FlagSetting accepts booleans and CLI words', () => {
    expect(FlagSetting.parse(true)).toBe(true);
    expect(FlagSetting.parse(' Off ')).toBe(false);
    expect(FlagSetting.parse('yes')).toBe(true);
    expect(FlagSetting.parse('0')).toBe(false);
    expect(FlagSetting.safeParse('maybe').error?.issues[0]?.message).toBe('Use true or false.');
  });

  it('IntSetting converts numeric strings and enforces the range', () => {
    const limit = IntSetting(1, 50);
    expect(limit.parse(' 8 ')).toBe(8);
    expect(limit.parse(50)).toBe(50);
    for (const value of ['0', '51', '2.5', 'abc', '']) {
      expect(limit.safeParse(value).error?.issues[0]?.message).toBe(
        'Enter a whole number from 1 to 50.',
      );
    }
  });

  it('OptionalSnowflakeSetting clears on empty input or none', () => {
    expect(OptionalSnowflakeSetting.parse('')).toBeNull();
    expect(OptionalSnowflakeSetting.parse('none')).toBeNull();
    expect(OptionalSnowflakeSetting.parse(null)).toBeNull();
    expect(OptionalSnowflakeSetting.parse(' 123456789012345678 ')).toBe('123456789012345678');
    expect(OptionalSnowflakeSetting.safeParse('#general').success).toBe(false);
  });

  it('SnowflakeListSetting splits CLI input, removes duplicates and caps the length', () => {
    const list = SnowflakeListSetting(2);
    expect(list.parse('123456789012345678, 223456789012345678 123456789012345678')).toEqual([
      '123456789012345678',
      '223456789012345678',
    ]);
    expect(list.parse([])).toEqual([]);
    expect(list.parse('')).toEqual([]);
    expect(list.safeParse(['123456789012345678', '1']).success).toBe(false);
    expect(
      list.safeParse(['123456789012345678', '223456789012345678', '323456789012345678']).error
        ?.issues[0]?.message,
    ).toBe('Choose at most 2.');
  });

  it('JsonSetting parses JSON text and leaves typed values alone', () => {
    const rows = JsonSetting(z.array(z.number()));
    expect(rows.parse('[1,2]')).toEqual([1, 2]);
    expect(rows.parse([3])).toEqual([3]);
    expect(rows.safeParse('[1,').success).toBe(false);
  });
});

describe('EscalationPolicySchema', () => {
  it('sorts steps by threshold', () => {
    expect(
      EscalationPolicySchema.parse([
        { warnThreshold: 5, action: 'BAN' },
        { warnThreshold: 2, action: 'TIMEOUT', durationSeconds: 600 },
      ]),
    ).toEqual([
      { warnThreshold: 2, action: 'TIMEOUT', durationSeconds: 600 },
      { warnThreshold: 5, action: 'BAN' },
    ]);
    expect(EscalationPolicySchema.parse([])).toEqual([]);
    expect(EscalationPolicySchema.parse(DEFAULT_ESCALATION_STEPS)).toEqual(
      DEFAULT_ESCALATION_STEPS,
    );
  });

  it.each([
    [[{ warnThreshold: 3, action: 'TIMEOUT' }], 'Timeout steps need a length.'],
    [
      [{ warnThreshold: 3, action: 'TIMEOUT', durationSeconds: null }],
      'Timeout steps need a length.',
    ],
    [
      [{ warnThreshold: 3, action: 'BAN', durationSeconds: 60 }],
      'Only timeout steps have a length.',
    ],
    [[{ warnThreshold: 3, action: 'TIMEOUT', durationSeconds: 30 }], 'at least 1 minute'],
    [[{ warnThreshold: 3, action: 'TIMEOUT', durationSeconds: 2_419_201 }], 'at most 28 days'],
    [[{ warnThreshold: 0, action: 'WARN' }], 'at least 1'],
    [[{ warnThreshold: 3, action: 'MUTE' }], 'Choose warn, timeout, kick or ban.'],
    [
      [
        { warnThreshold: 3, action: 'WARN' },
        { warnThreshold: 3, action: 'BAN' },
      ],
      'Two steps start at 3 warning points',
    ],
  ])('rejects %j', (steps, message) => {
    const result = EscalationPolicySchema.safeParse(steps);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(message);
  });

  it('caps the number of steps', () => {
    const steps = Array.from({ length: 21 }, (_, index) => ({
      warnThreshold: index + 1,
      action: 'WARN',
    }));
    expect(EscalationPolicySchema.safeParse(steps).success).toBe(false);
  });
});

describe('GuildConfigSchemas', () => {
  it('lists the modules with only keys the bot reads', () => {
    expect(GUILD_CONFIG_MODULES).toEqual(['general', 'moderation', 'automod', 'logging']);
    expect(Object.keys(GuildConfigSchemas.general.shape)).toEqual(['prefix', 'timezone']);
    expect(Object.keys(GuildConfigSchemas.logging.shape)).toEqual(['logChannelId']);
    expect(Object.keys(GuildConfigSchemas.moderation.shape)).toEqual(['escalationSteps']);
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
