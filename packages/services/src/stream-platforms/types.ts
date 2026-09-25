export type StreamPlatform = 'TWITCH' | 'YOUTUBE' | 'TIKTOK';

export interface StreamerInfo {
  platform: StreamPlatform;
  platformUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface LiveStreamInfo {
  streamId: string;
  platform: StreamPlatform;
  streamerId?: string;
  streamerUsername: string;
  streamerDisplayName?: string;
  title: string;
  gameName: string | null;
  viewerCount: number;
  startedAt: Date;
  thumbnailUrl: string;
  streamUrl: string;
}

export interface StreamPlatformAdapter {
  readonly platform: StreamPlatform;
  readonly name: string;
  isConfigured(): boolean;
  resolveStreamer(usernameOrId: string): Promise<StreamerInfo | null>;
  getStreamStatus(streamer: {
    platformUserId: string;
    username: string;
  }): Promise<LiveStreamInfo | null>;
  getBatchStreamStatus?(
    streamers: Array<{ platformUserId: string; username: string }>,
  ): Promise<Map<string, LiveStreamInfo | null>>;
}
