import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { GuildConfigSchemas, type LevelRoleReward } from '@ririko/core';
import { CommandCategory } from '@ririko/discord';
import { GuildConfigValidationError, fieldErrorsOf } from '@ririko/services';
import type { BotServices } from '../../../services.js';
import { createLevelRolesCommand } from '../level-roles.command.js';

const GUILD_ID = '100000000000000001';
const USER_ID = '300000000000000001';
const REGULAR = '500000000000000001';
const VETERAN = '500000000000000002';
const LEGEND = '500000000000000003';
const BOT_ROLE = '500000000000000004';
const DELETED = '500000000000000099';

interface CtxOptions {
  source?: 'slash' | 'prefix';
  args?: string[];
  action?: string | null;
  level?: number | null;
  slashRole?: { id: string } | null;
  enabled?: boolean | null;
  perms?: bigint[];
  member?: unknown;
  guild?: unknown;
}

const role = (id: string, name: string) => ({ id, name });

describe('/levelroles command (TASK-2005)', () => {
  let stored: { rewards: LevelRoleReward[]; keepPreviousRoles: boolean };
  let update: ReturnType<typeof vi.fn>;
  let isValidAssignableRole: ReturnType<typeof vi.fn>;
  let hasManageRolesPermission: ReturnType<typeof vi.fn>;
  let syncGuild: ReturnType<typeof vi.fn>;
  let services: BotServices;
  let roleCache: Map<string, { id: string; name: string }> & {
    find?: (fn: (r: { id: string; name: string }) => boolean) => unknown;
  };

  const command = () => createLevelRolesCommand(services);

  function makeCtx(opts: CtxOptions = {}) {
    const source = opts.source ?? 'slash';
    const perms = opts.perms ?? [];
    const member =
      opts.member === undefined
        ? { id: USER_ID, permissions: { has: (flag: bigint) => perms.includes(flag) } }
        : opts.member;
    const reply = vi.fn().mockResolvedValue(undefined);
    const followUp = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue(undefined);
    const ctx: any = {
      source,
      guildId: GUILD_ID,
      guild: opts.guild === undefined ? { id: GUILD_ID, roles: { cache: roleCache } } : opts.guild,
      member,
      user: { id: USER_ID },
      raw: { options: { getRole: vi.fn().mockReturnValue(opts.slashRole ?? null) } },
      options: {
        getString: vi.fn((name: string) => (name === 'action' ? (opts.action ?? null) : null)),
        getInteger: vi.fn(() => opts.level ?? null),
        getBoolean: vi.fn(() => opts.enabled ?? null),
        getRawArgs: vi.fn().mockReturnValue(opts.args ?? []),
      },
      reply,
      followUp,
      send,
    };
    return { ctx, reply, followUp, send };
  }

  const text = (reply: ReturnType<typeof vi.fn>, call = 0) => reply.mock.calls[call]?.[0].content;

  beforeEach(() => {
    stored = { rewards: [], keepPreviousRoles: true };
    roleCache = new Map([
      [REGULAR, role(REGULAR, 'Regular')],
      [VETERAN, role(VETERAN, 'Super Veteran')],
      [LEGEND, role(LEGEND, 'Legend')],
      [BOT_ROLE, role(BOT_ROLE, 'Bots')],
    ]) as typeof roleCache;
    roleCache.find = (fn) => [...roleCache.values()].find(fn);

    // Same checks as the real service: the module schema validates, and the change is "saved".
    update = vi.fn(async (_guildId: string, _module: string, patch: Record<string, unknown>) => {
      const parsed = GuildConfigSchemas.levelroles.safeParse({ ...stored, ...patch });
      if (!parsed.success) throw new GuildConfigValidationError(fieldErrorsOf(parsed.error.issues));
      stored = parsed.data as typeof stored;
      return { values: stored, changes: [] };
    });
    isValidAssignableRole = vi.fn().mockReturnValue({ valid: true });
    hasManageRolesPermission = vi.fn().mockReturnValue(true);
    syncGuild = vi.fn().mockResolvedValue({ busy: false, checked: 12, added: 7, removed: 2 });
    services = {
      guildConfigService: { get: vi.fn(async () => stored), update },
      autoRoleService: { isValidAssignableRole, hasManageRolesPermission },
      levelRoleService: { syncGuild },
    } as unknown as BotServices;
  });

  describe('metadata', () => {
    it('is a server-only utility command with the action, level and role options', () => {
      const { metadata } = command();
      expect(metadata.name).toBe('levelroles');
      expect(metadata.category).toBe(CommandCategory.UTILITY);
      expect(metadata.registrationScope).toBe('guild');
      expect(metadata.isGuildOnly).toBe(true);
      expect(metadata.options?.map((o) => [o.name, o.type])).toEqual([
        ['action', 'STRING'],
        ['level', 'INTEGER'],
        ['role', 'ROLE'],
        ['enabled', 'BOOLEAN'],
      ]);
      expect(metadata.options?.[0]?.choices?.map((c) => c.value)).toEqual([
        'list',
        'add',
        'remove',
        'sync',
        'stack',
      ]);
    });
  });

  describe('basics', () => {
    it('refuses outside a server', async () => {
      const { ctx, reply } = makeCtx({ guild: null });
      ctx.guildId = null;
      await command().execute(ctx);
      expect(text(reply)).toContain('only be used within a server');
    });

    it('shows the usage for an unknown action', async () => {
      const { ctx, reply } = makeCtx({ source: 'prefix', args: ['explode'] });
      await command().execute(ctx);
      expect(text(reply)).toContain('Usage: `/levelroles');
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('is open to everyone and defaults to list for a slash command without an action', async () => {
      stored.rewards = [{ level: 5, roleId: REGULAR }];
      const { ctx, reply } = makeCtx();
      await command().execute(ctx);
      expect(reply).toHaveBeenCalledTimes(1);
      const payload = reply.mock.calls[0]?.[0];
      expect(payload.embeds[0].data.description).toBe(`Level **5**: <@&${REGULAR}>`);
    });

    it('defaults to list for a bare prefix command and never pings', async () => {
      stored.rewards = [{ level: 5, roleId: REGULAR }];
      const { ctx, reply } = makeCtx({ source: 'prefix' });
      await command().execute(ctx);
      expect(reply.mock.calls[0]?.[0].allowedMentions).toEqual({ parse: [] });
    });

    it('lists every reward with its level and role, and says lower roles are kept', async () => {
      stored.rewards = [
        { level: 5, roleId: REGULAR },
        { level: 20, roleId: VETERAN },
      ];
      const { ctx, reply } = makeCtx({ action: 'list' });
      await command().execute(ctx);
      const embed = reply.mock.calls[0]?.[0].embeds[0].data;
      expect(embed.description).toBe(`Level **5**: <@&${REGULAR}>\nLevel **20**: <@&${VETERAN}>`);
      expect(embed.footer.text).toBe('Members keep the roles of lower levels.');
    });

    it('says when only the highest role is kept and marks a deleted role', async () => {
      stored = { rewards: [{ level: 5, roleId: DELETED }], keepPreviousRoles: false };
      const { ctx, reply } = makeCtx({ source: 'prefix', args: ['list'] });
      await command().execute(ctx);
      const embed = reply.mock.calls[0]?.[0].embeds[0].data;
      expect(embed.description).toContain('(this role was deleted)');
      expect(embed.footer.text).toBe(
        'Members keep only the role of the highest level they reached.',
      );
    });

    it('explains how to add a reward when there are none', async () => {
      const { ctx, reply } = makeCtx({ action: 'list' });
      await command().execute(ctx);
      expect(text(reply)).toContain('no level role rewards yet');
      expect(text(reply)).toContain('/levelroles action:add');
    });
  });

  describe('permissions', () => {
    it.each([['add'], ['remove'], ['sync'], ['stack']])(
      'refuses %s without a staff permission',
      async (a) => {
        const { ctx, reply } = makeCtx({ source: 'prefix', args: [a, '5', REGULAR] });
        await command().execute(ctx);
        expect(text(reply)).toContain('Manage Roles, Manage Server or Administrator');
        expect(update).not.toHaveBeenCalled();
        expect(syncGuild).not.toHaveBeenCalled();
      },
    );

    it('refuses when the member cannot be read', async () => {
      const { ctx, reply } = makeCtx({ action: 'remove', level: 5, member: null });
      await command().execute(ctx);
      expect(text(reply)).toContain('Manage Roles, Manage Server or Administrator');
    });

    it.each([
      ['Administrator', PermissionFlagsBits.Administrator],
      ['Manage Roles', PermissionFlagsBits.ManageRoles],
      ['Manage Server', PermissionFlagsBits.ManageGuild],
    ])('lets a member with %s add a reward', async (_name, perm) => {
      const { ctx, reply } = makeCtx({
        action: 'add',
        level: 5,
        slashRole: { id: REGULAR },
        perms: [perm],
      });
      await command().execute(ctx);
      expect(text(reply)).toContain('will get');
      expect(stored.rewards).toEqual([{ level: 5, roleId: REGULAR }]);
    });
  });

  describe('add', () => {
    const staff = [PermissionFlagsBits.ManageRoles];

    it('saves through GuildConfigService with the member as the audited actor (slash)', async () => {
      const { ctx, reply } = makeCtx({
        action: 'add',
        level: 5,
        slashRole: { id: REGULAR },
        perms: staff,
      });
      await command().execute(ctx);
      expect(update).toHaveBeenCalledWith(
        GUILD_ID,
        'levelroles',
        { rewards: [{ level: 5, roleId: REGULAR }] },
        { userId: USER_ID, source: 'discord' },
      );
      expect(isValidAssignableRole).toHaveBeenCalledWith(expect.anything(), REGULAR);
      expect(text(reply)).toBe(
        `Members who reach level **5** will get <@&${REGULAR}>. Run \`/levelroles action:sync\` to give it to members who are already there.`,
      );
      expect(reply.mock.calls[0]?.[0].allowedMentions).toEqual({ parse: [] });
    });

    it.each([
      ['a mention', `<@&${REGULAR}>`],
      ['an ID', REGULAR],
      ['a name', 'regular'],
    ])('reads the role as %s with the prefix', async (_label, value) => {
      const { ctx } = makeCtx({ source: 'prefix', args: ['add', '5', value], perms: staff });
      await command().execute(ctx);
      expect(stored.rewards).toEqual([{ level: 5, roleId: REGULAR }]);
    });

    it('reads a role name with spaces with the prefix', async () => {
      const { ctx } = makeCtx({
        source: 'prefix',
        args: ['add', '20', 'Super', 'Veteran'],
        perms: staff,
      });
      await command().execute(ctx);
      expect(stored.rewards).toEqual([{ level: 20, roleId: VETERAN }]);
    });

    it('replaces the role of a level that already has a reward', async () => {
      stored.rewards = [
        { level: 5, roleId: REGULAR },
        { level: 20, roleId: VETERAN },
      ];
      const { ctx, reply } = makeCtx({
        source: 'prefix',
        args: ['add', '5', LEGEND],
        perms: staff,
      });
      await command().execute(ctx);
      expect(stored.rewards).toEqual([
        { level: 5, roleId: LEGEND },
        { level: 20, roleId: VETERAN },
      ]);
      expect(text(reply)).toContain(`It replaces <@&${REGULAR}>.`);
    });

    it('does not claim a replacement when the same role is added again', async () => {
      stored.rewards = [{ level: 5, roleId: REGULAR }];
      const { ctx, reply } = makeCtx({
        source: 'prefix',
        args: ['add', '5', REGULAR],
        perms: staff,
      });
      await command().execute(ctx);
      expect(text(reply)).not.toContain('replaces');
      expect(stored.rewards).toEqual([{ level: 5, roleId: REGULAR }]);
    });

    it('asks for a level and a role when one is missing', async () => {
      for (const args of [['add'], ['add', '5'], ['add', 'five', REGULAR]]) {
        const { ctx, reply } = makeCtx({ source: 'prefix', args, perms: staff });
        await command().execute(ctx);
        expect(text(reply)).toContain('Say which level and which role.');
      }
      expect(update).not.toHaveBeenCalled();
    });

    it('says when the role cannot be found', async () => {
      const { ctx, reply } = makeCtx({
        source: 'prefix',
        args: ['add', '5', 'Nobody'],
        perms: staff,
      });
      await command().execute(ctx);
      expect(text(reply)).toContain('I could not find that role.');
      expect(update).not.toHaveBeenCalled();
    });

    it('refuses a role Ririko cannot give, with the reason', async () => {
      isValidAssignableRole.mockReturnValue({
        valid: false,
        reason: 'Cannot assign a managed integration role.',
      });
      const { ctx, reply } = makeCtx({
        action: 'add',
        level: 5,
        slashRole: { id: BOT_ROLE },
        perms: staff,
      });
      await command().execute(ctx);
      expect(text(reply)).toContain(`I cannot give <@&${BOT_ROLE}> as a reward.`);
      expect(text(reply)).toContain('Cannot assign a managed integration role.');
      expect(update).not.toHaveBeenCalled();
    });

    it('still gives a reason when the check names none', async () => {
      isValidAssignableRole.mockReturnValue({ valid: false });
      const { ctx, reply } = makeCtx({
        action: 'add',
        level: 5,
        slashRole: { id: BOT_ROLE },
        perms: staff,
      });
      await command().execute(ctx);
      expect(text(reply)).toContain('Pick another role.');
    });

    it.each([
      ['0', 'Level must be a whole number from 1 to 1000.'],
      ['1001', 'Level must be a whole number from 1 to 1000.'],
    ])('shows the schema error for level %s without a row number', async (level, message) => {
      const { ctx, reply } = makeCtx({
        source: 'prefix',
        args: ['add', level, REGULAR],
        perms: staff,
      });
      await command().execute(ctx);
      expect(text(reply)).toBe(message);
      expect(stored.rewards).toEqual([]);
    });

    it('shows the schema error when the role is already a reward at another level', async () => {
      stored.rewards = [{ level: 5, roleId: REGULAR }];
      const { ctx, reply } = makeCtx({
        source: 'prefix',
        args: ['add', '10', REGULAR],
        perms: staff,
      });
      await command().execute(ctx);
      expect(text(reply)).toBe('This role is already a reward.');
      expect(stored.rewards).toEqual([{ level: 5, roleId: REGULAR }]);
    });

    it('shows the schema error at the 25 reward limit', async () => {
      stored.rewards = Array.from({ length: 25 }, (_, i) => ({
        level: i + 1,
        roleId: `6000000000000000${String(i + 10)}`,
      }));
      const { ctx, reply } = makeCtx({
        source: 'prefix',
        args: ['add', '100', REGULAR],
        perms: staff,
      });
      await command().execute(ctx);
      expect(text(reply)).toBe('A server can have at most 25 level role rewards.');
      expect(stored.rewards).toHaveLength(25);
    });

    it('warns when Ririko lacks Manage Roles, but still saves', async () => {
      hasManageRolesPermission.mockReturnValue(false);
      const { ctx, reply } = makeCtx({
        action: 'add',
        level: 5,
        slashRole: { id: REGULAR },
        perms: staff,
      });
      await command().execute(ctx);
      expect(text(reply)).toContain('will get');
      expect(text(reply)).toContain('I do not have the **Manage Roles** permission');
      expect(stored.rewards).toHaveLength(1);
    });

    it('does not hide an unexpected error', async () => {
      update.mockRejectedValue(new Error('database is down'));
      const { ctx } = makeCtx({
        action: 'add',
        level: 5,
        slashRole: { id: REGULAR },
        perms: staff,
      });
      await expect(command().execute(ctx)).rejects.toThrow('database is down');
    });
  });

  describe('remove', () => {
    const staff = [PermissionFlagsBits.ManageGuild];

    it('removes the reward of a level through GuildConfigService', async () => {
      stored.rewards = [
        { level: 5, roleId: REGULAR },
        { level: 20, roleId: VETERAN },
      ];
      const { ctx, reply } = makeCtx({ action: 'remove', level: 5, perms: staff });
      await command().execute(ctx);
      expect(update).toHaveBeenCalledWith(
        GUILD_ID,
        'levelroles',
        { rewards: [{ level: 20, roleId: VETERAN }] },
        { userId: USER_ID, source: 'discord' },
      );
      expect(text(reply)).toBe(
        `Level **5** no longer gives <@&${REGULAR}>. Members keep the role they already have.`,
      );
    });

    it('works with the prefix form', async () => {
      stored.rewards = [{ level: 5, roleId: REGULAR }];
      const { ctx } = makeCtx({ source: 'prefix', args: ['remove', '5'], perms: staff });
      await command().execute(ctx);
      expect(stored.rewards).toEqual([]);
    });

    it('says when the level has no reward', async () => {
      const { ctx, reply } = makeCtx({ action: 'remove', level: 7, perms: staff });
      await command().execute(ctx);
      expect(text(reply)).toBe('Level 7 has no reward.');
      expect(update).not.toHaveBeenCalled();
    });

    it('asks for the level when it is missing or not a number', async () => {
      for (const args of [['remove'], ['remove', 'x']]) {
        const { ctx, reply } = makeCtx({ source: 'prefix', args, perms: staff });
        await command().execute(ctx);
        expect(text(reply)).toContain('Say which level to remove.');
      }
    });

    it('shows a schema error of the saved list', async () => {
      stored.rewards = [{ level: 5, roleId: REGULAR }];
      update.mockRejectedValue(
        new GuildConfigValidationError({ rewards: ['Row 1: Choose a role.'] }),
      );
      const { ctx, reply } = makeCtx({ action: 'remove', level: 5, perms: staff });
      await command().execute(ctx);
      expect(text(reply)).toBe('Choose a role.');
    });
  });

  describe('sync', () => {
    const staff = [PermissionFlagsBits.Administrator];

    beforeEach(() => {
      stored.rewards = [{ level: 5, roleId: REGULAR }];
    });

    it('replies that it started, then reports the counts', async () => {
      const order: string[] = [];
      const { ctx, reply, followUp } = makeCtx({ action: 'sync', perms: staff });
      reply.mockImplementation(async () => void order.push('reply'));
      syncGuild.mockImplementation(async () => {
        order.push('sync');
        return { busy: false, checked: 12, added: 7, removed: 2 };
      });
      followUp.mockImplementation(async () => void order.push('followUp'));
      await command().execute(ctx);
      expect(order).toEqual(['reply', 'sync', 'followUp']);
      expect(text(reply)).toContain('Sync started.');
      expect(syncGuild).toHaveBeenCalledWith(expect.objectContaining({ id: GUILD_ID }));
      expect(followUp.mock.calls[0]?.[0].content).toBe(
        'Sync finished. I checked **12** members, added **7** roles and removed **2** roles.',
      );
      expect(followUp.mock.calls[0]?.[0].allowedMentions).toEqual({ parse: [] });
    });

    it('works with the prefix form', async () => {
      const { ctx, followUp } = makeCtx({ source: 'prefix', args: ['sync'], perms: staff });
      await command().execute(ctx);
      expect(followUp).toHaveBeenCalledTimes(1);
    });

    it('says when a sync is already running', async () => {
      syncGuild.mockResolvedValue({ busy: true, checked: 0, added: 0, removed: 0 });
      const { ctx, followUp } = makeCtx({ action: 'sync', perms: staff });
      await command().execute(ctx);
      expect(followUp.mock.calls[0]?.[0].content).toContain('A sync is already running');
    });

    it('tells the member when Ririko lacks Manage Roles and does not sync', async () => {
      hasManageRolesPermission.mockReturnValue(false);
      const { ctx, reply } = makeCtx({ action: 'sync', perms: staff });
      await command().execute(ctx);
      expect(text(reply)).toContain('I do not have the **Manage Roles** permission');
      expect(syncGuild).not.toHaveBeenCalled();
    });

    it('says when there are no rewards and does not sync', async () => {
      stored.rewards = [];
      const { ctx, reply } = makeCtx({ action: 'sync', perms: staff });
      await command().execute(ctx);
      expect(text(reply)).toContain('no level role rewards to give');
      expect(syncGuild).not.toHaveBeenCalled();
    });

    it('reports a failed sync instead of throwing', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      syncGuild.mockRejectedValue(new Error('boom'));
      const { ctx, followUp } = makeCtx({ action: 'sync', perms: staff });
      await command().execute(ctx);
      expect(followUp.mock.calls[0]?.[0].content).toContain('stopped because of an error');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('[LevelRoles] Sync failed'));
      spy.mockRestore();
    });

    it('posts in the channel when the reply can no longer be followed up', async () => {
      const { ctx, followUp, send } = makeCtx({ action: 'sync', perms: staff });
      followUp.mockRejectedValue(new Error('Invalid Webhook Token'));
      await command().execute(ctx);
      expect(send.mock.calls[0]?.[0].content).toContain('Sync finished.');
    });

    it('logs and goes on when nothing can report the result', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { ctx, followUp, send } = makeCtx({ action: 'sync', perms: staff });
      followUp.mockRejectedValue(new Error('token gone'));
      send.mockRejectedValue(new Error('no access'));
      await expect(command().execute(ctx)).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Could not report a sync'));
      spy.mockRestore();
    });
  });
  describe('stack', () => {
    it('shows the current setting when no value is given', async () => {
      const { ctx, reply } = makeCtx({
        source: 'prefix',
        args: ['stack'],
        perms: [PermissionFlagsBits.ManageRoles],
      });
      await command().execute(ctx);
      expect(text(reply)).toContain('Stacking is **on**');
      expect(update).not.toHaveBeenCalled();

      stored.keepPreviousRoles = false;
      const second = makeCtx({ action: 'stack', perms: [PermissionFlagsBits.ManageGuild] });
      await command().execute(second.ctx);
      expect(text(second.reply)).toContain('Stacking is **off**');
    });

    it.each([
      ['off', false],
      ['No', false],
      ['disable', false],
      ['on', true],
      ['TRUE', true],
    ])('sets keepPreviousRoles from the prefix word %s', async (word, expected) => {
      stored.keepPreviousRoles = !expected;
      const { ctx, reply } = makeCtx({
        source: 'prefix',
        args: ['stack', word],
        perms: [PermissionFlagsBits.Administrator],
      });
      await command().execute(ctx);
      expect(update).toHaveBeenCalledWith(
        GUILD_ID,
        'levelroles',
        { keepPreviousRoles: expected },
        { userId: USER_ID, source: 'discord' },
      );
      expect(stored.keepPreviousRoles).toBe(expected);
      expect(text(reply)).toContain(`Stacking is now **${expected ? 'on' : 'off'}**`);
      expect(reply.mock.calls[0]?.[0].ephemeral).toBe(false);
      expect(reply.mock.calls[0]?.[0].allowedMentions).toEqual({ parse: [] });
    });

    it('sets keepPreviousRoles from the slash option', async () => {
      const { ctx, reply } = makeCtx({
        action: 'stack',
        enabled: false,
        perms: [PermissionFlagsBits.ManageGuild],
      });
      await command().execute(ctx);
      expect(update).toHaveBeenCalledWith(
        GUILD_ID,
        'levelroles',
        { keepPreviousRoles: false },
        { userId: USER_ID, source: 'discord' },
      );
      expect(stored.keepPreviousRoles).toBe(false);
      expect(text(reply)).toContain('Stacking is now **off**');
    });

    it('asks for on or off when the word is not one of them', async () => {
      const { ctx, reply } = makeCtx({
        source: 'prefix',
        args: ['stack', 'maybe'],
        perms: [PermissionFlagsBits.ManageRoles],
      });
      await command().execute(ctx);
      expect(text(reply)).toContain('Say `on` or `off`');
      expect(update).not.toHaveBeenCalled();
    });

    it('answers a validation error with its message and saves nothing', async () => {
      update.mockRejectedValueOnce(
        new GuildConfigValidationError({ keepPreviousRoles: ['Choose on or off.'] }),
      );
      const { ctx, reply } = makeCtx({
        source: 'prefix',
        args: ['stack', 'off'],
        perms: [PermissionFlagsBits.ManageRoles],
      });
      await command().execute(ctx);
      expect(text(reply)).toBe('Choose on or off.');
      expect(stored.keepPreviousRoles).toBe(true);
    });
  });
});
