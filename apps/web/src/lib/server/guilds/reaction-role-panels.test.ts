import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordAPIError } from '@discordjs/rest';
import {
  AuditLogRepository,
  createDatabaseClient,
  ReactionRoleRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { PanelError, ReactionRolePanelService } from './reaction-role-panels';

const GUILD = '100000000000000001';
const CHANNEL = '300000000000000001';
const MESSAGE = '400000000000000001';
const BOT = '900000000000000001';
const MEMBER = '200000000000000001';
const VIP = '200000000000000002';
const ADMIN = '200000000000000009';
const actor = { userId: 'user-1', ipAddress: '203.0.113.7', userAgent: 'vitest' };

function discordError(code: number, status: number, message = 'Missing Permissions') {
  return new DiscordAPIError({ code, message }, code, status, 'POST', '/channels/1/messages', {});
}

function panel(overrides: Record<string, unknown> = {}) {
  return {
    channelId: CHANNEL,
    content: 'Pick your roles',
    kind: 'BUTTONS',
    items: [
      { roleId: MEMBER, label: 'Member', emoji: '🎮' },
      { roleId: VIP, label: 'VIP', style: 'SUCCESS' },
    ],
    ...overrides,
  };
}

describe('ReactionRolePanelService (TASK-1642)', () => {
  let db: SqliteDatabaseClient;
  let reactionRoles: ReactionRoleRepository;
  let rest: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let service: ReactionRolePanelService;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    reactionRoles = new ReactionRoleRepository(db);
    rest = {
      get: vi.fn(),
      post: vi.fn(async (_route: string, { body }: { body: Record<string, unknown> }) => ({
        id: MESSAGE,
        channel_id: CHANNEL,
        author: { id: BOT },
        ...body,
      })),
      patch: vi.fn(async (_route: string, { body }: { body: Record<string, unknown> }) => ({
        id: MESSAGE,
        channel_id: CHANNEL,
        author: { id: BOT },
        ...body,
      })),
      delete: vi.fn(),
    };
    service = new ReactionRolePanelService({
      db,
      reactionRoles,
      audit: new AuditLogRepository(db),
      rest: rest as unknown as ConstructorParameters<typeof ReactionRolePanelService>[0]['rest'],
      resources: {
        messageChannels: async () => [{ id: CHANNEL, name: 'roles', category: null }],
        assignableRoles: async () => [
          { id: MEMBER, name: 'Member', color: 0 },
          { id: VIP, name: 'VIP', color: 0 },
        ],
        memberRoles: async () => [
          { id: ADMIN, name: 'Admin', color: 0 },
          { id: MEMBER, name: 'Member', color: 0 },
          { id: VIP, name: 'VIP', color: 0 },
        ],
        botUserId: async () => BOT,
      },
      now: () => new Date('2026-09-26T00:00:00Z'),
    });
  });

  afterEach(async () => {
    await db.close();
  });

  const auditRows = () =>
    db.raw.prepare('SELECT action, details, actor_user_id FROM audit_logs').all() as Array<{
      action: string;
      details: string;
      actor_user_id: string;
    }>;

  it('posts a new panel, stores one binding per button and audits it', async () => {
    const result = await service.publish(GUILD, JSON.stringify(panel()), actor);

    expect(result).toEqual({
      status: 'published',
      channelId: CHANNEL,
      messageId: MESSAGE,
      created: true,
      changes: [{ field: 'roleIds', before: [], after: [MEMBER, VIP] }],
    });
    const [route, { body }] = rest.post.mock.calls[0]!;
    expect(route).toBe(`/channels/${CHANNEL}/messages`);
    expect(body.allowed_mentions).toEqual({ parse: [] });
    const rows = await reactionRoles.findByMessageId(MESSAGE);
    expect(rows).toHaveLength(2);
    const customIds = body.components[0].components.map((c: { custom_id: string }) => c.custom_id);
    expect(customIds.sort()).toEqual(rows.map((row) => `rr:btn:${row.id}`).sort());
    expect(rows.every((row) => row.type === 'BUTTON' && row.guildId === GUILD)).toBe(true);
    expect(new Set(rows.map((row) => row.groupId)).size).toBe(1);

    const [audit] = auditRows();
    expect(audit).toMatchObject({ action: 'reaction_roles.publish', actor_user_id: 'user-1' });
    expect(JSON.parse(audit!.details).changes).toEqual([
      { field: 'roleIds', before: [], after: [MEMBER, VIP] },
    ]);
  });

  it('edits its own message, keeps the menu group and replaces the old bindings', async () => {
    await service.publish(
      GUILD,
      panel({ kind: 'SELECT', items: [{ roleId: MEMBER, label: 'M' }] }),
      actor,
    );
    const [first] = await reactionRoles.findByMessageId(MESSAGE);
    rest.get.mockResolvedValue({
      id: MESSAGE,
      channel_id: CHANNEL,
      author: { id: BOT },
      content: 'old',
      embeds: [],
      components: rest.post.mock.calls[0]![1].body.components,
    });

    const result = await service.publish(
      GUILD,
      panel({
        messageId: MESSAGE,
        kind: 'SELECT',
        maxValues: 2,
        items: [
          { roleId: MEMBER, label: 'M' },
          { roleId: VIP, label: 'V' },
        ],
      }),
      actor,
    );

    expect(result).toMatchObject({ status: 'published', created: false });
    expect(rest.patch.mock.calls[0]![0]).toBe(`/channels/${CHANNEL}/messages/${MESSAGE}`);
    const rows = await reactionRoles.findByMessageId(MESSAGE);
    expect(rows.map((row) => row.roleId).sort()).toEqual([MEMBER, VIP]);
    expect(rows.every((row) => row.groupId === first!.groupId && row.type === 'SELECT_MENU')).toBe(
      true,
    );
    expect(rest.patch.mock.calls[0]![1].body.components[0].components[0].custom_id).toBe(
      `rr:select:group:${first!.groupId}`,
    );
    expect(JSON.parse(auditRows()[1]!.details).changes[0]).toEqual({
      field: 'roleIds',
      before: [MEMBER],
      after: [MEMBER, VIP],
    });
  });

  it('refuses messages of other authors or with other features’ buttons', async () => {
    rest.get.mockResolvedValue({
      id: MESSAGE,
      channel_id: CHANNEL,
      author: { id: '900000000000000002' },
      content: '',
      embeds: [],
    });
    await expect(service.publish(GUILD, panel({ messageId: MESSAGE }), actor)).rejects.toThrow(
      new PanelError('Ririko can only add roles to messages it sent.'),
    );

    rest.get.mockResolvedValue({
      id: MESSAGE,
      channel_id: CHANNEL,
      author: { id: BOT },
      content: '',
      embeds: [],
      components: [{ type: 1, components: [{ type: 2, custom_id: 'giveaway:enter:1' }] }],
    });
    await expect(service.publish(GUILD, panel({ messageId: MESSAGE }), actor)).rejects.toThrow(
      'buttons or menus from another feature',
    );
    expect(rest.patch).not.toHaveBeenCalled();
  });

  it('reports schema, channel and role problems without calling Discord', async () => {
    expect(
      await service.publish(
        GUILD,
        panel({ channelId: '300000000000000002', items: [{ roleId: ADMIN, label: 'A' }] }),
        actor,
      ),
    ).toEqual({
      status: 'invalid',
      errors: [
        'Choose a text or announcement channel of this server.',
        'Role 1: Ririko cannot give @Admin: it is managed by an integration or is not below Ririko’s highest role.',
      ],
    });
    expect(await service.publish(GUILD, '{"kind":"BUTTONS"}', actor)).toMatchObject({
      status: 'invalid',
    });
    expect(rest.post).not.toHaveBeenCalled();
  });

  it('explains Discord errors a manager can fix', async () => {
    rest.post.mockRejectedValue(discordError(50013, 403));
    await expect(service.publish(GUILD, panel(), actor)).rejects.toThrow(
      'Ririko is missing permissions in that channel.',
    );
    rest.post.mockRejectedValue(new Error('socket hang up'));
    await expect(service.publish(GUILD, panel(), actor)).rejects.toThrow('socket hang up');
  });

  it('deletes a new message, or restores an edited one, when the bindings cannot be saved', async () => {
    vi.spyOn(reactionRoles, 'replaceComponentBindings').mockRejectedValue(new Error('disk full'));
    await expect(service.publish(GUILD, panel(), actor)).rejects.toThrow('disk full');
    expect(rest.delete).toHaveBeenCalledWith(`/channels/${CHANNEL}/messages/${MESSAGE}`);

    const before = {
      id: MESSAGE,
      channel_id: CHANNEL,
      author: { id: BOT },
      content: 'before',
      embeds: [{ title: 'Old' }],
      components: [],
    };
    rest.get.mockResolvedValue(before);
    await expect(service.publish(GUILD, panel({ messageId: MESSAGE }), actor)).rejects.toThrow(
      'disk full',
    );
    expect(rest.patch).toHaveBeenLastCalledWith(`/channels/${CHANNEL}/messages/${MESSAGE}`, {
      body: { content: 'before', embeds: [{ title: 'Old' }], components: [] },
    });
    expect(auditRows()).toEqual([]);
  });
});
