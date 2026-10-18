import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { describeDialects } from '../testing/dialects.js';
import { MusicRepository } from './music.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';
const T0 = new Date('2026-03-01T20:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const play = (guildId: string, userId: string, title: string, minutes: number) => ({
  guildId,
  userId,
  trackTitle: title,
  trackUrl: `https://example.com/${title}`,
  durationSeconds: 180,
  sourceProvider: 'YOUTUBE',
  playedAt: at(minutes),
});

describeDialects('MusicRepository behaviour', (db) => {
  it('stores guild settings with defaults, merging later changes', async () => {
    const repo = new MusicRepository(db.client);
    expect(await repo.getGuildSettings('g1')).toBeNull();
    expect(await repo.findById('g1')).toBeNull();
    expect(await repo.exists('g1')).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create({ guildId: 'g1' });
    expect(created.defaultVolume).toBe(80);
    expect(created.djRoleId).toBeNull();
    expect(created.restrictVoiceChannelId).toBeNull();
    expect(created.autoLeaveEmpty).toBe(true);
    expect(created.lyricsProvider).toBe('GENIUS');

    const changed = await repo.update('g1', { defaultVolume: 35, djRoleId: 'dj' });
    expect(changed.defaultVolume).toBe(35);
    expect(changed.djRoleId).toBe('dj');
    expect(changed.autoLeaveEmpty).toBe(true);

    const explicit = await repo.upsertGuildSettings('g2', {
      defaultVolume: 10,
      restrictVoiceChannelId: 'vc',
      autoLeaveEmpty: false,
      lyricsProvider: 'MUSIXMATCH',
    });
    expect(explicit.restrictVoiceChannelId).toBe('vc');
    expect(explicit.autoLeaveEmpty).toBe(false);
    expect(explicit.lyricsProvider).toBe('MUSIXMATCH');

    expect((await repo.findById('g1'))?.defaultVolume).toBe(35);
    expect(await repo.exists('g1')).toBe(true);
    expect(await repo.count()).toBe(2);
  });

  it('deletes guild settings once', async () => {
    const repo = new MusicRepository(db.client);
    await repo.create({ guildId: 'g1' });

    expect(await repo.delete('g1')).toBe(true);
    expect(await repo.delete('g1')).toBe(false);
    expect(await repo.count()).toBe(0);
  });

  it('keeps one dedicated music channel per guild', async () => {
    const repo = new MusicRepository(db.client);
    expect(await repo.getMusicChannel('g1')).toBeNull();

    const first = await repo.setMusicChannel('g1', 'c1');
    expect(first.channelId).toBe('c1');
    expect(first.lastMessageId).toBeNull();

    const moved = await repo.setMusicChannel('g1', 'c2', 'm1');
    expect(moved.channelId).toBe('c2');
    expect(moved.lastMessageId).toBe('m1');
    expect((await repo.getMusicChannel('g1'))?.channelId).toBe('c2');

    expect(await repo.deleteMusicChannel('g1')).toBe(true);
    expect(await repo.deleteMusicChannel('g1')).toBe(false);
    expect(await repo.getMusicChannel('g1')).toBeNull();
  });

  it('records playback history and lists it newest first per guild and per user', async () => {
    const repo = new MusicRepository(db.client);
    const first = await repo.recordHistory(play('g1', 'u1', 'one', 1));
    expect(first.trackTitle).toBe('one');
    expect(first.playedAt.getTime()).toBe(at(1).getTime());
    await repo.recordHistory(play('g1', 'u2', 'two', 2));
    await repo.recordHistory(play('g2', 'u1', 'three', 3));
    await repo.recordHistory(play('g1', 'u1', 'four', 4));

    expect((await repo.getGuildHistory('g1')).map((h) => h.trackTitle)).toEqual([
      'four',
      'two',
      'one',
    ]);
    expect((await repo.getGuildHistory('g1', 2)).map((h) => h.trackTitle)).toEqual(['four', 'two']);
    expect((await repo.getUserHistory('u1')).map((h) => h.trackTitle)).toEqual([
      'four',
      'three',
      'one',
    ]);
    expect((await repo.getUserHistory('u1', 1)).map((h) => h.trackTitle)).toEqual(['four']);
    expect(await repo.getGuildHistory('nowhere')).toEqual([]);
    expect(await repo.getUserHistory('nobody')).toEqual([]);

    const { playedAt: _explicit, ...withoutTime } = play('g1', 'u1', 'five', 5);
    const stamped = await repo.recordHistory(withoutTime);
    expect(stamped.playedAt).toBeInstanceOf(Date);
    const fixed = randomUUID();
    expect((await repo.recordHistory({ ...play('g1', 'u1', 'six', 6), id: fixed })).id).toBe(fixed);
  });

  it('creates playlists with defaults and finds them by id and by owner', async () => {
    const repo = new MusicRepository(db.client);
    expect(await repo.getPlaylistById(MISSING_UUID)).toBeNull();

    const basic = await repo.createPlaylist('u1', 'Chill');
    expect(basic.description).toBeNull();
    expect(basic.isPublic).toBe(false);
    expect(basic.playCount).toBe(0);
    expect(basic.guildId).toBeNull();

    const rich = await repo.createPlaylist('u1', 'Party', {
      description: 'Loud',
      isPublic: true,
      guildId: 'g1',
    });
    await repo.createPlaylist('u2', 'Other');

    expect((await repo.getPlaylistById(basic.id))?.name).toBe('Chill');
    expect(rich.description).toBe('Loud');
    expect(rich.guildId).toBe('g1');
    expect((await repo.getUserPlaylists('u1')).map((p) => p.name).sort()).toEqual([
      'Chill',
      'Party',
    ]);
    expect(await repo.getUserPlaylists('nobody')).toEqual([]);
  });

  it('lists public playlists by play count and counts plays', async () => {
    const repo = new MusicRepository(db.client);
    const quiet = await repo.createPlaylist('u1', 'Quiet', { isPublic: true });
    const hit = await repo.createPlaylist('u1', 'Hit', { isPublic: true });
    await repo.createPlaylist('u1', 'Private');

    await repo.incrementPlaylistPlayCount(hit.id);
    await repo.incrementPlaylistPlayCount(hit.id);
    await repo.incrementPlaylistPlayCount(quiet.id);

    expect((await repo.getPublicPlaylists()).map((p) => p.name)).toEqual(['Hit', 'Quiet']);
    expect((await repo.getPublicPlaylists(1)).map((p) => p.name)).toEqual(['Hit']);
    expect((await repo.getPlaylistById(hit.id))?.playCount).toBe(2);
  });

  it('appends tracks at consecutive positions and lists them in order', async () => {
    const repo = new MusicRepository(db.client);
    const list = await repo.createPlaylist('u1', 'Mix');
    const other = await repo.createPlaylist('u1', 'Other');

    const a = await repo.addTrackToPlaylist(list.id, { title: 'A', url: 'u/a', duration: 100 });
    const b = await repo.addTrackToPlaylist(list.id, {
      title: 'B',
      url: 'u/b',
      duration: 200,
      thumbnailUrl: 'https://img/b.png',
    });
    await repo.addTrackToPlaylist(other.id, { title: 'X', url: 'u/x', duration: 50 });

    expect(a.position).toBe(0);
    expect(a.thumbnailUrl).toBeNull();
    expect(b.position).toBe(1);
    expect(b.thumbnailUrl).toBe('https://img/b.png');
    expect((await repo.getPlaylistTracks(list.id)).map((t) => t.title)).toEqual(['A', 'B']);
    expect(await repo.getPlaylistTracks(MISSING_UUID)).toEqual([]);

    expect(await repo.removeTrackFromPlaylist(list.id, a.id)).toBe(true);
    expect(await repo.removeTrackFromPlaylist(list.id, a.id)).toBe(false);
    expect(await repo.removeTrackFromPlaylist(other.id, b.id)).toBe(false);
    const c = await repo.addTrackToPlaylist(list.id, { title: 'C', url: 'u/c', duration: 10 });
    expect(c.position).toBe(2);
  });

  it('clears the tracks of one playlist and reports how many', async () => {
    const repo = new MusicRepository(db.client);
    const list = await repo.createPlaylist('u1', 'Mix');
    const other = await repo.createPlaylist('u1', 'Other');
    for (const title of ['A', 'B', 'C'])
      await repo.addTrackToPlaylist(list.id, { title, url: `u/${title}`, duration: 1 });
    await repo.addTrackToPlaylist(other.id, { title: 'X', url: 'u/x', duration: 1 });

    expect(await repo.clearPlaylistTracks(list.id)).toBe(3);
    expect(await repo.clearPlaylistTracks(list.id)).toBe(0);
    expect(await repo.getPlaylistTracks(other.id)).toHaveLength(1);
  });

  it('deletes a playlist and its tracks, only for its owner', async () => {
    const repo = new MusicRepository(db.client);
    const list = await repo.createPlaylist('u1', 'Mix');
    await repo.addTrackToPlaylist(list.id, { title: 'A', url: 'u/a', duration: 1 });

    expect(await repo.deletePlaylist(list.id, 'intruder')).toBe(false);
    expect(await repo.getPlaylistById(list.id)).not.toBeNull();

    expect(await repo.deletePlaylist(list.id, 'u1')).toBe(true);
    expect(await repo.deletePlaylist(list.id, 'u1')).toBe(false);
    expect(await repo.getPlaylistById(list.id)).toBeNull();
    expect(await repo.getPlaylistTracks(list.id)).toEqual([]);
  });
});
