import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { MusicRepository } from './music.repository.js';

describe('MusicRepository — Music Guild Settings, Channels, History & Playlists (TASK-0512)', () => {
  let client: SqliteDatabaseClient;
  let musicRepo: MusicRepository;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    // Create tables for music subsystem
    client.raw.exec(`
      CREATE TABLE music_guild_settings (
        guild_id TEXT PRIMARY KEY,
        default_volume INTEGER NOT NULL DEFAULT 80,
        dj_role_id TEXT,
        restrict_voice_channel_id TEXT,
        auto_leave_empty INTEGER NOT NULL DEFAULT 1,
        lyrics_provider TEXT NOT NULL DEFAULT 'GENIUS'
      );

      CREATE TABLE music_channels (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        last_message_id TEXT
      );

      CREATE TABLE music_history (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        track_title TEXT NOT NULL,
        track_url TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL,
        source_provider TEXT NOT NULL,
        played_at INTEGER NOT NULL
      );

      CREATE TABLE music_saved_playlists (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        is_public INTEGER NOT NULL DEFAULT 0,
        play_count INTEGER NOT NULL DEFAULT 0,
        guild_id TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE music_playlist_tracks (
        id TEXT PRIMARY KEY,
        playlist_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        duration INTEGER NOT NULL,
        thumbnail_url TEXT,
        position INTEGER NOT NULL
      );
    `);

    musicRepo = new MusicRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('1. Music Guild Settings', () => {
    it('returns null when settings do not exist', async () => {
      const settings = await musicRepo.getGuildSettings('guild-not-found');
      expect(settings).toBeNull();
      expect(await musicRepo.exists('guild-not-found')).toBe(false);
    });

    it('upserts and retrieves guild settings with defaults', async () => {
      const created = await musicRepo.upsertGuildSettings('g-1', {
        defaultVolume: 90,
        djRoleId: 'role-dj',
      });

      expect(created.guildId).toBe('g-1');
      expect(created.defaultVolume).toBe(90);
      expect(created.djRoleId).toBe('role-dj');
      expect(created.autoLeaveEmpty).toBe(true);
      expect(created.lyricsProvider).toBe('GENIUS');

      const fetched = await musicRepo.getGuildSettings('g-1');
      expect(fetched?.defaultVolume).toBe(90);
      expect(fetched?.djRoleId).toBe('role-dj');
      expect(await musicRepo.exists('g-1')).toBe(true);

      // Update existing settings
      const updated = await musicRepo.upsertGuildSettings('g-1', {
        defaultVolume: 75,
        restrictVoiceChannelId: 'vc-music',
      });
      expect(updated.defaultVolume).toBe(75);
      expect(updated.restrictVoiceChannelId).toBe('vc-music');
    });

    it('deletes guild settings and counts records', async () => {
      await musicRepo.upsertGuildSettings('g-count-1', { defaultVolume: 80 });
      await musicRepo.upsertGuildSettings('g-count-2', { defaultVolume: 80 });

      expect(await musicRepo.count()).toBe(2);

      const deleted = await musicRepo.delete('g-count-1');
      expect(deleted).toBe(true);
      expect(await musicRepo.count()).toBe(1);
    });
  });

  describe('2. Dedicated Music Channels', () => {
    it('sets, retrieves, and updates dedicated music channel', async () => {
      expect(await musicRepo.getMusicChannel('g-chan')).toBeNull();

      const created = await musicRepo.setMusicChannel('g-chan', 'c-100', 'm-msg-1');
      expect(created.guildId).toBe('g-chan');
      expect(created.channelId).toBe('c-100');
      expect(created.lastMessageId).toBe('m-msg-1');

      const fetched = await musicRepo.getMusicChannel('g-chan');
      expect(fetched?.channelId).toBe('c-100');

      // Update message ID
      const updated = await musicRepo.setMusicChannel('g-chan', 'c-100', 'm-msg-2');
      expect(updated.lastMessageId).toBe('m-msg-2');
    });

    it('deletes dedicated music channel', async () => {
      await musicRepo.setMusicChannel('g-del-chan', 'c-200');
      expect(await musicRepo.deleteMusicChannel('g-del-chan')).toBe(true);
      expect(await musicRepo.getMusicChannel('g-del-chan')).toBeNull();
      expect(await musicRepo.deleteMusicChannel('g-del-chan')).toBe(false);
    });
  });

  describe('3. Playback History', () => {
    it('records and queries guild playback history in reverse chronological order', async () => {
      const now = Date.now();

      await musicRepo.recordHistory({
        guildId: 'g-hist',
        userId: 'u-1',
        trackTitle: 'Song 1',
        trackUrl: 'https://youtube.com/watch?v=1',
        durationSeconds: 180,
        sourceProvider: 'YOUTUBE',
        playedAt: new Date(now - 2000),
      });

      await musicRepo.recordHistory({
        guildId: 'g-hist',
        userId: 'u-2',
        trackTitle: 'Song 2',
        trackUrl: 'https://spotify.com/track/2',
        durationSeconds: 210,
        sourceProvider: 'SPOTIFY',
        playedAt: new Date(now - 1000),
      });

      await musicRepo.recordHistory({
        guildId: 'g-other',
        userId: 'u-1',
        trackTitle: 'Other Guild Song',
        trackUrl: 'https://soundcloud.com/3',
        durationSeconds: 150,
        sourceProvider: 'SOUNDCLOUD',
        playedAt: new Date(now),
      });

      const guildHistory = await musicRepo.getGuildHistory('g-hist', 10);
      expect(guildHistory.length).toBe(2);
      expect(guildHistory[0]?.trackTitle).toBe('Song 2'); // Most recent first
      expect(guildHistory[1]?.trackTitle).toBe('Song 1');

      const userHistory = await musicRepo.getUserHistory('u-1', 10);
      expect(userHistory.length).toBe(2);
      expect(userHistory.map((h) => h.trackTitle)).toContain('Other Guild Song');
      expect(userHistory.map((h) => h.trackTitle)).toContain('Song 1');
    });
  });

  describe('4. Custom Saved Playlists & Tracks', () => {
    it('creates and retrieves playlists for user', async () => {
      const playlist = await musicRepo.createPlaylist('user-1', 'Anime Chill', {
        description: 'Lofi anime beats',
        isPublic: true,
      });

      expect(playlist.id).toBeDefined();
      expect(playlist.name).toBe('Anime Chill');
      expect(playlist.userId).toBe('user-1');
      expect(playlist.isPublic).toBe(true);
      expect(playlist.playCount).toBe(0);

      const byId = await musicRepo.getPlaylistById(playlist.id);
      expect(byId?.name).toBe('Anime Chill');

      const userPlaylists = await musicRepo.getUserPlaylists('user-1');
      expect(userPlaylists.length).toBe(1);
      expect(userPlaylists[0]?.id).toBe(playlist.id);
    });

    it('increments playlist play count', async () => {
      const playlist = await musicRepo.createPlaylist('u-play', 'Favorites');
      await musicRepo.incrementPlaylistPlayCount(playlist.id);
      await musicRepo.incrementPlaylistPlayCount(playlist.id);

      const updated = await musicRepo.getPlaylistById(playlist.id);
      expect(updated?.playCount).toBe(2);
    });

    it('adds tracks with sequential positions, queries, and removes tracks', async () => {
      const playlist = await musicRepo.createPlaylist('u-tracks', 'My J-Pop');

      const t1 = await musicRepo.addTrackToPlaylist(playlist.id, {
        title: 'Racing into the Night',
        url: 'https://youtube.com/watch?v=yoasobi-1',
        duration: 260,
      });
      expect(t1.position).toBe(0);

      const t2 = await musicRepo.addTrackToPlaylist(playlist.id, {
        title: 'Kaibutsu',
        url: 'https://youtube.com/watch?v=yoasobi-2',
        duration: 210,
      });
      expect(t2.position).toBe(1);

      const tracks = await musicRepo.getPlaylistTracks(playlist.id);
      expect(tracks.length).toBe(2);
      expect(tracks[0]?.title).toBe('Racing into the Night');
      expect(tracks[1]?.title).toBe('Kaibutsu');

      // Remove t1
      const removed = await musicRepo.removeTrackFromPlaylist(playlist.id, t1.id);
      expect(removed).toBe(true);

      const remaining = await musicRepo.getPlaylistTracks(playlist.id);
      expect(remaining.length).toBe(1);
      expect(remaining[0]?.id).toBe(t2.id);
    });

    it('deletes playlist and cascades deletion of playlist tracks', async () => {
      const playlist = await musicRepo.createPlaylist('u-cascade', 'Temp Playlist');
      await musicRepo.addTrackToPlaylist(playlist.id, {
        title: 'Temp Track 1',
        url: 'https://url1',
        duration: 100,
      });
      await musicRepo.addTrackToPlaylist(playlist.id, {
        title: 'Temp Track 2',
        url: 'https://url2',
        duration: 200,
      });

      expect((await musicRepo.getPlaylistTracks(playlist.id)).length).toBe(2);

      // Deleting by a different user fails
      const wrongUserDeleted = await musicRepo.deletePlaylist(playlist.id, 'another-user');
      expect(wrongUserDeleted).toBe(false);
      expect(await musicRepo.getPlaylistById(playlist.id)).not.toBeNull();

      // Deleting by owner succeeds
      const deleted = await musicRepo.deletePlaylist(playlist.id, 'u-cascade');
      expect(deleted).toBe(true);
      expect(await musicRepo.getPlaylistById(playlist.id)).toBeNull();
      expect((await musicRepo.getPlaylistTracks(playlist.id)).length).toBe(0);
    });
  });
});
