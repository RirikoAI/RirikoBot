import { ExtractorPipeline, YouTubeAdapter, createStandardAdapters } from '@ririko/music';

/**
 * Builds the in-process extractor pipeline the bot plays from when Lavalink is unavailable.
 * `USE_PRIVATE_MUSIC_PACKAGE=true` adds the privately distributed YouTube extractor; without it,
 * the fallback player searches SoundCloud and bridges Spotify and Deezer links to SoundCloud.
 * YouTube playback through Lavalink does not depend on this flag.
 */
export function createMusicPipeline(env: NodeJS.ProcessEnv = process.env): ExtractorPipeline {
  const adapters = createStandardAdapters();
  if (env.USE_PRIVATE_MUSIC_PACKAGE === 'true') {
    adapters.push(
      new YouTubeAdapter({
        cookie: env.YOUTUBE_COOKIE,
        poToken: env.YOUTUBE_PO_TOKEN,
        visitorData: env.YOUTUBE_VISITOR_DATA,
      }),
    );
  }
  return new ExtractorPipeline({ adapters });
}
