# Handover Note: STORY-172 Per-Source Music Toggles & Pluggable Source Adapters

- **Ticket Type & Points**: Story | 5 pts (parent `EPIC-005`; `TASK-1721` 3 pts, `TASK-1722` 2 pts, re-estimate to 5 proposed)
- **Author / Agent**: Claude Code
- **Status**: IN_PROGRESS (`TASK-1721` in REVIEW on the feature branch; `TASK-1722` TODO, waiting on maintainer decisions)
- **Timestamp**: 2026-09-30T02:20:00Z

## 1. Summary of Work Accomplished

### Goal

YouTube playback stays on Lavalink (`youtube-plugin`). The in-process YouTube fallback extractor (PO tokens, cookie rotation, client spoofing, browser harvesters) leaves the public open source project and is loaded only by operators who have the private code.

### Decisions made with the maintainer

- **Switch**: `USE_PRIVATE_MUSIC_PACKAGE`, default `false`. It controls only the in-process fallback player that runs when Lavalink is unavailable, and it must also control whether the private code is imported at all. It never affects Lavalink.
- **Lavalink YouTube stays on.** Music features keep working as before through Lavalink. The earlier plan to switch YouTube off inside Lavalink (search platform, URL rejection, plugin removal) is dropped.
- **No runtime override**: the flag decides which code is imported, so it is read at startup only.
- **Cipher (option A)**: the installer ships no remote cipher URL. Without `LAVALINK_YOUTUBE_CIPHER_URL`, the YouTube plugin uses its built-in signature cipher and the config only shows a commented `https://example.com/` example. The maintainer's own cipher stays in their local `.env` and generated `application.yml`.
- **Private means a separate repository.** A `"private": true` workspace package inside this public repository is still readable by everyone; `private` only blocks `npm publish`. `TASK-1722` must move the code to a separate private repository.
- **Not published to npm.**
- **Wording**: ticket text and user-facing messages stay neutral.

### TASK-1721 (done on `feat/STORY-172-music-source-toggles`)

- [pipeline.ts](file:///Z:/Projects/ririko-v2-2026/packages/music/src/extractors/pipeline.ts): new `createStandardAdapters()` (SoundCloud, Spotify, Deezer, Direct). The pipeline no longer imports `YouTubeAdapter`. Spotify metadata is handed to every adapter that implements the new optional `setMetadataResolver()`.
- [types.ts](file:///Z:/Projects/ririko-v2-2026/packages/music/src/types.ts): optional `setMetadataResolver?()` on `MusicSourceAdapter`; `youtubeOptions` removed from `ExtractorPipelineOptions`.
- [music-player.service.ts](file:///Z:/Projects/ririko-v2-2026/packages/music/src/player/music-player.service.ts): `youtubeOptions` removed; the default pipeline has no YouTube adapter.
- [apps/bot/src/music-sources.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/music-sources.ts): `createMusicPipeline(env)` adds the YouTube adapter (with `YOUTUBE_COOKIE`, `YOUTUBE_PO_TOKEN`, `YOUTUBE_VISITOR_DATA`) only when `USE_PRIVATE_MUSIC_PACKAGE=true`. [services.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/services.ts) passes it to `MusicPlayerService`. The import is still static; `TASK-1722` makes it dynamic.
- [schema.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/schema.ts) and [.env.example](file:///Z:/Projects/ririko-v2-2026/.env.example): `USE_PRIVATE_MUSIC_PACKAGE` (default `false` in the example) and `LAVALINK_YOUTUBE_CIPHER_URL`.
- [scripts/lavalink-setup.ts](file:///Z:/Projects/ririko-v2-2026/scripts/lavalink-setup.ts): `renderYouTubeCipherConfig()` writes `remoteCipher` only when `LAVALINK_YOUTUBE_CIPHER_URL` is set, JSON-quoted so the value cannot break the YAML.
- The public third-party cipher URL was removed from the installer and from the [TASK-0530](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0530.md) handover. It remains in git history.
- Behavior change: with the flag off, the bot no longer constructs the YouTube adapter at startup, so it no longer starts background PO-token generation and rotation while Lavalink does the playing.

## 2. Current State & Verification

- Branch `feat/STORY-172-music-source-toggles` from `develop/2.0.0` at `6d2d0dd`. Not pushed.
- `pnpm build`, `pnpm typecheck`, `pnpm lint` (0 errors) and `pnpm test:coverage` pass: 261 test files, 2531 tests, all coverage thresholds met. Prettier passes on the changed files.
- New tests: [pipeline.test.ts](file:///Z:/Projects/ririko-v2-2026/packages/music/src/extractors/pipeline.test.ts), [music-sources.test.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/music-sources.test.ts), [lavalink-setup.test.ts](file:///Z:/Projects/ririko-v2-2026/scripts/lavalink-setup.test.ts). `music-player.service.test.ts` and `cookie-rotator.test.ts` no longer need the PO-token opt-out because the default pipeline has no YouTube adapter.
- Not verified live: a Lavalink restart with the regenerated config and the built-in cipher. Check the Lavalink log for cipher errors after running `pnpm lavalink:install` without `LAVALINK_YOUTUBE_CIPHER_URL`.

### Two playback paths (audit)

1. **Lavalink path (production)**. When Lavalink is connected, [music-player.service.ts](file:///Z:/Projects/ririko-v2-2026/packages/music/src/player/music-player.service.ts) `play()` hands the query to `lavalinkService.play()` and returns. YouTube support comes from the Java `youtube-plugin`.
2. **In-process path (fallback)**. Only when Lavalink is down does `play()` call `pipeline.resolve()`, which uses the TypeScript adapters.

### Effect of the cipher on Lavalink

- Search (`ytsearch`, `ytmsearch`, lavasrc Spotify-to-YouTube matching), URL and playlist loading, and lyrics do not use the cipher.
- `ANDROID_VR` and `ANDROID_MUSIC` return plain stream URLs. `ANDROID_VR` is first in the client list, so most playback does not use the cipher.
- The web-family clients (`TV`, `MWEB`, `WEB`, `TVHTML5_SIMPLY`, `WEBEMBEDDED`) need it. They handle videos `ANDROID_VR` refuses (age-restricted videos, some official music videos). With the built-in cipher these work as long as the plugin can parse YouTube's current player script.

## 3. Roadblocks, Gotchas & Decisions Made

- **Correction to the grooming note**: [scripts/lavalink-start.ts](file:///Z:/Projects/ririko-v2-2026/scripts/lavalink-start.ts) runs the installer only when `lavalink/Lavalink.jar` is missing, not on every start. The gitignored `lavalink/application.yml` is rewritten only by `pnpm lavalink:install` (or a first start). Operators with a hand-tuned file keep it until they reinstall; set `LAVALINK_YOUTUBE_CIPHER_URL` in `.env` so a reinstall reproduces the cipher.
- **Fallback without the private package**: with the flag off and Lavalink down, YouTube links fail with `No compatible music extractor found for URL`, text search uses SoundCloud, and Spotify and Deezer links bridge to SoundCloud (less exact matches).
- **Git history**: the extractor code stays in this repository's history. Removing it from history needs a force-push rewrite of a public repository and is not planned.
- **Docker images**: an image built with the private package contains its JavaScript. Such an image must be built and stored privately (relevant to `STORY-121`).
- **Out of scope**: YouTube live-stream alerts (`packages/services/src/stream-platforms/adapters/youtube.adapter.ts`, `apps/bot/src/commands/streams/stream.command.ts`, CLI doctor `youtubeStreamCheck`) use the YouTube Data API and RSS and stay public.
- **ID gap**: `STORY-171` is intentionally unused because `TASK-1711` to `TASK-1715` belong to `STORY-170`.

### Proposed TASK-1722 design (needs maintainer approval)

1. **Private repository** (for example `RirikoAI/ririko-music-private`), cloned into the gitignored path `packages/music-private/`.
2. **Moves there**: `youtube.adapter.ts`, `po-token.service.ts`, `cookie-rotator.ts`, `client-spoofing.ts`, `po-token.test.ts`, `cookie-rotator.test.ts`, the YouTube cases from `extractors.test.ts`, the dependencies `youtubei.js`, `@distube/ytdl-core`, `jsdom` and `youtube-po-token-generator` (`play-dl` stays public: SoundCloud and Spotify use it), the CLI `generate:po-token` command, `apps/cli/src/youtube/` harvesters, the YouTube credential section of `.env.example`, and the PO-token and cookie sections of `docs/music.md`.
3. **Runtime contract**: the private package exports a factory that returns `MusicSourceAdapter[]`. It imports `@ririko/music` for types only; runtime helpers it needs (`PrecisionTrackMatcher`) are passed in, so it resolves nothing from the public workspace at runtime.
4. **Loading**: `createMusicPipeline` becomes async and runs `await import()` on the private entry point only when `USE_PRIVATE_MUSIC_PACKAGE=true` (path overridable, for example `PRIVATE_MUSIC_PACKAGE_PATH`). When the package is missing, the bot logs a warning and starts without it.
5. **Public repository isolation**: `.gitignore`, `pnpm-workspace.yaml` (`!packages/music-private`, so `pnpm-lock.yaml` never records it), `vitest.config.ts` test and coverage excludes, and the ESLint ignore list. No tsconfig reference and no `package.json` dependency on it.
6. **Proof**: public `pnpm install --frozen-lockfile`, build, lint and `test:coverage` pass without the folder; the bot loads the adapters with it.

### Open decisions for the maintainer

1. Approve the separate private repository, its name, and who creates it.
2. Approve re-estimating `TASK-1722` from 2 to 5 pts (story 5 to 8 pts).

## 4. Actionable Next Steps for Next Session / Continuing Agent

1. Get answers to the open decisions above.
2. Implement `TASK-1722` on `feat/STORY-172-music-source-toggles` following the proposed design.
3. Run `pnpm build`, `pnpm typecheck`, `pnpm lint` and `pnpm test:coverage` with and without `packages/music-private/`.
4. Move `STORY-172` to REVIEW, update this note, and ask the maintainer before pushing the branch and opening a PR to `develop/2.0.0`.
