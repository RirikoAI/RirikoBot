# Handover Note: STORY-172 Per-Source Music Toggles & Pluggable Source Adapters

- **Ticket Type & Points**: Story | 5 pts (parent `EPIC-005`; `TASK-1721` 3 pts, `TASK-1722` 2 pts)
- **Author / Agent**: Claude Code (grooming session)
- **Status**: TODO (groomed and estimated; no code written yet)
- **Timestamp**: 2026-09-29T15:40:00Z

## 1. Summary of Work Accomplished

Grooming only. The story and its two tasks were added to [board.json](file:///Z:/Projects/ririko-v2-2026/docs/kanban/board.json) and [BOARD.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/BOARD.md) in commit `5b46a43` on `develop/2.0.0`.

### Goal

Operators must be able to switch the YouTube music source off (and back on) without a code change, on both playback paths, and the YouTube-specific extractor code must live in its own private workspace package so it can be removed or replaced in isolation.

### Decisions made with the maintainer

- **Switch name**: `USE_PRIVATE_MUSIC_PACKAGE` (boolean). `true` injects the private music package and enables YouTube sources on both paths; `false` turns both off. This replaces the working names `YOUTUBE_ENABLED` and `MUSIC_DISABLED_SOURCES` used during grooming.
- **Runtime override**: the env value is the default; a bot-owner override must be able to flip it without a redeploy.
- **Not published to npm**: the extracted package stays `"private": true` inside the workspace.
- **Wording**: ticket text and user-facing messages stay neutral ("source disabled"), not YouTube-specific where avoidable.

## 2. Current State & Verification

No code changes yet. Findings from the code audit that the tasks rely on:

### Two playback paths

1. **Lavalink path (production)**. When Lavalink is connected, [music-player.service.ts:280](file:///Z:/Projects/ririko-v2-2026/packages/music/src/player/music-player.service.ts) calls `lavalinkService.play()` and returns. The TypeScript extractor pipeline is never used on this path. YouTube support here comes from the Java `youtube-plugin`, not from our code.
2. **In-process path (fallback)**. Only when Lavalink is down, [music-player.service.ts:299](file:///Z:/Projects/ririko-v2-2026/packages/music/src/player/music-player.service.ts) calls `pipeline.resolve()`, which uses our TypeScript adapters.

Consequence: moving the TypeScript YouTube code out (TASK-1722) does **not** stop YouTube playback on the Lavalink path. TASK-1721 is the change that matters for production.

### Where YouTube is wired in on the Lavalink path

- [lavalink-service.ts:232](file:///Z:/Projects/ririko-v2-2026/packages/music/src/lavalink/lavalink-service.ts): `defaultSearchPlatform: 'ytsearch'` is hardcoded.
- [lavalink-service.ts:17](file:///Z:/Projects/ririko-v2-2026/packages/music/src/lavalink/lavalink-service.ts): track mapping falls back to building `youtube.com` URLs and thumbnails.
- `lavalink/application.yml`:
  - `plugins.youtube` (enabled, with `remoteCipher`, `oauth` and a client list).
  - `lavalink.server.youtubeSearchEnabled: true`.
  - `plugins.lavasrc.providers` resolves Spotify tracks through `ytsearch:"%ISRC%"` and `ytsearch:%QUERY%` before `scsearch:%QUERY%`, so Spotify links play YouTube audio today.
  - `plugins.lavasrc.sources.youtube`, `lavalyrics.sources` and `lavasrc.lyrics-sources` include YouTube.

### Where YouTube is wired in on the in-process path

- [pipeline.ts](file:///Z:/Projects/ririko-v2-2026/packages/music/src/extractors/pipeline.ts):
  - The constructor always registers `new YouTubeAdapter(options.youtubeOptions)` in the default adapter set.
  - `wireMetadataResolution()` uses `instanceof YouTubeAdapter` to attach Spotify as the metadata resolver.
  - `resolve()` falls back through `?? this.getAdapter('youtube')`.
  - The Spotify/Deezer stream bridge tries the `youtube` adapter first and falls back to `soundcloud`. It looks adapters up by id, so it already tolerates a missing YouTube adapter.
- [types.ts](file:///Z:/Projects/ririko-v2-2026/packages/music/src/types.ts): `ExtractorPipelineOptions.youtubeOptions`; `CanonicalMetadataResolver` is an alias of `MusicSourceAdapter`.
- [music-player.service.ts:29,55](file:///Z:/Projects/ririko-v2-2026/packages/music/src/player/music-player.service.ts): passes `youtubeOptions` into the pipeline. It already accepts a prebuilt `pipeline` option.
- [apps/bot/src/services.ts:386](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/services.ts): the bot composition root passes `YOUTUBE_COOKIE`, `YOUTUBE_PO_TOKEN` and `YOUTUBE_VISITOR_DATA` as `youtubeOptions`.

### Files that move in TASK-1722

From `packages/music/src/extractors/`:

| File | Notes |
|---|---|
| `youtube.adapter.ts` (698 lines) | Imports `PrecisionTrackMatcher` and shared types; the new package imports these from `@ririko/music`. |
| `po-token.service.ts` | Also exports `generateYouTubePoToken`, used by the CLI. |
| `cookie-rotator.ts`, `client-spoofing.ts` | Used only by the YouTube adapter. |
| `po-token.test.ts`, `cookie-rotator.test.ts` | Move with the code. |
| YouTube cases in `extractors.test.ts` | Move; the rest of that file stays. |

Dependencies that move from `packages/music/package.json`: `youtubei.js`, `@distube/ytdl-core`, `jsdom`, `youtube-po-token-generator`. **`play-dl` stays**: `soundcloud.adapter.ts` and `spotify.adapter.ts` also import it.

Other consumers that must be rewired:

- [apps/cli/src/commands/generate-po-token.ts](file:///Z:/Projects/ririko-v2-2026/apps/cli/src/commands/generate-po-token.ts) and [apps/cli/src/youtube/browser-harvester.ts](file:///Z:/Projects/ririko-v2-2026/apps/cli/src/youtube/browser-harvester.ts) import `generateYouTubePoToken` from `@ririko/music`.
- `extractors.test.ts`, `cookie-rotator.test.ts` (line 150) and `music-player.service.test.ts` pass `youtubeOptions: { autoGeneratePoToken: false }` to stay offline.

### Workspace facts

- `pnpm-workspace.yaml` globs `packages/*`, and `vitest.config.ts` includes `packages/**/*.test.ts` with coverage over `packages/*/src/**`. A new package is picked up automatically.
- The root [tsconfig.json](file:///Z:/Projects/ririko-v2-2026/tsconfig.json) lists project references explicitly. The new package must be added there, and to the `references` of `apps/bot` and `apps/cli`.

## 3. Roadblocks, Gotchas & Decisions Made

- **`lavalink/application.yml` is generated, not hand-edited.** It is gitignored and written by [scripts/lavalink-setup.ts](file:///Z:/Projects/ririko-v2-2026/scripts/lavalink-setup.ts) (template from about line 115, written at line 270). `scripts/lavalink-start.ts` calls `setupLavalink()` on every start, so hand edits are overwritten. The switch belongs in the generator.
- **Plugin jars are copied, not only declared.** The setup script syncs every `.jar` from `.local/how-to-setup-lavamusic/Lavalink/plugins` into `lavalink/plugins`. Setting `plugins.youtube.enabled: false` disables the plugin, but the jar is still loaded. To drop it completely, skip it in both the dependency list and the jar sync.
- **Lavalink reads config only at startup.** Changing the switch needs a Lavalink restart. The bot-side runtime override cannot change Lavalink's plugin set live, so the bot must also refuse YouTube URLs and stop using `ytsearch` on its own.
- **Spotify quality drops when YouTube is off.** With the `ytsearch` providers removed, lavasrc and the in-process Spotify bridge fall back to SoundCloud matches, which are less exact than ISRC matches.
- **Out of scope**: YouTube live-stream alerts (`packages/services/src/stream-platforms/adapters/youtube.adapter.ts`, `apps/bot/src/commands/streams/stream.command.ts`, CLI doctor `youtubeStreamCheck`). They use the YouTube Data API and RSS and are unrelated to music.
- **ID gap**: `STORY-171` is intentionally unused. `TASK-1711` to `TASK-1715` already belong to `STORY-170`, so STORY-171's tasks would have collided.
- **Estimate risk**: TASK-1722 stays at 2 pts only if TASK-1721 already moves adapter registration into the bot composition root. Otherwise re-estimate TASK-1722 at 3 pts and the story at 8.

### Open decisions for the maintainer

1. **Default value of `USE_PRIVATE_MUSIC_PACKAGE`.** Recommended: `false` (opt-in). This changes behavior for existing self-hosters, who lose YouTube until they set it to `true`, so it needs a release note.
2. **Package name.** The ticket says `@ririko/music-youtube`. `@ririko/music-private` matches the switch name and the neutral wording. Not decided.

### Related findings (not part of this story)

- `LavalinkService` builds `LavalinkManager` with a single node from `LAVALINK_HOST`. `lavalink-client` supports several nodes; multi-node config is a small follow-up for production scaling.
- Both [lavalink-service.ts:206](file:///Z:/Projects/ririko-v2-2026/packages/music/src/lavalink/lavalink-service.ts) and `apps/bot/src/services.ts` fall back to the default Lavalink password `youshallnotpass`. Production should require a real secret and refuse to start without one.
- `plugins.youtube.remoteCipher` points at a public third-party instance (`https://cipher.kikkia.dev/`). A self-hosted instance next to Lavalink removes that external dependency.
- The generated `application.yml` holds the Spotify `clientSecret` and `spDc` in plain text on disk. It is not tracked by git, but a production Lavalink host should get these from environment variables.
- Production deployment plan (EPIC-012) assumes Lavalink runs on its own host(s), reached over a private network, separate from the bot, web, PostgreSQL and Redis.

## 4. Actionable Next Steps for Next Session / Continuing Agent

Check the WIP limit first: no other ticket may be `IN_PROGRESS`. Branch `feat/STORY-172-music-source-toggles` from `develop/2.0.0`.

### TASK-1721 (3 pts)

1. Add `USE_PRIVATE_MUSIC_PACKAGE` to the env schema, and a bot-owner runtime override that needs no redeploy.
2. In `ExtractorPipeline`, export a `createStandardAdapters()` helper without YouTube. Build the pipeline in `apps/bot/src/services.ts` from that helper plus the YouTube adapter only when the switch is on. Pass it to `MusicPlayerService` through the existing `pipeline` option.
3. In `LavalinkService`, choose `defaultSearchPlatform` from the switch (`scsearch` when off). Stop synthesizing `youtube.com` URLs when YouTube is off.
4. In the music commands, reject URLs from a disabled source with a clear message before they reach Lavalink or the pipeline.
5. In `scripts/lavalink-setup.ts`, when the switch is off: omit the YouTube plugin dependency and skip its jar, set `youtubeSearchEnabled: false`, reduce lavasrc providers to `scsearch:%QUERY%`, and remove YouTube from lavasrc sources and both lyrics source lists.
6. Tests: each disabled-source path (URL rejection, search platform, pipeline fallback to SoundCloud, generator output with the switch on and off).

### TASK-1722 (2 pts)

1. Create `packages/music-youtube` (or the name the maintainer picks) with `"private": true`, depending on `@ririko/music`. `@ririko/music` must never depend on it.
2. Move the files, tests and dependencies listed in section 2.
3. Replace the `instanceof YouTubeAdapter` check with an optional `setMetadataResolver?()` method on `MusicSourceAdapter`. Remove `youtubeOptions` from `ExtractorPipelineOptions` and `MusicPlayerService`.
4. Rewire `apps/bot` and the CLI (`generate:po-token`, browser harvester). Add tsconfig references.
5. Add a test that `@ririko/music` resolves searches and bridges Spotify with no YouTube adapter registered.
6. Verify `packages/music` builds with the new package removed from the workspace.

### Both tasks

Run `pnpm build`, `pnpm typecheck`, `pnpm lint` and `pnpm test:coverage`; every threshold in `vitest.config.ts` must pass. Note for STORY-121: the Dockerfile must copy the new package, or build without it for an image with no YouTube support.
