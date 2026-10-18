import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuditLogRepository,
  createDatabaseClient,
  GiveawayRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { GiveawayError, GiveawayManagementService } from './giveaways';

const GUILD = '100000000000000001';
const OTHER_GUILD = '100000000000000002';
const CHANNEL = '300000000000000001';
const actor = { userId: 'user-1', ipAddress: '203.0.113.7', userAgent: 'vitest' };
const NOW = new Date('2026-09-27T12:00:00Z');

describe('GiveawayManagementService (TASK-1153)', () => {
  let db: SqliteDatabaseClient;
  let giveaways: GiveawayRepository;
  let rest: { post: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn> };
  let service: GiveawayManagementService;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    giveaways = new GiveawayRepository(db);
    rest = { post: vi.fn(async () => ({})), patch: vi.fn(async () => ({})) };
    service = new GiveawayManagementService({
      giveaways,
      audit: new AuditLogRepository(db),
      rest: rest as unknown as ConstructorParameters<typeof GiveawayManagementService>[0]['rest'],
      resources: { channelNames: async () => new Map([[CHANNEL, 'giveaways']]) },
      now: () => NOW,
    });
  });

  afterEach(async () => {
    await db.close();
  });

  async function create(id: string, fields: Record<string, unknown> = {}) {
    await giveaways.create({
      id,
      guildId: GUILD,
      channelId: CHANNEL,
      messageId: `msg-${id}`,
      prize: `Prize ${id}`,
      winnerCount: 1,
      endsAt: new Date(NOW.getTime() + 3_600_000),
      createdBy: 'host-1',
      ...fields,
    });
  }

  const auditActions = () =>
    (
      db.raw.prepare('SELECT action, details FROM audit_logs').all() as Array<{
        action: string;
        details: string;
      }>
    ).map((row) => ({ action: row.action, details: JSON.parse(row.details) }));

  it('lists running giveaways by end time and ended ones with their winners', async () => {
    await create('late', { endsAt: new Date(NOW.getTime() + 7_200_000) });
    await create('soon');
    await create('done', { isEnded: true });
    await giveaways.addEntry('soon', 'u1');
    await giveaways.recordWinners('done', ['u2']);
    await giveaways.recordWinners('done', ['u3'], true);

    const { active, ended } = await service.list(GUILD);
    expect(active.map((giveaway) => [giveaway.id, giveaway.entryCount])).toEqual([
      ['soon', 1],
      ['late', 0],
    ]);
    expect(ended).toHaveLength(1);
    expect(ended[0]).toMatchObject({
      id: 'done',
      channelName: 'giveaways',
      messageUrl: `https://discord.com/channels/${GUILD}/${CHANNEL}/msg-done`,
      winners: [
        { userId: 'u2', isReroll: false },
        { userId: 'u3', isReroll: true },
      ],
    });
  });

  it('ends a giveaway, updates its message, pings only the winners and audits it', async () => {
    await create('g1');
    await giveaways.addEntry('g1', 'u1');

    expect(await service.end(GUILD, 'g1', actor)).toEqual({
      prize: 'Prize g1',
      winnerIds: ['u1'],
    });
    expect((await giveaways.findById('g1'))?.isEnded).toBe(true);
    expect(rest.patch).toHaveBeenCalledWith(`/channels/${CHANNEL}/messages/msg-g1`, {
      body: expect.objectContaining({
        embeds: [expect.objectContaining({ title: expect.stringContaining('ENDED') })],
      }),
    });
    expect(rest.post).toHaveBeenCalledWith(`/channels/${CHANNEL}/messages`, {
      body: {
        content: expect.stringContaining('<@u1>'),
        allowed_mentions: { parse: [], users: ['u1'] },
      },
    });
    expect(auditActions()).toEqual([
      {
        action: 'giveaways.end',
        details: {
          source: 'dashboard',
          giveawayId: 'g1',
          channelId: CHANNEL,
          prize: 'Prize g1',
          winnerIds: ['u1'],
        },
      },
    ]);
  });

  it('keeps the result when Discord refuses the message edit and post', async () => {
    await create('g1');
    rest.patch.mockRejectedValue(new Error('Missing Access'));
    rest.post.mockRejectedValue(new Error('Missing Access'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await service.end(GUILD, 'g1', actor);
    expect((await giveaways.findById('g1'))?.isEnded).toBe(true);
    expect(auditActions()).toHaveLength(1);
    warn.mockRestore();
  });

  it('refuses a giveaway that already ended, is still running, or belongs to another guild', async () => {
    await create('g1', { isEnded: true });
    await create('g2');
    await create('other', { guildId: OTHER_GUILD });

    await expect(service.end(GUILD, 'g1', actor)).rejects.toThrow('already ended');
    await expect(service.reroll(GUILD, 'g2', null, actor)).rejects.toThrow('still running');
    await expect(service.end(GUILD, 'other', actor)).rejects.toBeInstanceOf(GiveawayError);
    await expect(service.end(GUILD, 'missing', actor)).rejects.toThrow('no longer exists');
    expect((await giveaways.findById('other'))?.isEnded).toBe(false);
    expect(auditActions()).toEqual([]);
  });

  it('rerolls among members who have not won and announces the new winners', async () => {
    await create('g1', { isEnded: true });
    await giveaways.addEntry('g1', 'u1');
    await giveaways.addEntry('g1', 'u2');
    await giveaways.recordWinners('g1', ['u1']);

    expect(await service.reroll(GUILD, 'g1', null, actor)).toEqual({
      prize: 'Prize g1',
      winnerIds: ['u2'],
      posted: true,
    });
    expect(rest.post).toHaveBeenCalledWith(`/channels/${CHANNEL}/messages`, {
      body: {
        content: expect.stringContaining('Rerolled'),
        allowed_mentions: { parse: [], users: ['u2'] },
      },
    });
    await expect(service.reroll(GUILD, 'g1', 1, actor)).rejects.toThrow('Nobody is left');
    expect(auditActions().map((row) => row.action)).toEqual(['giveaways.reroll']);
  });
});
