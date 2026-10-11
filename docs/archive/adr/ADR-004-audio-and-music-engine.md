# ADR-004: Audio and Music Engine Architecture

## Status
Accepted

## Context
Ririko 1.4.0 relied on `@distube/*` and `lavashark`. YouTube playback broke repeatedly due to IP bot detection (necessitating `DISABLE_YOUTUBE=true` in `.env.example`). Furthermore, legacy `MusicService` registered a global 10-second `setInterval` per active guild to edit now-playing embeds, routinely triggering Discord HTTP 429 rate limits.

## Decision
1. **Multi-Source Extractor Architecture**: Implement an audio extraction pipeline supporting multiple fallback sources:
   - YouTube (with session cookie support)
   - Spotify (metadata resolution mapped to audio sources)
   - SoundCloud (native audio stream)
   - Bandcamp & Direct HTTP/m3u8 audio streams
2. **Audio Core**: Standardize on `@discordjs/voice` with native Opus transcoding and audio resource recycling.
3. **Optional Lavalink Adapter**: Provide a drop-in Lavalink 4 adapter option for distributed multi-node bot deployments.
4. **Elimination of Polling**: Deprecate 10-second polling loops completely. Embeds and interactive buttons update exclusively in response to audio player lifecycle events (`trackStart`, `trackEnd`, `stateChange`) and direct user interactions.

## Consequences
### Positive
- High playback resilience; if YouTube blocks a stream, search seamlessly falls back to alternative audio sources.
- Significant reduction in Discord API calls, eliminating HTTP 429 rate limit bans.
- Smooth voice reconnection handling during Discord voice server region shifts.

### Negative
- Requires maintaining multiple extractor plugins and audio stream transcoding configurations.
