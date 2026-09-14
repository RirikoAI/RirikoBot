# Music 2.0 Audio Subsystem Specification

## 1. Overview & Architectural Goals
Music 2.0 is a complete ground-up rework of Ririko's audio player. It eliminates the fragile monolithic player and the aggressive 10-second message polling loops from version 1.4.0 in favor of a resilient **Multi-Source Extractor Pipeline**, decoupled audio engines, and reactive event-driven Discord embeds.

---

## 2. Audio Extractor Adapter Architecture

Audio sources are implemented as independent adapters conforming to `MusicSourceAdapter`:

```typescript
export interface MusicSearchResult {
  title: string;
  artist: string;
  durationSeconds: number;
  url: string;
  thumbnailUrl?: string;
  source: string;
}

export interface ResolvedTrack extends MusicSearchResult {
  streamUrl?: string;
  getStream(): Promise<ReadableStream | NodeJS.ReadableStream>;
}

export interface ResolvedPlaylist {
  title: string;
  url: string;
  tracks: ResolvedTrack[];
}

export interface AdapterHealth {
  isHealthy: boolean;
  latencyMs: number;
  errorMessage?: string;
}

export interface MusicSourceAdapter {
  readonly id: string;
  readonly name: string;
  
  canResolve(input: string): boolean;
  search(query: string): Promise<MusicSearchResult[]>;
  resolve(input: string): Promise<ResolvedTrack | ResolvedPlaylist>;
  healthCheck(): Promise<AdapterHealth>;
}
```

### Supported Sources:
1. **YouTube**: Extractor with session cookie rotation and client spoofing (iOS / Android TV client emulation) to bypass bot IP bans.
2. **Spotify**: Metadata resolution via official Spotify Web API, mapped to the highest quality stream on SoundCloud or YouTube.
3. **SoundCloud**: Direct native audio streaming without bot IP blocking.
4. **Deezer**: Native metadata resolution and preview streaming.
5. **Direct Streams / Bandcamp**: Direct m3u8 and raw HTTP audio stream playback.

---

## 3. Audio Player Engines & Decoupling

Ririko does not hard-couple application logic to a single player implementation. It abstracts playback behind an `AudioPlayerService` interface:
- **Default Core (`@discordjs/voice`)**: Direct in-process voice connection using `@discordjs/voice` with native Opus transcoding via `@discordjs/opus` or `opusscript` and `prism-media`.
- **Lavalink 4 Adapter**: Drop-in client configuration for high-traffic multi-node bot deployments, routing heavy audio transcoding off-node to dedicated Lavalink instances.

---

## 4. Complete Feature Set
- **Core Playback**: Play, Pause, Resume, Skip, Previous, Replay, Stop, Seek, Volume (0%–150%, clamped for hearing safety).
- **Queue Management**: Add, Move queue item, Remove queue item, Shuffle, Clear, Loop (Off, Single Track, Entire Queue).
- **Playback Modes**: Autoplay (smart recommendation engine based on related tracks when queue ends).
- **Persistence & Recovery**: In the event of a bot reboot or shard reconnect, active guild queues are serialized in SQLite/PostgreSQL and seamlessly resumed.
- **Dedicated Music Channel**: Optional permanent text channel (`#music`) with an interactive embed controller featuring live playback buttons (Play/Pause, Skip, Stop, Loop, Volume).
- **Access Control & DJ Role**: Configurable DJ Role, music channel restrictions, and voice channel whitelists.
- **Inactivity Disconnect**: Configurable idle timeout (default 3 minutes) when the voice channel is empty or playback has finished.
- **Playlists & Favorites**: `/playlist create`, `/playlist add`, `/playlist play`, `/playlist export`, and personal favorites (`/music favorite`).

---

## 5. Reactive UI (Elimination of Polling)

Legacy Ririko 1.4.0 registered a global `setInterval(..., 10000)` per guild to edit Discord messages and simulate a progress bar, routinely causing HTTP 429 rate limits.
**Music 2.0 strictly forbids polling.** Embeds and buttons update exclusively on:
1. `trackStart` event.
2. `trackEnd` / `queueEnd` event.
3. Direct button or command interactions from users.

---

## 6. AI Invocation & Audio Security Guardrails

In strict adherence to Sections 10 and 75 of `BLUEPRINT.md`:
1. **Safe Tool Calling Contract**: When a user commands the AI in natural language (e.g. *"Ririko, play YOASOBI Idol"*), the AI outputs a structured tool call:
   ```json
   {
     "tool": "music.play",
     "arguments": {
       "query": "YOASOBI Idol"
     }
   }
   ```
2. **Strict Parameter Clamping**:
   - Volume requests above 150% are automatically clamped to 150%.
   - Arbitrary shell commands or player process manipulation from LLM output are strictly blocked.
   - Destructive voice actions (e.g. "disconnect all users") are **never exposed** as AI tools.
