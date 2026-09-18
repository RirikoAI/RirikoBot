import type { StreamRepository } from '@ririko/database';
import type { Streamer } from '@ririko/database';
import type {
  StreamPlatform,
  StreamPlatformAdapter,
  LiveStreamInfo,
} from './types.js';

export interface StreamWatcherOptions {
  checkIntervalMs?: number | undefined;
  onStreamLive?: (streamer: Streamer, stream: LiveStreamInfo) => Promise<void> | void;
  onStreamOffline?: (streamer: Streamer) => Promise<void> | void;
}

export interface StreamCheckResult {
  totalChecked: number;
  liveCount: number;
  errors: number;
  durationMs: number;
}

export class StreamWatcherEngine {
  private readonly adapters = new Map<StreamPlatform, StreamPlatformAdapter>();
  private readonly checkIntervalMs: number;
  private readonly onStreamLive?: ((streamer: Streamer, stream: LiveStreamInfo) => Promise<void> | void) | undefined;
  private readonly onStreamOffline?: ((streamer: Streamer) => Promise<void> | void) | undefined;

  private timer: NodeJS.Timeout | null = null;
  private isChecking = false;
  private lastCheckedAt: Date | null = null;

  constructor(
    private readonly streamRepo: StreamRepository,
    options: StreamWatcherOptions = {},
  ) {
    this.checkIntervalMs =
      options.checkIntervalMs ??
      Number(process.env.STREAM_CHECK_INTERVAL_MS || 60_000);
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

  getAdapters(): Map<StreamPlatform, StreamPlatformAdapter> {
    return new Map(this.adapters);
  }

  getCheckIntervalMs(): number {
    return this.checkIntervalMs;
  }

  getLastCheckedAt(): Date | null {
    return this.lastCheckedAt;
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

  /**
   * Performs a complete polling cycle and returns total live streams detected.
   */
  async checkStreams(): Promise<number> {
    const result = await this.checkStreamsDetailed();
    return result.liveCount;
  }

  /**
   * Detailed check cycle with diagnostic metrics and isolated error boundaries.
   */
  async checkStreamsDetailed(): Promise<StreamCheckResult> {
    if (this.isChecking) {
      return { totalChecked: 0, liveCount: 0, errors: 0, durationMs: 0 };
    }
    this.isChecking = true;
    const startTime = Date.now();

    let totalChecked = 0;
    let liveCount = 0;
    let errorCount = 0;

    try {
      const streamers = await this.streamRepo.listActiveMonitoredStreamers();
      if (streamers.length === 0) {
        this.lastCheckedAt = new Date();
        return { totalChecked: 0, liveCount: 0, errors: 0, durationMs: Date.now() - startTime };
      }

      totalChecked = streamers.length;

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
        if (!adapter) {
          console.warn(`[StreamWatcherEngine] No adapter registered for platform: ${platform}`);
          continue;
        }

        if (!adapter.isConfigured()) {
          continue;
        }

        try {
          if (adapter.getBatchStreamStatus) {
            const results = await adapter.getBatchStreamStatus(
              platformStreamers.map((s) => ({
                platformUserId: s.platformUserId,
                username: s.username,
              })),
            );

            for (const s of platformStreamers) {
              try {
                const liveData = results.get(s.username.toLowerCase()) ?? null;
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
              } catch (itemErr) {
                errorCount++;
                console.error(`[StreamWatcherEngine] Error processing streamer ${s.username}:`, itemErr);
              }
            }
          } else {
            // Sequential resolution with isolated error handling per streamer
            for (const s of platformStreamers) {
              try {
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
              } catch (itemErr) {
                errorCount++;
                console.error(`[StreamWatcherEngine] Error checking streamer ${s.username} (${platform}):`, itemErr);
              }
            }
          }
        } catch (platformErr) {
          errorCount++;
          console.error(`[StreamWatcherEngine] Error in platform check cycle for ${platform}:`, platformErr);
        }
      }

      this.lastCheckedAt = new Date();
    } catch (err) {
      errorCount++;
      console.error('[StreamWatcherEngine] Polling cycle error:', err);
    } finally {
      this.isChecking = false;
    }

    return {
      totalChecked,
      liveCount,
      errors: errorCount,
      durationMs: Date.now() - startTime,
    };
  }
}
