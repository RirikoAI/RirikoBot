import { describe, expect, it, vi } from 'vitest';
import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import type { CommandContext } from '@ririko/discord';
import { GuildConfigValidationError } from '@ririko/services';
import type { BotServices } from '../../../services.js';
import {
  canManageServer,
  describeValidationError,
  parseToggle,
  saveGuildConfig,
} from '../guild-config-command.js';

const GUILD_ID = '100000000000000001';
const USER_ID = '300000000000000001';

const memberWith = (...flags: bigint[]) =>
  ({ permissions: { has: (flag: bigint) => flags.includes(flag) } }) as unknown as GuildMember;

describe('canManageServer', () => {
  it('allows Administrator and Manage Server', () => {
    expect(canManageServer(memberWith(PermissionFlagsBits.Administrator))).toBe(true);
    expect(canManageServer(memberWith(PermissionFlagsBits.ManageGuild))).toBe(true);
  });

  it('refuses other permissions, no permissions and no member', () => {
    expect(canManageServer(memberWith(PermissionFlagsBits.ManageRoles))).toBe(false);
    expect(canManageServer(memberWith())).toBe(false);
    expect(canManageServer(null)).toBe(false);
  });
});

describe('parseToggle', () => {
  it.each(['on', 'ON', 'true', 'True', 'yes', 'Yes', 'enable', 'ENABLE', ' on '])(
    'reads %j as true',
    (text) => {
      expect(parseToggle(text)).toBe(true);
    },
  );

  it.each(['off', 'OFF', 'false', 'False', 'no', 'No', 'disable', 'DISABLE', ' off '])(
    'reads %j as false',
    (text) => {
      expect(parseToggle(text)).toBe(false);
    },
  );

  it.each(['maybe', '', '   ', '1', 'onn', null, undefined])('returns null for %j', (text) => {
    expect(parseToggle(text)).toBeNull();
  });
});

describe('describeValidationError', () => {
  it('joins the messages and drops the row numbers', () => {
    const error = new GuildConfigValidationError({
      rewards: ['Row 2: This level already has a reward.'],
      keepPreviousRoles: ['Choose on or off.'],
    });
    expect(describeValidationError(error)).toBe(
      'This level already has a reward. Choose on or off.',
    );
  });
});

describe('saveGuildConfig', () => {
  function setup(update: ReturnType<typeof vi.fn>) {
    const reply = vi.fn().mockResolvedValue(undefined);
    const ctx = { guildId: GUILD_ID, user: { id: USER_ID }, reply } as unknown as CommandContext;
    const services = { guildConfigService: { update } } as unknown as BotServices;
    return { ctx, services, reply };
  }

  it('saves through the service as the Discord user and returns the saved values', async () => {
    const values = { rewards: [], keepPreviousRoles: false };
    const update = vi.fn().mockResolvedValue({ values, changes: [] });
    const { ctx, services, reply } = setup(update);

    const result = await saveGuildConfig(ctx, services, 'levelroles', { keepPreviousRoles: false });

    expect(result).toBe(values);
    expect(update).toHaveBeenCalledWith(
      GUILD_ID,
      'levelroles',
      { keepPreviousRoles: false },
      { userId: USER_ID, source: 'discord' },
    );
    expect(reply).not.toHaveBeenCalled();
  });

  it('replies privately with the validation message and returns null', async () => {
    const update = vi
      .fn()
      .mockRejectedValue(new GuildConfigValidationError({ channelId: ['Choose a channel.'] }));
    const { ctx, services, reply } = setup(update);

    const result = await saveGuildConfig(ctx, services, 'starboard', { channelId: 'bad' });

    expect(result).toBeNull();
    expect(reply).toHaveBeenCalledWith({
      content: 'Choose a channel.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  });

  it('rethrows any other error without replying', async () => {
    const update = vi.fn().mockRejectedValue(new Error('database down'));
    const { ctx, services, reply } = setup(update);

    await expect(saveGuildConfig(ctx, services, 'starboard', {})).rejects.toThrow('database down');
    expect(reply).not.toHaveBeenCalled();
  });
});
