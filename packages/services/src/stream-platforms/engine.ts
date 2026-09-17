import type { StreamRepository } from '@ririko/database';
import type { Streamer } from '@ririko/database';
import type {
  StreamPlatform,
  StreamPlatformAdapter,
  LiveStreamInfo,
} from './types.js';

export interface StreamWatcherOptions {
  checkIntervalMs?: number;
  onStreamLive?: (streamer: Streamer, stream: LiveStreamInfo) => Promise<void> | void;
  onStreamOffline?: (streamer: Streamer) => Promise<void> | void;
}

export class StreamWatcherEngine {
  private readonly adapters = new Map<StreamPlatform, StreamPlatformAdapter>();
  private readonly checkIntervalMs: number;
  private readonly onStreamLive?: ((streamer: Streamer, stream: LiveStreamInfo) => Promise<void> | void) | undefined;
  private readonly onStreamOffline?: ((streamer: Streamer) => Promise<void> | void) | undefined;

  private timer: NodeJS.Timeout | null = null;
  private isChecking = false;

  constructor(
    private readonly streamRepo: StreamRepository,
    options: StreamWatcherOptions = {},
  ) {
    this.checkIntervalMs = options.checkIntervalMs ?? 60_000;
    this.onStreamLive = options.onStreamLive;
    this.onStreamOffline = options.onStreamOffline;
  }

  registerAdapter(adapter: StreamPlatformAdapter): this {
    this.adapters.set(adapter.platform, adapter);
    return this;
  }

  getAdapter(platform: StreamPlatform): StreamPlatformAdapter | undefined {
    return this.adapters.get(platform);
  }

  start(): void {
    if (this.timer) return;

    // Initial check triggered asynchronously with small delay
    setTimeout(() => {
      void this.checkStreams();
    }, 1_000);

    this.timer = setInterval(() => {
      void this.checkStreams();
    }, this.checkIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  async checkStreams(): Promise<number> {
    if (this.isChecking) return 0;
    this.isChecking = true;

    let liveCount = 0;

    try {
      const streamers = await this.streamRepo.listActiveMonitoredStreamers();
      if (streamers.length === 0) return 0;

      // Group streamers by platform
      const byPlatform = new Map<StreamPlatform, Streamer[]>();
      for (const s of streamers) {
        const p = s.platform.toUpperCase() as StreamPlatform;
        const list = byPlatform.get(p) ?? [];
        list.push(s);
        byPlatform.set(p, list);
      }

      for (const [platform, platformStreamers] of byPlatform.entries()) {
        const adapter = this.adapters.get(platform);
        if (!adapter || !adapter.isConfigured()) continue;

        if (adapter.getBatchStreamStatus) {
          const results = await adapter.getBatchStreamStatus(
            platformStreamers.map((s) => ({
              platformUserId: s.platformUserId,
              username: s.username,
            })),
          );

          for (const s of platformStreamers) {
            const liveData = results.get(s.username.toLowerCase()) ?? null;
            const isNowLive = Boolean(liveData);

            if (isNowLive && liveData) {
              liveCount++;
              // If streamer wasn't marked live, state transition: OFFLINE -> LIVE
              if (!s.isLive) {
                await this.streamRepo.updateLiveStatus(s.id, true, new Date());
                await this.streamRepo.recordStreamEvent({
                  streamerId: s.id,
                  streamId: liveData.streamId,
                  title: liveData.title,
                  gameName: liveData.gameName,
                  viewerCount: liveData.viewerCount,
                  startedAt: liveData.startedAt,
                });

                if (this.onStreamLive) {
                  try {
                    await this.onStreamLive(s, liveData);
                  } catch (handlerErr) {
                    console.error(`[StreamWatcher] onStreamLive error for ${s.username}:`, handlerErr);
                  }
                }
              }
            } else if (!isNowLive && s.isLive) {
              // State transition: LIVE -> OFFLINE
              await this.streamRepo.updateLiveStatus(s.id, false, new Date());

              if (this.onStreamOffline) {
                try {
                  await this.onStreamOffline(s);
                } catch (handlerErr) {
                  console.error(`[StreamWatcher] onStreamOffline error for ${s.username}:`, handlerErr);
                }
              }
            } else {
              // Update last checked timestamp
              await this.streamRepo.updateLiveStatus(s.id, s.isLive, new Date());
            }
          }
        } else {
          // Sequential resolution
          for (const s of platformStreamers) {
            const liveData = await adapter.getStreamStatus({
              platformUserId: s.platformUserId,
              username: s.username,
            });
            const isNowLive = Boolean(liveData);

            if (isNowLive && liveData) {
              liveCount++;
              if (!s.isLive) {
                await this.streamRepo.updateLiveStatus(s.id, true, new Date());
                await this.streamRepo.recordStreamEvent({
                  streamerId: s.id,
                  streamId: liveData.streamId,
                  title: liveData.title,
                  gameName: liveData.gameName,
                  viewerCount: liveData.viewerCount,
                  startedAt: liveData.startedAt,
                });

                if (this.onStreamLive) {
                  try {
                    await this.onStreamLive(s, liveData);
                  } catch (handlerErr) {
                    console.error(`[StreamWatcher] onStreamLive error for ${s.username}:`, handlerErr);
                  }
                }
              }
            } else if (!isNowLive && s.isLive) {
              await this.streamRepo.updateLiveStatus(s.id, false, new Date());

              if (this.onStreamOffline) {
                try {
                  await this.onStreamOffline(s);
                } catch (handlerErr) {
                  console.error(`[StreamWatcher] onStreamOffline error for ${s.username}:`, handlerErr);
                }
              }
            } else {
              await this.streamRepo.updateLiveStatus(s.id, s.isLive, new Date());
            }
          }
        }
      }
    } catch (err) {
      console.error('[StreamWatcherEngine] Polling cycle error:', err);
    } finally {
      this.isChecking = false;
    }

    return liveCount;
  }
}
