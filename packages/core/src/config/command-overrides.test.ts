import { describe, expect, it } from 'vitest';
import {
  CommandOverridesSchema,
  MAX_COMMAND_OVERRIDES,
  resolveCommandOverride,
  type CommandOverride,
} from './command-overrides.js';
import { GuildConfigSchemas } from './guild-config.js';

const CHANNEL = '100000000000000001';
const OTHER_CHANNEL = '100000000000000002';
const ROLE = '200000000000000001';
const OTHER_ROLE = '200000000000000002';

function row(overrides: Partial<CommandOverride> & { command: string }): CommandOverride {
  return {
    channelId: null,
    enabled: true,
    allowedRoleIds: [],
    blockedRoleIds: [],
    cooldownSeconds: null,
    ...overrides,
  };
}

describe('CommandOverridesSchema', () => {
  it('fills defaults, lower-cases names, removes duplicate roles and sorts server rows first', () => {
    const parsed = CommandOverridesSchema.parse([
      { command: 'RPS', channelId: CHANNEL, enabled: false },
      { command: 'rps', allowedRoleIds: [ROLE, ROLE] },
      { command: 'play', cooldownSeconds: 0 },
    ]);
    expect(parsed).toEqual([
      row({ command: 'play', cooldownSeconds: 0 }),
      row({ command: 'rps', allowedRoleIds: [ROLE] }),
      row({ command: 'rps', channelId: CHANNEL, enabled: false }),
    ]);
  });

  it('drops rows that change nothing', () => {
    expect(CommandOverridesSchema.parse([{ command: 'rps', channelId: CHANNEL }])).toEqual([]);
  });

  it('rejects exempt commands, bad names and duplicate rows', () => {
    const exempt = CommandOverridesSchema.safeParse([{ command: 'help', enabled: false }]);
    expect(exempt.success).toBe(false);
    expect(exempt.error?.issues[0]).toMatchObject({
      path: [0, 'command'],
      message: '`help` is always available and cannot be overridden.',
    });

    expect(CommandOverridesSchema.safeParse([{ command: 'two words' }]).success).toBe(false);

    const duplicate = CommandOverridesSchema.safeParse([
      { command: 'rps', channelId: CHANNEL, enabled: false },
      { command: 'rps', channelId: CHANNEL, cooldownSeconds: 5 },
    ]);
    expect(duplicate.error?.issues[0]?.message).toBe(
      '`rps` has two overrides for the same channel.',
    );
  });

  it('rejects a role that is both allowed and blocked, and cooldowns out of range', () => {
    const both = CommandOverridesSchema.safeParse([
      { command: 'rps', allowedRoleIds: [ROLE], blockedRoleIds: [ROLE] },
    ]);
    expect(both.error?.issues[0]).toMatchObject({
      path: [0, 'blockedRoleIds'],
      message: 'A role cannot be both allowed and blocked.',
    });
    expect(
      CommandOverridesSchema.safeParse([{ command: 'rps', cooldownSeconds: -1 }]).success,
    ).toBe(false);
    expect(
      CommandOverridesSchema.safeParse([{ command: 'rps', cooldownSeconds: 3601 }]).success,
    ).toBe(false);
    expect(
      CommandOverridesSchema.safeParse([{ command: 'rps', cooldownSeconds: 1.5 }]).success,
    ).toBe(false);
  });

  it('caps the number of overrides and roles', () => {
    const tooMany = Array.from({ length: MAX_COMMAND_OVERRIDES + 1 }, (_, index) => ({
      command: `cmd${index}`,
      enabled: false,
    }));
    expect(CommandOverridesSchema.safeParse(tooMany).success).toBe(false);

    const roles = Array.from({ length: 26 }, (_, index) => `3000000000000000${10 + index}`);
    expect(
      CommandOverridesSchema.safeParse([{ command: 'rps', allowedRoleIds: roles }]).success,
    ).toBe(false);
  });

  it('accepts JSON text from the CLI through the commands module', () => {
    const parsed = GuildConfigSchemas.commands.parse({
      overrides: `[{"command":"rps","channelId":null,"enabled":false}]`,
    });
    expect(parsed.overrides).toEqual([row({ command: 'rps', enabled: false })]);
  });
});

describe('resolveCommandOverride', () => {
  const overrides = [
    row({ command: 'rps', enabled: false }),
    row({ command: 'rps', channelId: CHANNEL, blockedRoleIds: [OTHER_ROLE] }),
    row({ command: 'play', channelId: CHANNEL, cooldownSeconds: 10 }),
  ];

  it('prefers the channel row over the server row, without merging them', () => {
    expect(resolveCommandOverride(overrides, 'rps', CHANNEL)).toEqual(overrides[1]);
  });

  it('falls back to the server row in other channels', () => {
    expect(resolveCommandOverride(overrides, 'rps', OTHER_CHANNEL)).toEqual(overrides[0]);
    expect(resolveCommandOverride(overrides, 'rps', null)).toEqual(overrides[0]);
  });

  it('returns null when nothing applies', () => {
    expect(resolveCommandOverride(overrides, 'play', OTHER_CHANNEL)).toBeNull();
    expect(resolveCommandOverride(overrides, 'ping', CHANNEL)).toBeNull();
  });
});
