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
    expect(list.parse('[]')).toEqual([]);
    expect(list.parse('["123456789012345678"]')).toEqual(['123456789012345678']);
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
  describe('tickets (TASK-1982)', () => {
    const roles = (count: number) =>
      Array.from({ length: count }, (_, i) => `30000000000000${String(i).padStart(4, '0')}`);
    const valid = {
      enabled: true,
      categoryId: '100000000000000001',
      staffRoleIds: roles(2),
      transcriptChannelId: '100000000000000002',
      maxOpenPerUser: 3,
      welcomeMessage: 'Staff will be with you soon.',
    };

    it('accepts typed values and plain CLI strings', () => {
      expect(GuildConfigSchemas.tickets.safeParse(valid).data).toEqual(valid);
      const fromCli = GuildConfigSchemas.tickets.safeParse({
        enabled: 'on',
        categoryId: 'none',
        staffRoleIds: roles(2).join(','),
        transcriptChannelId: '',
        maxOpenPerUser: '5',
        welcomeMessage: '  Hello  ',
      });
      expect(fromCli.data).toEqual({
        enabled: true,
        categoryId: null,
        staffRoleIds: roles(2),
        transcriptChannelId: null,
        maxOpenPerUser: 5,
        welcomeMessage: 'Hello',
      });
    });

    it('accepts the limits: 1 and 5 open tickets, 10 staff roles, 1000 characters', () => {
      const edge = {
        ...valid,
        maxOpenPerUser: 1,
        staffRoleIds: roles(10),
        welcomeMessage: 'a'.repeat(1000),
      };
      expect(GuildConfigSchemas.tickets.safeParse(edge).success).toBe(true);
      expect(GuildConfigSchemas.tickets.safeParse({ ...edge, maxOpenPerUser: 5 }).success).toBe(
        true,
      );
    });

    it('rejects 0 and 6 open tickets per member', () => {
      for (const maxOpenPerUser of [0, 6]) {
        const result = GuildConfigSchemas.tickets.safeParse({ ...valid, maxOpenPerUser });
        expect(result.error?.issues[0]?.message).toBe('Enter a whole number from 1 to 5.');
      }
    });

    it('rejects 11 staff roles', () => {
      const result = GuildConfigSchemas.tickets.safeParse({ ...valid, staffRoleIds: roles(11) });
      expect(result.error?.issues[0]?.message).toBe('Choose at most 10.');
    });

    it('rejects a 1001-character welcome message and unknown keys', () => {
      const result = GuildConfigSchemas.tickets.safeParse({
        ...valid,
        welcomeMessage: 'a'.repeat(1001),
      });
      expect(result.error?.issues[0]?.message).toBe('Use at most 1000 characters.');
      expect(GuildConfigSchemas.tickets.safeParse({ ...valid, nextNumber: 9 }).success).toBe(false);
    });

    it('describes every field for a server admin', () => {
      for (const field of Object.values(GuildConfigSchemas.tickets.shape)) {
        expect(field.description?.length).toBeGreaterThan(20);
      }
    });
  });

  describe('eventlogs (TASK-1992)', () => {
    const channels = (count: number) =>
      Array.from({ length: count }, (_, i) => `40000000000000${String(i).padStart(4, '0')}`);
    const valid = {
      messageChannelId: '100000000000000001',
      memberChannelId: '100000000000000002',
      serverChannelId: '100000000000000003',
      voiceChannelId: '100000000000000004',
      ignoredChannelIds: channels(2),
      ignoreBots: false,
    };

    it('accepts typed values and plain CLI strings', () => {
      expect(GuildConfigSchemas.eventlogs.safeParse(valid).data).toEqual(valid);
      const fromCli = GuildConfigSchemas.eventlogs.safeParse({
        messageChannelId: 'none',
        memberChannelId: '',
        serverChannelId: '100000000000000003',
        voiceChannelId: 'none',
        ignoredChannelIds: channels(2).join(','),
        ignoreBots: 'off',
      });
      expect(fromCli.data).toEqual({
        messageChannelId: null,
        memberChannelId: null,
        serverChannelId: '100000000000000003',
        voiceChannelId: null,
        ignoredChannelIds: channels(2),
        ignoreBots: false,
      });
    });

    it('says ignoreBots covers messages and voice only, and member events for bots are logged', () => {
      const text = GuildConfigSchemas.eventlogs.shape.ignoreBots.description;
      expect(text).toContain('messages and voice');
      expect(text).toContain('member events for bots');
      expect(text).toContain('always logged');
    });

    it('accepts 25 ignored channels and rejects 26', () => {
      expect(
        GuildConfigSchemas.eventlogs.safeParse({ ...valid, ignoredChannelIds: channels(25) })
          .success,
      ).toBe(true);
      const result = GuildConfigSchemas.eventlogs.safeParse({
        ...valid,
        ignoredChannelIds: channels(26),
      });
      expect(result.error?.issues[0]?.message).toBe('Choose at most 25.');
    });

    it('rejects a bad channel ID and unknown keys', () => {
      const result = GuildConfigSchemas.eventlogs.safeParse({ ...valid, voiceChannelId: 'abc' });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['voiceChannelId']);
      expect(GuildConfigSchemas.eventlogs.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    });

    it('describes every field for a server admin', () => {
      for (const field of Object.values(GuildConfigSchemas.eventlogs.shape)) {
        expect(field.description?.length).toBeGreaterThan(20);
      }
    });
  });

  describe('levelroles (TASK-2002)', () => {
    const REGULAR = '100000000000000001';
    const VETERAN = '100000000000000002';

    it('sorts the rewards and accepts a flag word from the CLI', () => {
      const result = GuildConfigSchemas.levelroles.safeParse({
        rewards: [
          { level: 20, roleId: VETERAN },
          { level: 5, roleId: REGULAR },
        ],
        keepPreviousRoles: false,
      });
      expect(result.data).toEqual({
        rewards: [
          { level: 5, roleId: REGULAR },
          { level: 20, roleId: VETERAN },
        ],
        keepPreviousRoles: false,
      });
      const fromCli = GuildConfigSchemas.levelroles.safeParse({
        rewards: JSON.stringify([{ level: 5, roleId: REGULAR }]),
        keepPreviousRoles: 'off',
      });
      expect(fromCli.data).toEqual({
        rewards: [{ level: 5, roleId: REGULAR }],
        keepPreviousRoles: false,
      });
    });

    it('reports a bad row with its path, and rejects unknown keys', () => {
      const bad = GuildConfigSchemas.levelroles.safeParse({
        rewards: [{ level: 0, roleId: REGULAR }],
        keepPreviousRoles: true,
      });
      expect(bad.error?.issues[0]?.path).toEqual(['rewards', 0, 'level']);
      expect(
        GuildConfigSchemas.levelroles.safeParse({ rewards: [], keepPreviousRoles: 'maybe' })
          .success,
      ).toBe(false);
      expect(
        GuildConfigSchemas.levelroles.safeParse({ rewards: [], keepPreviousRoles: true, extra: 1 })
          .success,
      ).toBe(false);
    });

    it('describes every field for a server admin', () => {
      for (const field of Object.values(GuildConfigSchemas.levelroles.shape)) {
        expect(field.description?.length).toBeGreaterThan(20);
      }
    });
  });

  it('lists the modules with only keys the bot reads', () => {
    expect(GUILD_CONFIG_MODULES).toEqual([
      'general',
      'moderation',
      'automod',
      'logging',
      'eventlogs',
      'commands',
      'autoroles',
      'tickets',
      'autovoice',
      'xp',
      'levelroles',
      'games',
      'music',
      'ai',
      'images',
      'freegames',
      'welcome',
      'farewell',
      'tcg',
    ]);
    expect(Object.keys(GuildConfigSchemas.general.shape)).toEqual(['prefix', 'timezone']);
    expect(Object.keys(GuildConfigSchemas.freegames.shape)).toEqual(['channelId', 'pingRoleId']);
    for (const card of ['welcome', 'farewell'] as const) {
      expect(Object.keys(GuildConfigSchemas[card].shape)).toEqual([
        'enabled',
        'channelId',
        'messageTemplate',
        'textColor',
        'backgroundUrl',
        'textMessageEnabled',
        'textMessage',
      ]);
    }
    expect(Object.keys(GuildConfigSchemas.logging.shape)).toEqual(['logChannelId']);
    expect(Object.keys(GuildConfigSchemas.eventlogs.shape)).toEqual([
      'messageChannelId',
      'memberChannelId',
      'serverChannelId',
      'voiceChannelId',
      'ignoredChannelIds',
      'ignoreBots',
    ]);
    expect(Object.keys(GuildConfigSchemas.moderation.shape)).toEqual(['escalationSteps']);
    expect(Object.keys(GuildConfigSchemas.commands.shape)).toEqual(['overrides']);
    expect(Object.keys(GuildConfigSchemas.autoroles.shape)).toEqual([
      'enabled',
      'humanRoleIds',
      'botRoleIds',
      'verificationRoleId',
    ]);
    expect(Object.keys(GuildConfigSchemas.tickets.shape)).toEqual([
      'enabled',
      'categoryId',
      'staffRoleIds',
      'transcriptChannelId',
      'maxOpenPerUser',
      'welcomeMessage',
    ]);
    expect(Object.keys(GuildConfigSchemas.autovoice.shape)).toEqual(['hubs']);
    expect(Object.keys(GuildConfigSchemas.xp.shape)).toEqual([
      'levelUpAnnouncements',
      'levelUpChannelId',
      'xpRatePercent',
      'noXpChannelIds',
      'noXpRoleIds',
      'voiceXpEnabled',
    ]);
    expect(Object.keys(GuildConfigSchemas.levelroles.shape)).toEqual([
      'rewards',
      'keepPreviousRoles',
    ]);
    expect(Object.keys(GuildConfigSchemas.games.shape)).toEqual(['maxWager', 'rules']);
    expect(isGuildConfigModule('general')).toBe(true);
    expect(isGuildConfigModule('toString')).toBe(false);
  });

  it('reads the card text message from strings, trimmed, and rejects a long one (TASK-1333)', () => {
    for (const card of ['welcome', 'farewell'] as const) {
      const base = {
        enabled: 'on',
        channelId: '',
        messageTemplate: 'Hi',
        textColor: '#ffffff',
        backgroundUrl: '',
      };
      expect(
        GuildConfigSchemas[card].parse({
          ...base,
          textMessageEnabled: 'yes',
          textMessage: '  Read #rules  ',
        }),
      ).toMatchObject({ textMessageEnabled: true, textMessage: 'Read #rules' });
      expect(
        GuildConfigSchemas[card].safeParse({ ...base, textMessageEnabled: 'off', textMessage: '' })
          .success,
      ).toBe(true);
      const tooLong = GuildConfigSchemas[card].safeParse({
        ...base,
        textMessageEnabled: false,
        textMessage: 'x'.repeat(2001),
      });
      expect(tooLong.success).toBe(false);
    }
  });

  it('reads an optional wager limit and drops game rules that change nothing', () => {
    const parsed = GuildConfigSchemas.games.parse({
      maxWager: ' none ',
      rules:
        '[{"command":"rps"},{"command":"dice","cooldownSeconds":5},{"command":"coinflip","enabled":false}]',
    });
    expect(parsed).toEqual({
      maxWager: null,
      rules: [
        { command: 'coinflip', enabled: false, cooldownSeconds: null },
        { command: 'dice', enabled: true, cooldownSeconds: 5 },
      ],
    });
    expect(GuildConfigSchemas.games.shape.maxWager.parse('250')).toBe(250);
    expect(GuildConfigSchemas.games.shape.maxWager.safeParse('1.5').success).toBe(false);
    expect(
      GuildConfigSchemas.games.shape.rules.safeParse('[{"command":"rps"},{"command":"rps"}]')
        .success,
    ).toBe(false);
  });

  it('reads Waifu TCG drop settings from form and CLI values', () => {
    const parsed = GuildConfigSchemas.tcg.parse({
      dropsEnabled: 'on',
      dropChannelId: '',
      dropMessageThreshold: '25',
      dropStartHour: '20',
      dropEndHour: '4',
      dropClaimTimeoutSeconds: 90,
      dropCooldownMinutes: '0',
      managerRoleId: '123456789012345678',
    });
    expect(parsed).toEqual({
      dropsEnabled: true,
      dropChannelId: null,
      dropMessageThreshold: 25,
      dropStartHour: 20,
      dropEndHour: 4,
      dropClaimTimeoutSeconds: 90,
      dropCooldownMinutes: 0,
      managerRoleId: '123456789012345678',
    });
    const shape = GuildConfigSchemas.tcg.shape;
    expect(shape.dropMessageThreshold.safeParse(4).success).toBe(false);
    expect(shape.dropMessageThreshold.safeParse(501).success).toBe(false);
    expect(shape.dropEndHour.safeParse(24).success).toBe(false);
    expect(shape.dropClaimTimeoutSeconds.safeParse(10).success).toBe(false);
    expect(shape.managerRoleId.safeParse('abc').success).toBe(false);
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
