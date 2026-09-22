# STORY-142 Handover Note: Anime & Manga Search Service (Jikan v4 & AniList API)

- **Ticket ID**: `STORY-142` (tasks `TASK-1421`, `TASK-1422`, `TASK-1423`)
- **Ticket Type**: Story
- **Parent Epic**: `EPIC-014: Server Utilities, AutoRoles & Community Systems`
- **Story Points**: 5 (re-estimated from 3 during grooming: 2 + 2 + 1)
- **Completed On**: 2026-09-22
- **Target Branch**: `develop/2.0.0`
- **Depends On**: `CHORE-1401` (shared AniList client and `http/` rate-limit layer)

---

## 1. Summary of Work Done
Restores the 1.4.0 `anime`, `manga` and `anime-character` commands on top of the shared anime module.

1. **TASK-1421, `JikanClient`** (`packages/services/src/anime/jikan.client.ts`): Jikan v4 search and `/full` detail endpoints for anime, manga and characters, with typed subsets of the Jikan schemas. It uses its own 1 s `RateLimiter` (Jikan allows 60 req/min, per IP). Adult entries are filtered with Jikan's `sfw` flag unless requested. It returns `null` on 404 and throws on other failures, so callers can fall back.
2. **TASK-1422, `AnimeSearchService`** (`anime-search.service.ts`, `types.ts`):
   - Source-neutral models: `AnimeMediaDetails`, `AnimeCharacterSummary`, `AnimeCharacterDetails`, and `AnimeSearchResult` (which names the source that answered).
   - MyAnimeList first (parity); AniList on failure. After a Jikan failure, Jikan is skipped for 60 s (a small circuit breaker), so an outage costs one timeout instead of one per search.
   - In-memory TTL cache (10 min, 500 entries), keyed by kind, adult filter and normalised query. Failures are not cached.
   - `toPlainText` converts AniList and MAL markup to plain text. Spoiler tags become Discord `||spoilers||`.
   - `AniListClient` gained: richer media fields (popularity, start and end dates, main studios split into studios and producers, authors from staff roles), `searchCharacters`, `getCharacter(id)`, and richer `AniListCharacter` fields (native and alternative names, description, anime and manga titles, Japanese voice actors). `findCharacter` now reuses `searchCharacters` with the same 8 results and 6 media entries, so Waifu TCG matching is unchanged.
3. **TASK-1423, commands** (`apps/bot/src/commands/anime/`):
   - `/anime`, `/manga` and `/anime-character` (alias `character`) share one search, select and details flow (`runSearchFlow`).
   - Adult entries are included only in NSFW channels.
   - Only the invoker can use the menu. The menu stays under the details, and the components are removed when the 2 min collector ends.
   - Upstream URLs are checked to be http(s) before they reach the embed builders.
   - New `anime` category (`CommandCategory.ANIME`, `🌸 Anime & Manga`) in the help center.
   - Bot wiring: `services.animeSearchService`, with Jikan set to `maxRetries: 0` and a 5 s timeout, sharing the process-wide `anilistClient`.
4. Docs: `docs/commands.md` §6.

## 2. Verification
- `pnpm build`, `pnpm typecheck`: pass. `pnpm lint`: 0 errors, no new warnings in changed files.
- `pnpm exec vitest run`: 1353/1354 pass. The one failure is the known live-network Spotify album test in `packages/music` (25 s timeout), which is unrelated.
- New tests:
  - `jikan.client.test.ts`: URL building, SFW flag, limit clamp, 404 returns null, 429 throws.
  - `anime-search.service.test.ts`: Jikan mapping, fallback and cooldown, cache TTL and keys, failures not cached, character source routing, `toPlainText`.
  - `anilist.client.test.ts`: new media fields, author role filter, character splitting and de-duplication, `getCharacter` 404 returns null.
  - `apps/bot/src/commands/anime/__tests__/anime.command.test.ts`: select flow, other-user rejection, collector end, NSFW flag, empty query, outage message, character details, embed fields, URL guard.
- Live checks (2026-09-22):
  - Jikan's search endpoint returned HTTP 504 (upstream outage), while `/anime/{id}/full` and `/characters/{id}/full` answered and matched the typed shapes.
  - The service fell back to AniList for anime, manga and characters.
  - Real results rendered through the discord.js embed and menu builders without validation errors (Frieren, Berserk, One Piece, Rem).

## 3. Gotchas
- **Jikan is flaky.** Expect AniList answers during Jikan outages. The embed author line shows which source answered. Cached answers can keep showing AniList for up to 10 min after Jikan recovers.
- AniList has no age rating, so the `Rating` field only appears for MyAnimeList answers. AniList's "popularity" is a member count, not a rank; the embed labels it as members.
- Jikan's character search has no SFW filter. Characters are ordered by favourites.
- The AI `anime.search` tool still calls `anilistClient.searchMedia` directly (a single fast request). It does not go through the Jikan-first service.

## 4. Next Steps
- **STORY-144**: `/waifu` and `/wallpaper` in the `anime` category. Move `WaifuImClient` into `anime/` on `fetchWithRetry`.
- Optional: autocomplete on the `search` option, backed by the cache.
