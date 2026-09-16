import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import {
  GuildQueue,
  QueueManager,
  AutoplayEngine,
  clampVolume,
  volumeToGain,
  buildFilterArgs,
  isValidFilter,
  AUDIO_FILTERS,
  type QueuedTrack,
  type ResolvedTrack,
} from './index.js';
import { ExtractorPipeline } from '../extractors/pipeline.js';
import type { MusicSourceAdapter, MusicSearchResult } from '../types.js';

function createMockTrack(id: string, title = `Track ${id}`, artist = `Artist ${id}`, duration = 180): QueuedTrack {
  return {
    id,
    title,
    artist,
    durationSeconds: duration,
    url: `https://youtube.com/watch?v=${id}`,
    source: 'youtube',
    getStream: async () => Readable.from(['mock audio buffer']),
    requestedBy: {
      id: 'user-1',
      username: 'TestUser',
    },
    addedAt: new Date(),
  };
}

describe('Audio Queue State Machine, Loop Modes, Audio Filters & Volume Clamping (TASK-0511)', () => {
  describe('1. Audio Filters & Volume Helpers', () => {
    it('validates filter names and presets correctly', () => {
      expect(isValidFilter('bassboost')).toBe(true);
      expect(isValidFilter('nightcore')).toBe(true);
      expect(isValidFilter('vaporwave')).toBe(true);
      expect(isValidFilter('8d')).toBe(true);
      expect(isValidFilter('treble')).toBe(true);
      expect(isValidFilter('normal')).toBe(true);
      expect(isValidFilter('nonexistent_filter')).toBe(false);

      expect(AUDIO_FILTERS.bassboost).toContain('bass=g=10');
      expect(AUDIO_FILTERS.nightcore).toContain('asetrate=48000*1.25');
      expect(AUDIO_FILTERS.vaporwave).toContain('asetrate=48000*0.8');
      expect(AUDIO_FILTERS['8d']).toContain('apulsator=hz=0.08');
    });

    it('builds FFmpeg audio filter arguments correctly', () => {
      expect(buildFilterArgs([])).toEqual([]);
      expect(buildFilterArgs(['normal'])).toEqual([]);

      const singleArgs = buildFilterArgs(['bassboost']);
      expect(singleArgs).toEqual(['-af', AUDIO_FILTERS.bassboost]);

      const multiArgs = buildFilterArgs(['bassboost', '8d']);
      expect(multiArgs[0]).toBe('-af');
      expect(multiArgs[1]).toContain(AUDIO_FILTERS.bassboost);
      expect(multiArgs[1]).toContain(AUDIO_FILTERS['8d']);
    });

    it('clamps volume strictly between 0% and 150%', () => {
      // Clamping bounds
      expect(clampVolume(-50)).toBe(0);
      expect(clampVolume(0)).toBe(0);
      expect(clampVolume(50)).toBe(50);
      expect(clampVolume(100)).toBe(100);
      expect(clampVolume(150)).toBe(150);
      expect(clampVolume(200)).toBe(150);
      expect(clampVolume(9999)).toBe(150);

      // Fallback on non-number or NaN
      expect(clampVolume(NaN)).toBe(80);
      expect(clampVolume(NaN, 100)).toBe(100);
    });

    it('converts clamped volume to linear gain multiplier', () => {
      expect(volumeToGain(0)).toBe(0.0);
      expect(volumeToGain(50)).toBe(0.5);
      expect(volumeToGain(100)).toBe(1.0);
      expect(volumeToGain(150)).toBe(1.5);
      expect(volumeToGain(200)).toBe(1.5); // clamped at 150% -> 1.5
    });
  });

  describe('2. GuildQueue FIFO Track Management', () => {
    let queue: GuildQueue;

    beforeEach(() => {
      queue = new GuildQueue({
        guildId: 'guild-101',
        maxQueueSize: 5,
        defaultVolume: 80,
      });
    });

    it('adds single and multiple tracks preserving FIFO order', () => {
      const track1 = createMockTrack('t1', 'Song 1');
      const track2 = createMockTrack('t2', 'Song 2');

      const addedEventSpy = vi.fn();
      queue.on('trackAdded', addedEventSpy);

      expect(queue.addTrack(track1)).toBe(true);
      expect(queue.size).toBe(1);
      expect(addedEventSpy).toHaveBeenCalledWith(track1);

      expect(queue.addTrack(track2)).toBe(true);
      expect(queue.size).toBe(2);
      expect(queue.tracks[0]?.id).toBe('t1');
      expect(queue.tracks[1]?.id).toBe('t2');
    });

    it('respects maxQueueSize limit when adding tracks', () => {
      const tracks = [
        createMockTrack('1'),
        createMockTrack('2'),
        createMockTrack('3'),
        createMockTrack('4'),
        createMockTrack('5'),
      ];

      const added = queue.addTracks(tracks);
      expect(added).toBe(5);
      expect(queue.size).toBe(5);

      // Queue is now full (limit = 5)
      expect(queue.addTrack(createMockTrack('6'))).toBe(false);
      expect(queue.addTracks([createMockTrack('7'), createMockTrack('8')])).toBe(0);
      expect(queue.size).toBe(5);
    });

    it('removes track by index and emits trackRemoved', () => {
      queue.addTracks([createMockTrack('1'), createMockTrack('2'), createMockTrack('3')]);

      const removedSpy = vi.fn();
      queue.on('trackRemoved', removedSpy);

      const removed = queue.removeTrack(1); // Removes track 2
      expect(removed?.id).toBe('2');
      expect(removedSpy).toHaveBeenCalledWith(removed, 1);
      expect(queue.size).toBe(2);
      expect(queue.tracks[0]?.id).toBe('1');
      expect(queue.tracks[1]?.id).toBe('3');

      // Invalid indices
      expect(queue.removeTrack(-1)).toBeNull();
      expect(queue.removeTrack(10)).toBeNull();
    });

    it('moves track between queue positions', () => {
      queue.addTracks([createMockTrack('1'), createMockTrack('2'), createMockTrack('3')]);

      expect(queue.moveTrack(0, 2)).toBe(true); // Move 1 to end
      expect(queue.tracks.map((t) => t.id)).toEqual(['2', '3', '1']);

      // Invalid moves
      expect(queue.moveTrack(0, 0)).toBe(false);
      expect(queue.moveTrack(-1, 2)).toBe(false);
      expect(queue.moveTrack(0, 5)).toBe(false);
    });

    it('clears upcoming tracks and calculates total duration', () => {
      queue.addTracks([
        createMockTrack('1', 'Song 1', 'Artist', 120),
        createMockTrack('2', 'Song 2', 'Artist', 180),
      ]);

      expect(queue.totalDurationSeconds).toBe(300);

      const clearSpy = vi.fn();
      queue.on('queueCleared', clearSpy);

      queue.clear();
      expect(queue.size).toBe(0);
      expect(queue.totalDurationSeconds).toBe(0);
      expect(clearSpy).toHaveBeenCalled();
    });

    it('shuffles upcoming tracks', () => {
      const tracks = Array.from({ length: 20 }, (_, i) => createMockTrack(`id-${i}`));
      const largeQueue = new GuildQueue({ guildId: 'g1', maxQueueSize: 50 });
      largeQueue.addTracks(tracks);

      const shuffleSpy = vi.fn();
      largeQueue.on('queueShuffled', shuffleSpy);

      largeQueue.shuffle();
      expect(shuffleSpy).toHaveBeenCalledWith(20);
      expect(largeQueue.size).toBe(20);

      // Verify all items are still present
      const allIds = new Set(largeQueue.tracks.map((t) => t.id));
      expect(allIds.size).toBe(20);
    });
  });

  describe('3. Queue State, Volume Clamping & Filter Controls', () => {
    let queue: GuildQueue;

    beforeEach(() => {
      queue = new GuildQueue({
        guildId: 'guild-filter-test',
        defaultVolume: 80,
      });
    });

    it('clamps volume changes to [0, 150] and emits volumeChange', () => {
      const volSpy = vi.fn();
      queue.on('volumeChange', volSpy);

      expect(queue.setVolume(120)).toBe(120);
      expect(queue.volume).toBe(120);
      expect(queue.gain).toBe(1.2);
      expect(volSpy).toHaveBeenCalledWith(80, 120);

      // Clamps > 150
      expect(queue.setVolume(250)).toBe(150);
      expect(queue.volume).toBe(150);
      expect(queue.gain).toBe(1.5);
      expect(volSpy).toHaveBeenCalledWith(120, 150);

      // Clamps < 0
      expect(queue.setVolume(-10)).toBe(0);
      expect(queue.volume).toBe(0);
      expect(queue.gain).toBe(0.0);
    });

    it('toggles, sets, and clears audio filters', () => {
      const filterSpy = vi.fn();
      queue.on('filterChange', filterSpy);

      // Toggle bassboost ON
      expect(queue.toggleFilter('bassboost')).toBe(true);
      expect(queue.activeFilters).toEqual(['bassboost']);
      expect(queue.getFFmpegFilterArgs()).toEqual(['-af', AUDIO_FILTERS.bassboost]);
      expect(filterSpy).toHaveBeenCalledWith(['bassboost'], ['-af', AUDIO_FILTERS.bassboost]);

      // Set nightcore ON
      queue.setFilter('nightcore', true);
      expect(queue.activeFilters).toContain('bassboost');
      expect(queue.activeFilters).toContain('nightcore');

      // Toggle bassboost OFF
      expect(queue.toggleFilter('bassboost')).toBe(false);
      expect(queue.activeFilters).toEqual(['nightcore']);

      // Clear all filters
      queue.clearFilters();
      expect(queue.activeFilters).toEqual([]);
      expect(queue.getFFmpegFilterArgs()).toEqual([]);
    });

    it('manages loop modes and emits loopChange', () => {
      const loopSpy = vi.fn();
      queue.on('loopChange', loopSpy);

      expect(queue.loopMode).toBe('OFF');
      queue.setLoopMode('TRACK');
      expect(queue.loopMode).toBe('TRACK');
      expect(loopSpy).toHaveBeenCalledWith('OFF', 'TRACK');

      queue.setLoopMode('QUEUE');
      expect(queue.loopMode).toBe('QUEUE');
      expect(loopSpy).toHaveBeenCalledWith('TRACK', 'QUEUE');
    });

    it('manages queue state transitions and seek position', () => {
      const stateSpy = vi.fn();
      queue.on('stateChange', stateSpy);

      expect(queue.state).toBe('IDLE');
      queue.setState('PLAYING');
      expect(queue.state).toBe('PLAYING');
      expect(stateSpy).toHaveBeenCalledWith('IDLE', 'PLAYING');

      // Seek clamps to current track duration
      queue.addTrack(createMockTrack('1', 'Song', 'Artist', 200));
      queue.start();

      queue.seek(60);
      expect(queue.playbackPositionSeconds).toBe(60);

      // Clamps to track duration
      queue.seek(500);
      expect(queue.playbackPositionSeconds).toBe(200);

      // Clamps negative to 0
      queue.seek(-10);
      expect(queue.playbackPositionSeconds).toBe(0);
    });
  });

  describe('4. Playback Lifecycle & Loop Modes', () => {
    let queue: GuildQueue;

    beforeEach(() => {
      queue = new GuildQueue({
        guildId: 'guild-playback-test',
        maxHistorySize: 3,
      });
    });

    it('starts playback from empty or idle state', () => {
      expect(queue.start()).toBeNull();
      expect(queue.state).toBe('IDLE');

      const track1 = createMockTrack('t1');
      queue.addTrack(track1);

      const startSpy = vi.fn();
      queue.on('trackStart', startSpy);

      const started = queue.start();
      expect(started?.id).toBe('t1');
      expect(queue.currentTrack?.id).toBe('t1');
      expect(queue.state).toBe('PLAYING');
      expect(startSpy).toHaveBeenCalledWith(track1);
      expect(queue.size).toBe(0); // Shifted from upcoming tracks
    });

    it('handles natural track finishing in LoopMode OFF', async () => {
      const t1 = createMockTrack('1');
      const t2 = createMockTrack('2');
      queue.addTracks([t1, t2]);
      queue.start();

      const endSpy = vi.fn();
      const startSpy = vi.fn();
      queue.on('trackEnd', endSpy);
      queue.on('trackStart', startSpy);

      // t1 finishes
      const next = await queue.onTrackFinished('ended');
      expect(next?.id).toBe('2');
      expect(queue.currentTrack?.id).toBe('2');
      expect(endSpy).toHaveBeenCalledWith(t1, 'ended');
      expect(startSpy).toHaveBeenCalledWith(t2);
      expect(queue.history[0]?.id).toBe('1'); // t1 added to history

      // t2 finishes -> Queue ends
      const queueEndSpy = vi.fn();
      queue.on('queueEnd', queueEndSpy);

      const finished = await queue.onTrackFinished('ended');
      expect(finished).toBeNull();
      expect(queue.currentTrack).toBeNull();
      expect(queue.state).toBe('IDLE');
      expect(queueEndSpy).toHaveBeenCalled();
      expect(queue.history.map((t) => t.id)).toEqual(['1', '2']);
    });

    it('repeats current track in LoopMode TRACK on trackFinished', async () => {
      const t1 = createMockTrack('1');
      const t2 = createMockTrack('2');
      queue.addTracks([t1, t2]);
      queue.setLoopMode('TRACK');
      queue.start();

      const next = await queue.onTrackFinished();
      expect(next?.id).toBe('1'); // Keeps repeating track 1
      expect(queue.currentTrack?.id).toBe('1');
      expect(queue.tracks.length).toBe(1); // track 2 is still waiting
      expect(queue.history.length).toBe(0); // not pushed to history
    });

    it('re-enqueues track at the back of the queue in LoopMode QUEUE', async () => {
      const t1 = createMockTrack('1');
      const t2 = createMockTrack('2');
      queue.addTracks([t1, t2]);
      queue.setLoopMode('QUEUE');
      queue.start(); // Current is t1, queue has [t2]

      // t1 finishes -> t1 is appended to end of queue, t2 plays
      const next = await queue.onTrackFinished();
      expect(next?.id).toBe('2');
      expect(queue.currentTrack?.id).toBe('2');
      expect(queue.tracks.length).toBe(1);
      expect(queue.tracks[0]?.id).toBe('1');

      // t2 finishes -> t2 appended, t1 plays again!
      const loopAgain = await queue.onTrackFinished();
      expect(loopAgain?.id).toBe('1');
      expect(queue.tracks[0]?.id).toBe('2');
    });

    it('supports skip() and bypasses LoopMode TRACK so user is not stuck', () => {
      const t1 = createMockTrack('1');
      const t2 = createMockTrack('2');
      queue.addTracks([t1, t2]);
      queue.setLoopMode('TRACK');
      queue.start();

      // Manual skip advances to track 2 despite TRACK loop mode
      const skipped = queue.skip();
      expect(skipped?.id).toBe('2');
      expect(queue.currentTrack?.id).toBe('2');
      expect(queue.history[0]?.id).toBe('1');

      // Skip again -> queue empty -> queueEnd
      const queueEndSpy = vi.fn();
      queue.on('queueEnd', queueEndSpy);
      expect(queue.skip()).toBeNull();
      expect(queue.state).toBe('IDLE');
      expect(queueEndSpy).toHaveBeenCalled();
    });

    it('supports previous() to replay from history stack', () => {
      const t1 = createMockTrack('1');
      const t2 = createMockTrack('2');
      const t3 = createMockTrack('3');
      queue.addTracks([t1, t2, t3]);
      queue.start(); // t1 playing
      queue.skip();  // t2 playing, t1 in history
      queue.skip();  // t3 playing, [t1, t2] in history

      expect(queue.currentTrack?.id).toBe('3');
      expect(queue.history.map((t) => t.id)).toEqual(['1', '2']);

      // previous() should restore t2, and put t3 back at front of queue
      const prev = queue.previous();
      expect(prev?.id).toBe('2');
      expect(queue.currentTrack?.id).toBe('2');
      expect(queue.tracks[0]?.id).toBe('3');
      expect(queue.history.map((t) => t.id)).toEqual(['1']);

      // previous() again should restore t1, and put t2 back at front of queue
      const prev2 = queue.previous();
      expect(prev2?.id).toBe('1');
      expect(queue.tracks.map((t) => t.id)).toEqual(['2', '3']);
      expect(queue.history.length).toBe(0);

      // previous() on empty history returns null
      expect(queue.previous()).toBeNull();
    });

    it('caps history at maxHistorySize', () => {
      const shortHistoryQueue = new GuildQueue({
        guildId: 'g-hist',
        maxHistorySize: 2,
      });

      shortHistoryQueue.addTracks([
        createMockTrack('1'),
        createMockTrack('2'),
        createMockTrack('3'),
        createMockTrack('4'),
      ]);
      shortHistoryQueue.start();
      shortHistoryQueue.skip();
      shortHistoryQueue.skip();
      shortHistoryQueue.skip();

      expect(shortHistoryQueue.history.length).toBe(2);
      expect(shortHistoryQueue.history.map((t) => t.id)).toEqual(['2', '3']);
    });
  });

  describe('5. Autoplay Engine Recommendations & Deduplication', () => {
    let mockAdapter: MusicSourceAdapter;
    let pipeline: ExtractorPipeline;
    let autoplay: AutoplayEngine;

    beforeEach(() => {
      mockAdapter = {
        id: 'youtube',
        name: 'Mock YouTube',
        priority: 1,
        canResolve: () => true,
        search: vi.fn(async (_query: string): Promise<MusicSearchResult[]> => [
          {
            id: 'rec-1',
            title: 'Related Song 1',
            artist: 'YOASOBI',
            durationSeconds: 210,
            url: 'https://youtube.com/watch?v=rec-1',
            source: 'youtube',
          },
          {
            id: 'rec-2',
            title: 'Related Song 2',
            artist: 'YOASOBI',
            durationSeconds: 190,
            url: 'https://youtube.com/watch?v=rec-2',
            source: 'youtube',
          },
        ]),
        resolve: vi.fn(async (url: string): Promise<ResolvedTrack> => ({
          id: url.split('v=')[1] ?? 'resolved',
          title: 'Related Song 1',
          artist: 'YOASOBI',
          durationSeconds: 210,
          url,
          source: 'youtube',
          getStream: async () => Readable.from(['stream']),
        })),
        healthCheck: async () => ({ source: 'youtube', isHealthy: true, latencyMs: 10 }),
      };

      pipeline = new ExtractorPipeline({
        adapters: [mockAdapter],
        defaultSearchSource: 'youtube',
      });

      autoplay = new AutoplayEngine({
        pipeline,
      });
    });

    it('recommends related track and marks requester as Ririko Autoplay', async () => {
      const seedTrack = createMockTrack('seed-1', 'Idol', 'YOASOBI', 220);
      const recommendation = await autoplay.getRecommendation(seedTrack, [], []);

      expect(recommendation).not.toBeNull();
      expect(recommendation?.title).toBe('Related Song 1');
      expect(recommendation?.requestedBy.id).toBe('ririko-autoplay');
      expect(recommendation?.requestedBy.username).toBe('Ririko Autoplay');
    });

    it('deduplicates recommendations against recent history and queued tracks', async () => {
      const seedTrack = createMockTrack('seed-1', 'Idol', 'YOASOBI', 220);

      // If rec-1 is already in history, it must pick rec-2
      const historyTrack = createMockTrack('rec-1', 'Related Song 1', 'YOASOBI', 210);
      (mockAdapter.resolve as ReturnType<typeof vi.fn>).mockImplementationOnce(async (url: string) => ({
        id: 'rec-2',
        title: 'Related Song 2',
        artist: 'YOASOBI',
        durationSeconds: 190,
        url,
        source: 'youtube',
        getStream: async () => Readable.from(['stream']),
      }));

      const recommendation = await autoplay.getRecommendation(seedTrack, [historyTrack], []);
      expect(recommendation).not.toBeNull();
      expect(recommendation?.id).toBe('rec-2');
    });

    it('triggers autoplay in GuildQueue when queue runs dry', async () => {
      const queue = new GuildQueue({
        guildId: 'g-autoplay',
        autoplay: true,
      });
      queue.setAutoplayEngine(autoplay);

      const seed = createMockTrack('seed-1', 'Idol', 'YOASOBI', 220);
      queue.addTrack(seed);
      queue.start();

      // Seed finishes, queue has no more tracks, but autoplay is enabled
      const recommended = await queue.onTrackFinished();
      expect(recommended).not.toBeNull();
      expect(recommended?.requestedBy.id).toBe('ririko-autoplay');
      expect(queue.currentTrack?.requestedBy.id).toBe('ririko-autoplay');
      expect(queue.state).toBe('PLAYING');
    });
  });

  describe('6. QueueManager Guild Registry', () => {
    let manager: QueueManager;

    beforeEach(() => {
      manager = new QueueManager();
    });

    it('creates, retrieves, and tracks guild queues', () => {
      expect(manager.has('g1')).toBe(false);
      expect(manager.get('g1')).toBeUndefined();
      expect(manager.size).toBe(0);

      const q1 = manager.getOrCreate('g1', { defaultVolume: 90 });
      expect(q1.guildId).toBe('g1');
      expect(q1.volume).toBe(90);
      expect(manager.has('g1')).toBe(true);
      expect(manager.get('g1')).toBe(q1);
      expect(manager.size).toBe(1);

      // getOrCreate returns existing queue if already created
      const q1Again = manager.getOrCreate('g1');
      expect(q1Again).toBe(q1);
      expect(manager.size).toBe(1);

      const q2 = manager.getOrCreate('g2');
      expect(q2.guildId).toBe('g2');
      expect(manager.size).toBe(2);
      expect(manager.getAll().length).toBe(2);
    });

    it('deletes and destroys guild queues properly', () => {
      const q1 = manager.getOrCreate('g1');
      const destroySpy = vi.spyOn(q1, 'destroy');

      expect(manager.delete('g1')).toBe(true);
      expect(destroySpy).toHaveBeenCalled();
      expect(manager.has('g1')).toBe(false);
      expect(manager.delete('nonexistent')).toBe(false);
    });

    it('destroys all active queues upon destroyAll', () => {
      const q1 = manager.getOrCreate('g1');
      const q2 = manager.getOrCreate('g2');
      const spy1 = vi.spyOn(q1, 'destroy');
      const spy2 = vi.spyOn(q2, 'destroy');

      manager.destroyAll();
      expect(spy1).toHaveBeenCalled();
      expect(spy2).toHaveBeenCalled();
      expect(manager.size).toBe(0);
    });
  });
});
