import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { FreeGameRepository } from './free-game.repository.js';

const NOW = new Date('2026-09-17T20:00:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const game = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  provider: 'epic',
  title: `Game ${id}`,
  storeUrl: `https://store.example.com/${id}`,
  startDate: at(-1),
  endDate: at(6),
  ...overrides,
});

describeDialects('FreeGameRepository behaviour', (db) => {
  it('creates a game with an upper-cased provider and reads it back', async () => {
    const repo = new FreeGameRepository(db.client);
    expect(await repo.findById('g1')).toBeNull();
    expect(await repo.exists('g1')).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create(game('g1', { thumbnailUrl: 'https://img/1.png' }));
    expect(created.provider).toBe('EPIC');
    expect(created.thumbnailUrl).toBe('https://img/1.png');
    expect(created.endDate.getTime()).toBe(at(6).getTime());

    expect((await repo.findById('g1'))?.title).toBe('Game g1');
    expect(await repo.exists('g1')).toBe(true);
    expect(await repo.count()).toBe(1);
    await expect(repo.create(game('g1'))).rejects.toThrow();
  });

  it('updates a game and throws for a missing one', async () => {
    const repo = new FreeGameRepository(db.client);
    await repo.create(game('g1'));

    const updated = await repo.update('g1', { title: 'Renamed', endDate: at(10) });
    expect(updated.title).toBe('Renamed');
    expect(updated.endDate.getTime()).toBe(at(10).getTime());
    expect(updated.provider).toBe('EPIC');

    await expect(repo.update('nope', { title: 'x' })).rejects.toThrow(DatabaseError);
  });

  it('deletes a game once', async () => {
    const repo = new FreeGameRepository(db.client);
    await repo.create(game('g1'));

    expect(await repo.delete('g1')).toBe(true);
    expect(await repo.delete('g1')).toBe(false);
    expect(await repo.count()).toBe(0);
  });

  it('upserts a game, keeping the thumbnail when none is given', async () => {
    const repo = new FreeGameRepository(db.client);
    const first = await repo.upsertFreeGame(game('g1', { thumbnailUrl: 'https://img/a.png' }));
    expect(first.title).toBe('Game g1');

    const kept = await repo.upsertFreeGame(game('g1', { title: 'Retitled', endDate: at(9) }));
    expect(kept.title).toBe('Retitled');
    expect(kept.thumbnailUrl).toBe('https://img/a.png');
    expect(kept.endDate.getTime()).toBe(at(9).getTime());

    const replaced = await repo.upsertFreeGame(game('g1', { thumbnailUrl: 'https://img/b.png' }));
    expect(replaced.thumbnailUrl).toBe('https://img/b.png');

    const cleared = await repo.upsertFreeGame(game('g1', { thumbnailUrl: null }));
    expect(cleared.thumbnailUrl).toBeNull();
    expect(await repo.count()).toBe(1);
  });

  it('lists the games that have not ended yet', async () => {
    const repo = new FreeGameRepository(db.client);
    await repo.create(game('live'));
    await repo.create(game('ended', { startDate: at(-8), endDate: at(-1) }));
    await repo.create(game('later', { startDate: at(1), endDate: at(8) }));

    expect((await repo.listActiveFreeGames(NOW)).map((g) => g.id).sort()).toEqual([
      'later',
      'live',
    ]);
    expect((await repo.listActiveFreeGames(at(7))).map((g) => g.id)).toEqual(['later']);
    expect(await repo.listActiveFreeGames(at(20))).toEqual([]);
    expect(Array.isArray(await repo.listActiveFreeGames())).toBe(true);
  });

  it('records one announcement per game and guild', async () => {
    const repo = new FreeGameRepository(db.client);
    expect(await repo.isGameAnnounced('g1', 'guild-1')).toBe(false);

    const recorded = await repo.recordAnnouncement({
      gameId: 'g1',
      guildId: 'guild-1',
      channelId: 'c1',
      messageId: 'm1',
      announcedAt: NOW,
    });
    expect(recorded.messageId).toBe('m1');
    expect(recorded.announcedAt.getTime()).toBe(NOW.getTime());
    expect(await repo.isGameAnnounced('g1', 'guild-1')).toBe(true);
    expect(await repo.isGameAnnounced('g1', 'guild-2')).toBe(false);
    expect(await repo.isGameAnnounced('g2', 'guild-1')).toBe(false);

    await expect(
      repo.recordAnnouncement({
        gameId: 'g1',
        guildId: 'guild-1',
        channelId: 'c2',
        messageId: 'm2',
      }),
    ).rejects.toThrow();
    const stamped = await repo.recordAnnouncement({
      gameId: 'g2',
      guildId: 'guild-1',
      channelId: 'c1',
      messageId: 'm3',
    });
    expect(stamped.announcedAt).toBeInstanceOf(Date);
    expect((await repo.listAnnouncementsByGuild('guild-1')).map((a) => a.gameId).sort()).toEqual([
      'g1',
      'g2',
    ]);
    expect(await repo.listAnnouncementsByGuild('guild-9')).toEqual([]);
  });

  it('keeps one announcement channel per guild and the role it mentions', async () => {
    const repo = new FreeGameRepository(db.client);
    expect(await repo.getGuildChannel('g1')).toBeNull();

    const first = await repo.setGuildChannel('g1', { channelId: 'c1', mentionRoleId: 'role' });
    expect(first.mentionRoleId).toBe('role');
    expect(await repo.getGuildChannel('g1')).toEqual({
      guildId: 'g1',
      channelId: 'c1',
      mentionRoleId: 'role',
    });

    const moved = await repo.setGuildChannel('g1', { channelId: 'c2' });
    expect(moved.channelId).toBe('c2');
    expect(moved.mentionRoleId).toBe('role');

    const cleared = await repo.setGuildChannel('g1', { channelId: 'c2', mentionRoleId: null });
    expect(cleared.mentionRoleId).toBeNull();

    await repo.setGuildChannel('g2', { channelId: 'c9' });
    expect((await repo.listAllConfiguredGuildChannels()).map((t) => t.guildId).sort()).toEqual([
      'g1',
      'g2',
    ]);

    expect(await repo.removeGuildChannel('g1')).toBe(true);
    expect(await repo.removeGuildChannel('g1')).toBe(false);
    expect(await repo.getGuildChannel('g1')).toBeNull();
  });
});
