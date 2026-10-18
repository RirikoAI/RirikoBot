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
   - It returns a typed `WaifuImImage` (id, url, tags with slugs, artists, favorites, NSFW flag).
   - Waifu TCG ingestion now imports the shared client. Its metadata heuristic moved out of the client into `extractWaifuImMetadata` in `ingestion-service.ts`, since it is TCG-specific. The old `WaifuIm*` types were removed from `waifu-tcg/types.ts`.
   - `/waifu`: no options, as in 1.4.0. It keeps the legacy embed layout (title, image, source link, Tags, Favorites, artist in the author line), adds an **Another one** regenerate button for the invoker, and a footer hint to `/tcg-info`. The tag is `waifu` (1,254 SFW images). The legacy `selfies` tag now has only 3 SFW images, so regenerating would loop. Each request asks for 10 random images and prefers one the user has not seen, because waifu.im repeats its random pick for a few seconds.
2. **TASK-1442, `/wallpaper` with the legacy interactive menus**:
   - Flow as in 1.4.0: search, then a source menu, then 3 random wallpapers ("Courtesy of <source>"), then a menu with **Load another wallpaper**, **Select another source**, and **No, I am done**. Improvements:
     - One message is edited in place instead of stacking follow-ups.
     - Wallpapers are never repeated within a search.
     - Further pages are fetched only when the current page runs out.
     - A failing or empty source leads back to the source menu with a note.
     - Only the invoker can use the menus.
   - `WallpaperService` / `WallpaperSession` (`anime/wallpaper.service.ts`): a source registry (`WALLPAPER_SOURCES`) and per-search progress for each source (page, unshown pool, seen ids). It also resolves lazy image URLs.
   - Sources, all SFW-only JSON APIs, all on `http/fetchWithRetry` with their own limiters:
     - `WallhavenClient`: anime category, SFW purity, sorted by relevance, 1.4 s spacing (45 req/min).
     - `ZerochanClient`: JSON API with an identifying `RirikoBot - RirikoAI` User-Agent. It follows alias-tag redirects (which drop `?json`) and derives the 600px JPEG URL from the canonical tag, falling back to the detail endpoint for unusual tags.
     - `KonachanClient`: konachan.net (the SFW mirror), one tag plus `rating:safe`, keeping only posts rated `s`.
   - Dropped 1.4.0 sources:
     - Wallpapers.com: no API, and its search and category pages mix unrelated images (croissants on the Frieren page).
     - MoeWalls: Cloudflare challenge.
     - Pinterest: rejects API requests.
   - The shared `Wallpaper` model is in `anime/types.ts`.
3. **Shared bot helpers**:
   - `apps/bot/src/commands/anime/owner-collector.ts` (`attachOwnerCollector`) now owns the invoker-only collector logic (hint to other users, timer reset, components removed on expiry) for `/anime`, `/manga`, `/anime-character`, `/waifu` and `/wallpaper`.
   - `httpUrl` in `embeds.ts` guards every upstream URL before it reaches the discord.js builders.
   - Test helpers live in `__tests__/helpers.ts`.
4. Bot wiring: `services.waifuImClient` and `services.wallpaperService` (WallHaven, Zerochan and Konachan clients), all with `maxRetries: 1` and a 5 s timeout. Docs: `docs/commands.md` §6.2 and §6.3.

## 2. Verification
- `pnpm build`, `pnpm typecheck`: pass. `pnpm lint`: 0 errors (534 warnings, one fewer than before), and no warnings in changed files.
- `pnpm exec vitest run`: 1378/1379 pass. The one failure is the known live-network Spotify album test in `packages/music`, which is unrelated.
- New or updated tests:
  - `waifu-im.client.test.ts`: v7 query parameters, mapping, User-Agent, page-size clamp, NSFW opt-in, 429 retry, 403 throws, download.
  - `wallhaven.client.test.ts`: pinned category and purity, SFW filter, errors.
  - `zerochan-konachan.client.test.ts`: Zerochan URL, User-Agent, alias redirect, URL derivation, detail fallback, unknown tag; Konachan safe tag, rating filter, errors.
  - `wallpaper.service.test.ts`: no repeats, lazy paging, exhaustion, progress per source, lazy URL resolution.
  - `ingestion.test.ts`: v7 item shape, `extractWaifuImMetadata`.
  - `waifu.command.test.ts`: legacy embed, regenerate for the invoker only, prefers an unseen image, outage.
  - `wallpaper.command.test.ts`: source menu, results, load more, switch source, done, failure and empty paths, invoker only, empty query, embed stats.
- Live end-to-end (2026-09-22): the real `/wallpaper` and `/waifu` commands ran against the live APIs through a fake Discord context. Every payload passed discord.js `toJSON` validation.
  - `/wallpaper`: search "Frieren", then WallHaven with load more, Zerochan with load more, Konachan with load more, then another source, then done.
  - `/waifu`: first image and a regenerate.
  - Derived Zerochan and Konachan image URLs answer 200 to Discord's crawler User-Agent.
  - Alias and multi-word queries ("Fern (Sousou no Frieren)", "raiden shogun") return results on all three sources.

## 3. Gotchas
- **waifu.im changed its API.** `/search` is dead (403, Cloudflare challenge). Anything outside this repo that still calls it will fail. The v7 query parameters are PascalCase (`IncludedTags`, `IsNsfw`, `OrderBy`, `PageSize`).
- `IngestionService.ingestFromWaifuIm` has **no production caller**. The Waifu TCG catalog now comes from AniList and Danbooru (`waifu-tcg/catalog`), and `scripts/db-reset.ts` only uses `seedCanonicalAssets` (no network). It was kept working on the new client but may be dead code. Decide whether to remove it in a separate chore.
- The `/wallpaper` source picker offers 3 sources instead of 1.4.0's 5 (see above). MoeWalls live wallpapers (videos) have no replacement.
- Konachan's `rating:safe` is the site's own rating. Some safe-rated posts are suggestive (swimsuits, onsen); WallHaven and Zerochan are stricter.
- waifu.im serves adult tags too (`ero`, `hentai`, …). The command always sends `IncludedTags=waifu` and `IsNsfw=False`.

## 4. Next Steps
- EPIC-014 remaining: **STORY-141** (reminders; open decisions: `chrono-node`, timezone scope, re-estimate to 5) and **STORY-143** (utility commands and custom prefix wiring).
- Optional chore: remove `IngestionService.ingestFromWaifuIm` if it stays unused.
