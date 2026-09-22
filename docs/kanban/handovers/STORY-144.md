# STORY-144 Handover Note: Anime Image Commands Parity (/waifu & /wallpaper) on REST APIs

- **Ticket ID**: `STORY-144` (tasks `TASK-1441`, `TASK-1442`)
- **Ticket Type**: Story
- **Parent Epic**: `EPIC-014: Server Utilities, AutoRoles & Community Systems`
- **Story Points**: 3 (1 + 2)
- **Completed On**: 2026-09-22
- **Target Branch**: `develop/2.0.0` (branched from `feat/STORY-142-anime-search`)

---

## 1. Summary of Work Done
Restores the last two 1.4.0 anime commands, which were not on any ticket before EPIC-014 grooming.

1. **TASK-1441, waifu.im client and `/waifu`**:
   - `WaifuImClient` moved from `waifu-tcg/ingestion/` to `packages/services/src/anime/waifu-im.client.ts`. It was rewritten for the **waifu.im v7 API**. The old `/search` endpoint now answers HTTP 403 with a Cloudflare challenge, so the previous client could no longer fetch anything.
   - The client uses `GET /images?IncludedTags=…&IsNsfw=False&OrderBy=Random&PageSize=n`. Its private retry loop is replaced by the shared `http/fetchWithRetry` (500 ms limiter, timeout, User-Agent).
   - It returns a typed `WaifuImImage` (id, url, tags with slugs, artists, favorites, NSFW flag). `WAIFU_IM_SFW_TAGS` is the only tag list offered to users.
   - Waifu TCG ingestion now imports the shared client. Its metadata heuristic moved out of the client into `extractWaifuImMetadata` in `ingestion-service.ts`, since it is TCG-specific. The old `WaifuIm*` types were removed from `waifu-tcg/types.ts`.
   - `/waifu [tag]`: default tag `selfies` (legacy parity), legacy embed layout (title, image, source link, Tags, Favorites, artist in the author line), an **Another one** button for the invoker, and a footer hint to `/tcg-info`. Unknown tags are rejected before any request.
2. **TASK-1442, Wallhaven client and `/wallpaper`**:
   - `WallhavenClient` (`anime/wallhaven.client.ts`) always sends `categories=010` (anime) and `purity=100` (SFW), and drops any non-SFW item. It sorts by relevance for a query and at random otherwise. The limiter is 1.4 s, inside Wallhaven's 45 req/min.
   - `/wallpaper [search]` (alias `wallpapers`): ◀️/▶️ pager over the result page, a **Full resolution** link button, and an embed with resolution, favorites, views and source. The search term is optional (1.4.0 required it).
3. **Shared bot helpers**:
   - `apps/bot/src/commands/anime/owner-collector.ts` (`attachOwnerCollector`) now owns the invoker-only collector logic (hint to other users, timer reset, components removed on expiry) for `/anime`, `/manga`, `/anime-character`, `/waifu` and `/wallpaper`.
   - `httpUrl` in `embeds.ts` guards every upstream URL before it reaches the discord.js builders.
   - Test helpers live in `__tests__/helpers.ts`.
4. Bot wiring: `services.waifuImClient` and `services.wallhavenClient`, both with `maxRetries: 1` and a 5 s timeout. Docs: `docs/commands.md` §6.2 and §6.3.

## 2. Verification
- `pnpm build`, `pnpm typecheck`: pass. `pnpm lint`: 0 errors (534 warnings, one fewer than before), and no warnings in changed files.
- `pnpm exec vitest run`: 1368/1369 pass. The one failure is the known live-network Spotify album test in `packages/music`, which is unrelated.
- New or updated tests:
  - `waifu-im.client.test.ts`: v7 query parameters, mapping, User-Agent, page-size clamp, NSFW opt-in, 429 retry, 403 throws, download.
  - `wallhaven.client.test.ts`: pinned category and purity, relevance or random sorting, SFW filter, errors.
  - `ingestion.test.ts`: v7 item shape, `extractWaifuImMetadata`.
  - `waifu.command.test.ts` and `wallpaper.command.test.ts`: embeds, allowlist, invoker-only buttons, paging bounds, URL guard, outage messages.
- Live checks (2026-09-22):
  - waifu.im `/images` returned SFW images for `selfies`, `maid` and `raiden-shogun`, and they rendered through `buildWaifuEmbed`.
  - Wallhaven returned 24 results for "frieren" and for random. All 24 "Genshin Impact" results rendered through `buildWallpaperEmbed`.

## 3. Gotchas
- **waifu.im changed its API.** `/search` is dead (403, Cloudflare challenge). Anything outside this repo that still calls it will fail. The v7 query parameters are PascalCase (`IncludedTags`, `IsNsfw`, `OrderBy`, `PageSize`).
- `IngestionService.ingestFromWaifuIm` has **no production caller**. The Waifu TCG catalog now comes from AniList and Danbooru (`waifu-tcg/catalog`), and `scripts/db-reset.ts` only uses `seedCanonicalAssets` (no network). It was kept working on the new client but may be dead code. Decide whether to remove it in a separate chore.
- The legacy `/wallpaper` source picker (five scraped sites) is not reproduced. Wallhaven is the only source; there is no fallback.
- waifu.im serves adult tags too (`ero`, `hentai`, …). Only the allowlist is exposed, and `IsNsfw=False` is always sent from the command.

## 4. Next Steps
- EPIC-014 remaining: **STORY-141** (reminders; open decisions: `chrono-node`, timezone scope, re-estimate to 5) and **STORY-143** (utility commands and custom prefix wiring).
- Optional chore: remove `IngestionService.ingestFromWaifuIm` if it stays unused.
