# CHORE-1401 Handover Note: Shared AniList Client & HTTP Rate-Limit Layer

- **Ticket ID**: `CHORE-1401`
- **Ticket Type**: Chore
- **Parent Epic**: `EPIC-014: Server Utilities, AutoRoles & Community Systems` (prepares `STORY-142`)
- **Story Points**: 2
- **Completed On**: 2026-09-22
- **Target Branch**: `develop/2.0.0`

---

## 1. Summary of Work Done
The AniList client and the generic HTTP rate-limit helpers lived inside `waifu-tcg/catalog/`, even though nothing in them was TCG-specific. The AI `anime.search` tool meanwhile made its own raw, unthrottled AniList GraphQL call. This chore moves the shared pieces into feature-neutral modules and routes every AniList caller through one client.

1. **`packages/services/src/http/`** (moved from `waifu-tcg/catalog/rate-limiter.ts`): `RateLimiter` and `fetchWithRetry`. `fetchWithRetry` gains an optional per-attempt `timeoutMs` (an aborted attempt is retried like a network error) and accepts `maxRetries: undefined`.
2. **`packages/services/src/anime/`**:
   - `titles.ts`: `normalizeTitle`, `titlesMatch` (split out of the client).
   - `anilist.client.ts`: `AniListClient` with the existing `findCharacter` plus a new `searchMedia(search, { type, perPage, includeAdult })` that returns typed `AniListMedia[]` (ids incl. MAL id, titles, description, score, episodes/chapters/volumes, status, format, genres, start year, cover, site URL, adult flag). Adult media is excluded by default; `perPage` is clamped to 1-25. The constructor accepts `maxRetries` and `timeoutMs`; defaults are unchanged, so the TCG builder scripts behave as before.
   - Exported from the services root and from the new `@ririko/services/anime` subpath.
3. **Waifu TCG**: `danbooru.client.ts`, `card-catalog.ts` and `catalog-sync.ts` import from the new modules. The catalog barrel no longer re-exports the moved files (the services root still does, so `scripts/tcg-*-builder.ts` needed no change).
4. **AI `anime.search` tool** (`packages/ai`): the inline GraphQL fetch is gone. The tool only uses the injected `AnimeSearchProvider`. It reports "no match" when the provider returns null, "unreachable" when it throws, and "not available" when no provider is wired (`ToolRegistry.createDefault()` in tests), with no network call. `@ririko/ai` still does not depend on `@ririko/services`.
5. **Bot wiring** (`apps/bot/src/services.ts`): one `AniListClient` per process, tuned for interactive use (`maxRetries: 1`, `timeoutMs: 5000`), injected into `AnimeSearchTool` and exposed as `services.anilistClient` for STORY-142.

## 2. Verification
- `pnpm build`, `pnpm typecheck`: pass.
- `pnpm lint`: 0 errors, no new warnings in changed files.
- `pnpm exec vitest run`: 1330/1331 pass. The one failure is the live-network Spotify album test in `packages/music` timing out at 25 s; it passes when re-run alone and is unrelated to this change.
- New tests: `http/__tests__/rate-limiter.test.ts` (moved suite + timeout/retry case), `anime/__tests__/anilist.client.test.ts` (moved `findCharacter` suite + `searchMedia` mapping, variables, clamping, adult filter, error cases), AI tool provider-null / provider-throws / no-provider cases.
- Live smoke against `graphql.anilist.co`: `searchMedia('Frieren')` returned id 154587 "Frieren: Beyond Journey's End" (score 91, 28 eps); `findCharacter('Frieren', 'Sousou no Frieren')` resolved correctly.

## 3. Gotchas
- **One limiter per process.** AniList limits by IP. Every in-process caller must use `services.anilistClient` rather than constructing a new client, or the 2.5 s spacing no longer holds. Scripts run in their own process and keep their own client.
- Interactive AniList calls can now queue behind each other (2.5 s spacing). With `maxRetries: 1` and a 5 s timeout, a single call fails in roughly 12 s at worst instead of hanging.
- `apps/bot` typechecks against `packages/services/dist`, so run `pnpm build` after changing services exports.

## 4. Next Steps
- **STORY-142**: build `/anime`, `/manga`, `/anime-character` on `services.anilistClient` (plus Jikan v4 as planned in grooming).
- **STORY-141**: the AI `reminders.create` tool returns `scheduled: true` without persisting anything. Inject the new `ReminderService` the same way `AnimeSearchTool` now takes its provider, and share one duration parser.
- **STORY-144** (proposed): move `WaifuImClient` out of `waifu-tcg/ingestion/` and replace its private retry loop with `http/fetchWithRetry`.
- `DanbooruClient` stays in `waifu-tcg/catalog/` until a second consumer exists.
