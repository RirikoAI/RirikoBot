import { afterEach, describe, expect, it } from 'vitest';
import { SpotifyAdapter, YouTubeAdapter, type ExtractorPipeline } from '@ririko/music';
import { createMusicPipeline } from './music-sources.js';

// Preset tokens keep the YouTube adapter from generating a PO token over the network.
const youtubeEnv = { YOUTUBE_PO_TOKEN: 'po-token', YOUTUBE_VISITOR_DATA: 'visitor-data' };

describe('createMusicPipeline', () => {
  let pipeline: ExtractorPipeline | undefined;

  afterEach(() => {
    const youtube = pipeline?.getAdapter('youtube');
    if (youtube instanceof YouTubeAdapter) youtube.getPoTokenService()?.stopAutoRotation();
    pipeline = undefined;
  });

  it.each([undefined, 'false', 'TRUE', '1'])(
    'leaves the YouTube extractor out when USE_PRIVATE_MUSIC_PACKAGE is %j',
    (flag) => {
      pipeline = createMusicPipeline({ ...youtubeEnv, USE_PRIVATE_MUSIC_PACKAGE: flag });
      expect(pipeline.getAdapter('youtube')).toBeUndefined();
      expect(pipeline.getAdapter('soundcloud')).toBeDefined();
    },
  );

  it('adds the YouTube extractor, wired to Spotify metadata, when the flag is true', () => {
    pipeline = createMusicPipeline({ ...youtubeEnv, USE_PRIVATE_MUSIC_PACKAGE: 'true' });
    const youtube = pipeline.getAdapter('youtube');

    expect(youtube).toBeInstanceOf(YouTubeAdapter);
    expect((youtube as YouTubeAdapter).getMetadataResolver()).toBeInstanceOf(SpotifyAdapter);
  });
});
