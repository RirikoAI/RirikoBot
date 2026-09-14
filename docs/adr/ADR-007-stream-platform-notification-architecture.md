# ADR-007: Stream Platform Notification Architecture

## Status
Accepted

## Context
In Ririko 1.4.0, stream monitoring was restricted to Twitch. It polled the Twitch Helix API every 60 seconds, directly embedded Twitch's temporary thumbnail template URL into Discord embeds (which frequently resulted in broken images), and lacked proper notification idempotency across restarts.

## Decision
1. **Multi-Platform Watcher Pipeline**: Standardize a pluggable stream watcher interface (`StreamPlatformWatcher`) supporting:
   - Twitch (via EventSub Webhooks / WebSockets with polling fallback)
   - YouTube Live (via RSS / PubSubHubbub / Data API v3)
   - TikTok Live & Facebook Gaming (via public stream status endpoints)
2. **Idempotency & Deduplication Engine**: Record stream session IDs and notification dispatch states in an indexed `stream_notifications` table to guarantee that a live notification is sent exactly once per stream session per guild.
3. **Thumbnail Proxy & CDN Caching**: Download live stream thumbnail assets, cache them in local storage / Redis, and attach them directly to Discord message payloads to prevent broken or expired image embeds.
4. **Guild Customization**: Provide custom notification templates supporting dynamic placeholders (`{streamer}`, `{title}`, `{game}`, `{url}`, `{role}`) and custom ping roles.

## Consequences
### Positive
- Zero duplicate notifications even during transient network failures or bot reboots.
- Thumbnails never break or expire after the stream goes offline.
- Expands stream alerts beyond Twitch to YouTube and TikTok streamers.

### Negative
- Requires local storage or CDN space for caching stream preview thumbnails.
