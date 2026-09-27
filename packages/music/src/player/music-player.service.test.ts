import { describe, it, expect, vi } from 'vitest';
import { MusicPlayerService } from './music-player.service.js';
import { LavalinkQueueAdapter } from '../lavalink/lavalink-service.js';
import type { Player } from 'lavalink-client';

// Skips the background PO token fetch from youtube.com; these tests never play YouTube.
const offline = { youtubeOptions: { autoGeneratePoToken: false } };

describe('MusicPlayerService - Guild Volume Persistence (BUG-0018)', () => {
  it('resolves and caches guild volume from resolver hook', async () => {
    const resolver = vi.fn().mockImplementation(async (guildId: string) => {
      if (guildId === 'guild-custom') return 35;
      return undefined;
    });

    const service = new MusicPlayerService({
      ...offline,
      resolveGuildVolume: resolver,
      defaultVolume: 80,
    });

    // 1. Unset guild should resolve default 80
    const defaultVol = await service.resolveVolumeForGuild('guild-default');
    expect(defaultVol).toBe(80);
    expect(service.getGuildCachedVolume('guild-default')).toBe(80);

    // 2. Custom guild should resolve 35
    const customVol = await service.resolveVolumeForGuild('guild-custom');
    expect(customVol).toBe(35);
    expect(service.getGuildCachedVolume('guild-custom')).toBe(35);
    expect(resolver).toHaveBeenCalledWith('guild-custom');

    // 3. Second call should use in-memory cache without re-invoking resolver
    resolver.mockClear();
    const cachedVol = await service.resolveVolumeForGuild('guild-custom');
    expect(cachedVol).toBe(35);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('updates cache and clamp volume on setVolume', () => {
    const service = new MusicPlayerService({
      ...offline,
      defaultVolume: 80,
    });

    const clamped1 = service.setVolume('guild-1', 25);
    expect(clamped1).toBe(25);
    expect(service.getGuildCachedVolume('guild-1')).toBe(25);

    // Clamps over 150
    const clamped2 = service.setVolume('guild-1', 200);
    expect(clamped2).toBe(150);
    expect(service.getGuildCachedVolume('guild-1')).toBe(150);

    // Clamps below 0
    const clamped3 = service.setVolume('guild-1', -10);
    expect(clamped3).toBe(0);
    expect(service.getGuildCachedVolume('guild-1')).toBe(0);
  });

  it('creates new queue using the guild cached volume', () => {
    const service = new MusicPlayerService({
      ...offline,
      defaultVolume: 80,
    });
    service.setGuildCachedVolume('guild-1', 20);

    const queue = service.getOrCreateQueue('guild-1');
    expect(queue.volume).toBe(20);
  });

  it('restores guild volume across sessions after stop', async () => {
    let savedDbVolume = 80;
    const service = new MusicPlayerService({
      ...offline,
      resolveGuildVolume: async () => savedDbVolume,
      defaultVolume: 80,
    });

    // Set volume to 15% and simulate DB persistence
    service.setVolume('guild-session', 15);
    savedDbVolume = 15;

    // Session active: queue has 15%
    const queue1 = service.getOrCreateQueue('guild-session');
    expect(queue1.volume).toBe(15);

    // Stop session (queue is destroyed)
    service.stop('guild-session');
    expect(service.getQueue('guild-session')).toBeUndefined();

    // New session starts: queue initializes with 15%
    const queue2 = service.getOrCreateQueue('guild-session');
    expect(queue2.volume).toBe(15);
  });
});

describe('LavalinkQueueAdapter - setVolume (BUG-0018)', () => {
  it('clamps and delegates setVolume to underlying player', () => {
    const mockPlayer = {
      volume: 80,
      setVolume: vi.fn().mockImplementation((vol: number) => {
        mockPlayer.volume = vol;
      }),
      playing: true,
      paused: false,
      queue: { current: null, tracks: [], previous: [] },
      filterManager: { filters: {} },
    } as unknown as Player;

    const adapter = new LavalinkQueueAdapter(mockPlayer, 'guild-lavalink');

    expect(adapter.volume).toBe(80);

    // Set volume to 20
    const result = adapter.setVolume(20);
    expect(result).toBe(20);
    expect(mockPlayer.setVolume).toHaveBeenCalledWith(20);

    // Clamp over 150
    const over = adapter.setVolume(250);
    expect(over).toBe(150);
    expect(mockPlayer.setVolume).toHaveBeenCalledWith(150);
  });
});

describe('MusicPlayerService - auto-leave and settings changes (TASK-1161)', () => {
  it('stops after the idle timeout when the channel stays empty', () => {
    vi.useFakeTimers();
    try {
      const service = new MusicPlayerService({
        ...offline,
        idleTimeoutMs: 1000,
      });
      const stop = vi.spyOn(service, 'stop');

      service.handleChannelOccupancy('g1', 0, true);
      expect(service.hasEmptyChannelTimer('g1')).toBe(true);
      // A second report does not restart the countdown.
      vi.advanceTimersByTime(600);
      service.handleChannelOccupancy('g1', 0, true);
      vi.advanceTimersByTime(400);

      expect(stop).toHaveBeenCalledWith('g1');
      expect(service.hasEmptyChannelTimer('g1')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels when a member joins, and never starts with auto-leave off', () => {
    vi.useFakeTimers();
    try {
      const service = new MusicPlayerService({
        ...offline,
        idleTimeoutMs: 1000,
      });
      const stop = vi.spyOn(service, 'stop');

      service.handleChannelOccupancy('g1', 0, true);
      service.handleChannelOccupancy('g1', 1, true);
      service.handleChannelOccupancy('g2', 0, false);
      vi.advanceTimersByTime(5000);

      expect(stop).not.toHaveBeenCalled();
      expect(service.hasEmptyChannelTimer('g1')).toBe(false);
      expect(service.hasEmptyChannelTimer('g2')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads the default volume again after forgetGuildSettings', async () => {
    let saved = 30;
    const service = new MusicPlayerService({
      ...offline,
      resolveGuildVolume: () => saved,
    });
    expect(await service.resolveVolumeForGuild('g1')).toBe(30);
    saved = 90;
    expect(await service.resolveVolumeForGuild('g1')).toBe(30);
    service.forgetGuildSettings('g1');
    expect(await service.resolveVolumeForGuild('g1')).toBe(90);
  });
});
