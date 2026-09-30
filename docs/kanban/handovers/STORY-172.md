# Handover Note: STORY-172 Per-Source Music Toggles & Pluggable Source Adapters

- **Ticket Type & Points**: Story | 8 pts (parent `EPIC-005`; `TASK-1721` 3 pts, `TASK-1722` 5 pts, re-estimated from 2 on 2026-09-30)
- **Author / Agent**: Claude Code
- **Status**: REVIEW (PR [#667](https://github.com/RirikoAI/RirikoBot/pull/667), branch `feat/STORY-172-music-source-toggles`)
- **Timestamp**: 2026-09-30T04:10:00Z

## 1. Summary of Work Accomplished

### Goal

YouTube playback stays on Lavalink (`youtube-plugin`). The in-process YouTube fallback extractor (PO tokens, cookie rotation, client spoofing, browser harvesters) leaves the public open source project and is loaded only by maintainers who have the private code.

### Decisions made with the maintainer

- **Switch**: `USE_PRIVATE_MUSIC_PACKAGE`, default `false`. It controls only the in-process fallback player that runs when Lavalink is unavailable, and whether the private code is imported at all. It never affects Lavalink. It is read at startup (no runtime override).
- **Lavalink YouTube stays on.** Music features keep working through Lavalink as before.
- **Cipher (option A)**: the installer ships no remote cipher URL. Without `LAVALINK_YOUTUBE_CIPHER_URL`, the YouTube plugin uses its built-in signature cipher and the config shows a commented `https://example.com/` example.
- **Separate private repository**: a `"private": true` package inside this public repository would still be public source (`private` only blocks `npm publish`). The code now lives in `RirikoAI/ririko-music-private` (private; created with `gh`). Not published to npm.
- **Wording**: ticket text and user-facing messages stay neutral.

### TASK-1721 (commit `0936075`)

- [pipeline.ts](file:///Z:/Projects/ririko-v2-2026/packages/music/src/extractors/pipeline.ts): `createStandardAdapters()` (SoundCloud, Spotify, Deezer, Direct). Spotify metadata is handed to any adapter that implements the optional `setMetadataResolver()` on `MusicSourceAdapter` ([types.ts](file:///Z:/Projects/ririko-v2-2026/packages/music/src/types.ts)). `youtubeOptions` is gone from the pipeline and `MusicPlayerService`.
- [scripts/lavalink-setup.ts](file:///Z:/Projects/ririko-v2-2026/scripts/lavalink-setup.ts): `renderYouTubeCipherConfig()` writes `remoteCipher` only when `LAVALINK_YOUTUBE_CIPHER_URL` is set, JSON-quoted. Tested in [lavalink-setup.test.ts](file:///Z:/Projects/ririko-v2-2026/scripts/lavalink-setup.test.ts).
- The public third-party cipher URL was removed from the installer and from the [TASK-0530](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0530.md) handover. It remains in git history.

### TASK-1722

- **Private repository** `RirikoAI/ririko-music-private`, initial commit `5d4a891` on `main`: `youtube.adapter.ts`, `po-token.service.ts`, `cookie-rotator.ts`, `client-spoofing.ts`, the `po-token` CLI (`cli.ts`, `generate-po-token.ts`, `browser-harvester.ts`), 28 tests, and a README with the setup steps plus the YouTube cascade and credential guides moved out of `docs/music.md`. Its entry point exports `createMusicAdapters(env)`. It depends on `@ririko/music` through `link:../music` and uses the public repository's TypeScript, Vitest and offline guard (`../../vitest.setup.ts`).
- **Removed from the public repository**: the files above, `apps/cli` `generate:po-token` / `youtube:token` and `apps/cli/src/youtube/`, the dependencies `youtubei.js`, `@distube/ytdl-core`, `jsdom`, `youtube-po-token-generator`, `@types/jsdom` (music) and `playwright` (cli). `play-dl` stays: SoundCloud and Spotify use it.
- [apps/bot/src/music-sources.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/music-sources.ts): `createMusicPipeline()` is async. With `USE_PRIVATE_MUSIC_PACKAGE=true` it dynamically imports `packages/music-private/dist/index.js` (resolved from `import.meta.url`, same depth from `src` and `dist`) and appends `createMusicAdapters(process.env)`. A missing package or missing export logs a warning and the bot continues with the standard adapters. Otherwise the package is never imported. [services.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/services.ts) awaits it.
- **Isolation**: `/packages/music-private/` in `.gitignore`; `!packages/music-private` in `pnpm-workspace.yaml` (the lockfile never mentions it); ESLint ignore; `.prettierignore`; Vitest test and coverage excludes.
- **Config**: `YOUTUBE_COOKIE`, `YOUTUBE_PO_TOKEN`, `YOUTUBE_VISITOR_DATA` removed from the config schema and `.env.example` (the private README documents them). The dashboard integration `music.youtube` became `music.private` ("Private music package", configured when the flag is `true`) in [integrations.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/integrations.ts). `vitest.config.ts` sets `USE_PRIVATE_MUSIC_PACKAGE=false` for tests.
- **Docs**: [docs/music.md](file:///Z:/Projects/ririko-v2-2026/docs/music.md) sections 4 and 5 are now "Playback Paths" and "Optional Private Music Package"; `SETUP.md` and `docs/testing.md` updated.
- **Tests**: public `extractors.test.ts` no longer uses YouTube; the pipeline tests cover SoundCloud bridging and an added adapter registered as `youtube`. The pipeline health-summary tests moved to [pipeline.test.ts](file:///Z:/Projects/ririko-v2-2026/packages/music/src/extractors/pipeline.test.ts). [music-sources.test.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/music-sources.test.ts) covers flag off (never imports), flag on, missing package and missing export.

## 2. Current State & Verification

- Branch `feat/STORY-172-music-source-toggles` (TASK-1721 in `0936075`, TASK-1722 in `eaa48c2`), open as PR [#667](https://github.com/RirikoAI/RirikoBot/pull/667) against `develop/2.0.0`.
- Public: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm lint` (0 errors) and `pnpm test:coverage` pass: 259 test files, 2511 tests; statements 68.29%, branches 58.16%, functions 69.72%, lines 69.63% (thresholds 65/54/69/67).
- Private: `pnpm --dir packages/music-private install --ignore-workspace`, `build` and `test` (5 files, 28 tests) pass. `po-token --help` works.
- End to end with the built bot: flag on loads `youtube,spotify,soundcloud,deezer,direct` with Spotify wired as the metadata resolver; flag off loads the four standard adapters; flag on with `dist` removed logs the warning and loads the four standard adapters.
- The maintainer's local `.env` has `USE_PRIVATE_MUSIC_PACKAGE=true` and `LAVALINK_YOUTUBE_CIPHER_URL` set to their cipher; `packages/music-private` is cloned and built locally.
- Not verified live: a Discord session playing through the fallback player, and a Lavalink restart with a regenerated config using the built-in cipher.

### Two playback paths (audit)

1. **Lavalink path (production)**. When Lavalink is connected, `MusicPlayerService.play()` hands the query to `lavalinkService.play()` and returns. YouTube support comes from the Java `youtube-plugin`.
2. **In-process path (fallback)**. Only when Lavalink is down does `play()` call `pipeline.resolve()`, which uses the TypeScript adapters.

### Effect of the cipher on Lavalink

- Search (`ytsearch`, `ytmsearch`, LavaSrc Spotify-to-YouTube matching), URL and playlist loading, and lyrics do not use the cipher.
- `ANDROID_VR` (first in the client list) and `ANDROID_MUSIC` return plain stream URLs.
- The web-family clients (`TV`, `MWEB`, `WEB`, `TVHTML5_SIMPLY`, `WEBEMBEDDED`) need it; with the built-in cipher they work as long as the plugin can parse YouTube's current player script.

## 3. Roadblocks, Gotchas & Decisions Made

- **Installer timing**: [scripts/lavalink-start.ts](file:///Z:/Projects/ririko-v2-2026/scripts/lavalink-start.ts) runs the installer only when `lavalink/Lavalink.jar` is missing. `lavalink/application.yml` is rewritten only by `pnpm lavalink:install` or a first start.
- **Fallback without the private package**: YouTube links fail with `No compatible music extractor found for URL`, searches use SoundCloud, and Spotify and Deezer links bridge to SoundCloud.
- **Private package build order**: build the public repository first (`@ririko/music` types come from `packages/music/dist`), then the private package. Rebuild the private package when `@ririko/music` changes.
- **Private package toolchain**: it has no `typescript` or `vitest` dependency; `pnpm --dir packages/music-private build|test` resolves both from the public repository root. It only works inside a public checkout.
- **Git history**: the extractor code stays in this repository's history. Removing it needs a force-push rewrite of a public repository and is not planned.
- **Docker (`STORY-121`)**: an image that includes the private package contains its JavaScript, so such an image must be built and stored privately. The public image should be built without `packages/music-private`.
- **Stale local `dist` files** for the removed modules were deleted from `packages/music/dist` and `apps/cli/dist` (`tsc -b` does not remove outputs of deleted sources).
- **Out of scope**: YouTube live-stream alerts (`packages/services/src/stream-platforms/adapters/youtube.adapter.ts`, `apps/bot/src/commands/streams/stream.command.ts`, CLI doctor `youtubeStreamCheck`) use the YouTube Data API and RSS and stay public.
- **ID gap**: `STORY-171` is intentionally unused because `TASK-1711` to `TASK-1715` belong to `STORY-170`.

## 4. Actionable Next Steps for Next Session / Continuing Agent

1. The maintainer verifies PR #667 and merges it after CI passes.
2. After the merge, run the bot once without Lavalink and play a YouTube link and a Spotify link to confirm the fallback player with the private package.
3. Other maintainers: follow the setup steps in the private repository's README.
4. When the PR merges, move `STORY-172`, `TASK-1721` and `TASK-1722` to DONE and link the PR here.
