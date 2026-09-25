# Handover Note: STORY-118 Session Management, Sign-In & Change Alerts, Browser Hardening & Authorization Coverage

- **Ticket Type & Points**: Story | 5 pts (`TASK-1172` = 2, `TASK-1173` = 3)
- **Epic**: `EPIC-011` (Next.js 16 Web Dashboard)
- **Author / Agent**: Claude Code (Opus 5.5). This is a kickoff briefing for the next agent; replace it with the completion handover when the story reaches REVIEW.
- **Status**: TODO (not started)
- **Timestamp**: 2026-09-25
- **Prerequisite**: STORY-117 (PR #643). It must be merged into `develop/2.0.0` before this story starts.

---

## 0. First Steps for the Next Agent
1. Read [GEMINI.md](file:///Z:/Projects/ririko-v2-2026/GEMINI.md) (project rules) and [docs/kanban/protocol.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/protocol.md).
   - The WIP limit is 1.
   - Update `board.json` and `BOARD.md` on every transition, and write a handover on REVIEW or DONE.
   - Stop and ask the user before opening a PR.
2. Read [ADR-013](file:///Z:/Projects/ririko-v2-2026/docs/adr/ADR-013-dashboard-sessions-and-credential-theft-defense.md), including its **Revision 2026-09-25**, and [docs/dashboard.md](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md) §2, §3.3, §3.4 and §7.
3. `git checkout develop/2.0.0 && git pull`, then create `feat/STORY-118-session-hardening`.
4. Board housekeeping in the first commit:
   - Set `STORY-117` to `DONE` in both board files, and empty the "In Review" section.
   - Then move `TASK-1172` to `IN_PROGRESS` and set `active_in_progress_ticket` to `TASK-1172`. The parent story stays `TODO` while its tasks run; that is the precedent on this board.
5. `pnpm install`, `pnpm build`, then `pnpm db:push` on the dev database.
   - The last three stories added `web_sessions`, `guild_config_versions`, `web_passkeys` and new columns.
   - `drizzle-kit push` is interactive. Run it in a real terminal; in a non-TTY shell pass `--strict=false`.
   - SQLite only auto-creates the schema in an **empty** database file.

---

## 1. Where the Dashboard Stands (STORY-110, CHORE-1101, STORY-111, STORY-117)

### 1.1. Architecture in One Paragraph
`apps/web` is a Next.js 16 App Router app (React 19, Tailwind 4, strict TS).
- **Services:** [services.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/services.ts) builds a `server-only` singleton `getWebServices()` holding: config (`loadWebConfig`), DB client, `SecretVault`, Discord OAuth client, `SessionService`, `PasskeyService`, `UserRepository`, a bot-token `REST` client (`botRest`), `GuildAccessService`, `GuildResourceDirectory` and `GuildConfigService`.
- **No `@ririko/bot` import.** The dashboard never imports the bot; shared logic comes from `@ririko/core`, `@ririko/database` and subpath imports such as `@ririko/services/guild`.
- **Settings reach the bot through the database.** `GuildConfigService` bumps `guild_config_versions`, and the bot's `GuildConfigWatcher` polls it every 5 seconds and emits `guild:configChanged`.

### 1.2. Security Model Already in Place
| Concern | Where |
|---|---|
| Opaque sessions: SHA-256 of a 32-byte `__Host-ririko_session` cookie; Discord tokens AES-256-GCM, bound to the row | [session-service.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/auth/session-service.ts), `SecretVault` in `@ririko/core` |
| 30-minute idle and 12-hour absolute expiry; ID rotates on login and on every passkey check | `SessionService.create`, `resolve`, `completePasskeyCheck` |
| Sign-in gate (a user with a passkey must pass a check) | `requireSession` in [session.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/auth/session.ts) → `/verify` |
| Step-up (passkey check within 5 minutes) | `requireStepUp(session)` → `'ok' \| 'passkey-check-required' \| 'passkey-required'` |
| Owner guard | `requireOwner(returnTo)` (`BOT_OWNER_ID` + passkey + fresh check) |
| Guild authorization (never in `proxy.ts`) | `requireGuildAccess(guildId)` in [require-guild-access.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/guilds/require-guild-access.ts) |
| Server Action Origin check and audit actor | `isDashboardRequest()`, `requestActor()` in [request-context.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/request-context.ts) |
| Settings write path | `saveGuildSettings()` in [settings-action.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/settings-action.ts) |
| Audit | `AuditLogRepository`: `guild_config.*`, `web.passkey.add`, `web.passkey.remove`, `web.passkey.reset` |

### 1.3. Every Server Action and Route Handler Today
TASK-1173's coverage test must cover all of these.

| File | Exports | Guard used |
|---|---|---|
| `app/dashboard/[guildId]/general/actions.ts` | `saveGeneralSettings` | `saveGuildSettings` (Origin + `requireGuildAccess`) |
| `app/account/security/actions.ts` | `beginPasskeyRegistration`, `finishPasskeyRegistration`, `removePasskey` | `isDashboardRequest` + `requireSession` (+ `enrollmentState` or `requireStepUp`) |
| `app/verify/actions.ts` | `beginPasskeyCheck`, `finishPasskeyCheck` | `isDashboardRequest` + `requireSessionForPasskeyCheck` (**only** allowed here) |
| `app/api/auth/login/route.ts` | `GET` | none (starts OAuth); allowlist |
| `app/api/auth/callback/route.ts` | `GET` | sealed OAuth state cookie; allowlist |
| `app/api/auth/logout/route.ts` | `POST` | `isSameOrigin`; allowlist |

### 1.4. Useful Existing Pieces
- **Repositories:**
  - `WebSessionRepository`: `create`, `findById`, `update`, `touch`, `consumeChallenge`, `delete`, `deleteByUser`, `deleteExpired`. **There is no `listByUser` yet.**
  - `WebPasskeyRepository`: `countByUser`, `listByUser`, `deleteByUser`.
- **Bot-token REST:** `getWebServices().botRest` (`@discordjs/rest`, handles rate limits).
- **Guild log channel:** `guild_settings.log_channel_id` via `GuildSettingsRepository.findById(guildId)`. `ModerationLogService` already posts there from the bot.
- **Request helpers:** `clientIp`, `userAgent`, `isSameOrigin`, `sanitizeReturnTo` in [request.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/auth/request.ts).
- **Tests:** mock `next/headers`, `next/navigation` and `../services` the way [session-guards.test.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/auth/session-guards.test.ts) and [settings-action.test.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/settings-action.test.ts) do.
  - Root `vitest.config.ts` aliases `server-only` and `@/`.
  - [soft-authenticator.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/auth/testing/soft-authenticator.ts) produces real WebAuthn responses.

---

## 2. Scope of STORY-118 (Agreed With the User)

### TASK-1172 (2 pts): Sessions Page, Alerts, Change Notices
1. **Active sessions page** (for example `/account/sessions`, linked from `/account/security` or the user menu).
   - List the user's sessions: created, last seen, IP, user agent, with the current one marked.
   - Per-session "Sign out" and "Sign out everywhere else".
   - Add `WebSessionRepository.listByUser`, and a delete scoped to the user so an ID from the client cannot remove someone else's session.
   - Actions use `isDashboardRequest` + `requireSession`. Decide whether "sign out everywhere" needs `requireStepUp`. It is defensive, so the recommendation is **no**: a user must always be able to kill a stolen session.
2. **New-device detection:**
   - A long-lived random `__Host-ririko_device` cookie (for example 1 year), stored as SHA-256 in a new dual-dialect `web_known_devices` table (`user_id`, `device_hash`, `first_seen_at`, `last_seen_at`, primary key `(user_id, device_hash)`).
   - Set and check it in `/api/auth/callback`. An unknown device for that user triggers a DM.
3. **DMs through bot-token REST**, best effort. Users who block DMs return 403 or 50007: log and continue, never fail the request.
   - Create the DM channel with `POST Routes.userChannels()` `{ recipient_id }`, then post with `POST Routes.channelMessages(id)`.
   - Send one on a new-device sign-in (time, IP, user agent, and "If this wasn't you: sign out everywhere, secure your Discord account").
   - Send one on every passkey removal (hook into `removePasskey`). Consider one on passkey add as well: it is cheap and protects against a lockout attempt.
4. **Dashboard change notice:** after `saveGuildSettings` saves with `changes.length > 0`, post a short embed (who, which module, field diffs) to the guild's `log_channel_id`.
   - Use `after()` from `next/server` so the response is not delayed.
   - Skip when there is no log channel. Failures are logged only.
5. Everything stays in `audit_logs` as today. Add audit entries for session revokes (`web.session.revoke`, `web.session.revoke_all`).

### TASK-1173 (3 pts): Browser Hardening, Taint, Rate Limits, Coverage Test
1. **Nonce CSP and headers** in `apps/web/src/proxy.ts` (Next 16 renamed middleware to `proxy`).
   - **Headers only, never authorization** (CVE-2025-29927).
   - Follow the current Next.js "Content Security Policy" guide: generate a nonce per request, set the `Content-Security-Policy` header on both the request and the response, and Next applies the nonce to its own scripts. Pages must render dynamically, which they already do.
   - Policy: `default-src 'self'`, `script-src 'self' 'nonce-…' 'strict-dynamic'`, no `unsafe-inline` for scripts, `img-src 'self' https://cdn.discordapp.com data:`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.
   - WebAuthn needs no CSP exception.
   - Also set HSTS (production only), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (or stricter), `Cross-Origin-Opener-Policy: same-origin` and `Permissions-Policy`.
   - Check that the passkey prompt still works with COOP: it does not open popups, so it should.
2. **Taint:** enable `experimental.taint` in [next.config.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/next.config.ts). In `createWebServices`, call React's `experimental_taintUniqueValue` on `DISCORD_TOKEN`, `DISCORD_CLIENT_SECRET`, `SECRET_VAULT_KEY` and any `SECRET_VAULT_PREVIOUS_KEYS`. Every module that reads them already imports `server-only`; keep it that way.
3. **Rate limits:** an in-process token bucket, which is enough for one dashboard instance; this decision is recorded in ADR-013.
   - Key the auth routes by IP.
   - Key Server Actions by user ID, falling back to IP. Hook in beside `isDashboardRequest` so every action gets it.
   - Return 429 or an error result. Keep it small; no external store.
4. **Authorization coverage test.** It fails if any Server Action or route handler skips its guard.
   - Parse, don't regex. The `typescript` compiler API is available.
   - Find every file under `apps/web/src/app` that starts with `'use server'` and every `route.ts`.
   - For each exported function, require a call to one of `saveGuildSettings`, `requireGuildAccess`, `requireSession`, `requireStepUp` or `requireOwner`. `requireSessionForPasskeyCheck` counts only in `app/verify/actions.ts`.
   - Auth routes are an explicit allowlist.
   - Also assert that every action calls `isDashboardRequest` (or goes through `saveGuildSettings`).
   - Include a fixture that proves the test fails on an unguarded action.
   - Note: the groomed ticket text lists only `saveGuildSettings`, `requireGuildAccess`, `requireStepUp` and `requireOwner`. User-scoped actions (`/account/*`) legitimately use `requireSession`, so allow it.

### Out of Scope
- **DBSC** is STORY-119 (backlog; check browser support first).
- **Risk-based IP or user-agent re-checks and mandatory hardware keys for owners** were rejected (ADR-013 revision).
- **JWE** was rejected twice; do not reopen it.

---

## 3. Gotchas & Environment
- **OS and shells:** Windows with Git Bash and PowerShell. Bash heredocs in this environment **mangle backticks and backslashes** (a hook rewrites commands). Write files containing them with the editor/Write tool, or with a Python script saved to a file.
- **Line endings:** files are mixed CRLF and LF. When editing from scripts, keep each file's existing newline style. Several files (`apps/bot/src/main.ts`, `services.ts`, `apps/cli/src/program.ts`, `packages/database/src/schema/types/index.ts`, `pg/utilities.ts`, `guild-settings.service.ts`) already fail Prettier on `develop/2.0.0`. Do not reformat them wholesale.
- **Smoke-testing `next start`:** the dashboard needs `DISCORD_CLIENT_SECRET`, `DASHBOARD_URL` and `SECRET_VAULT_KEY` (the real `.env` has them).
  - For isolated runs, point `DATABASE_URL` at a **copy** of `data/ririko.sqlite` **plus its `-wal` file**, using a forward-slash path (`cygpath -m`). Git Bash strips backslashes.
  - To test signed-in pages without Discord, insert a `web_sessions` row whose `id` is `sha256(token)` and send `__Host-ririko_session=<token>`.
  - Stop the server by killing the process on the port. The background task wrapper does not always stop `next start`.
- **SQLite dev databases** created before these stories need `pnpm db:push`; the bot's `GuildConfigWatcher` logs errors every 5 seconds without `guild_config_versions`.
- **CI:** "CircleCI Pipeline" (no config) and "Vercel" fail on every PR, including the ones before this epic. Snyk passes. None of these are caused by branch changes.
- **Merging:** the user merges PRs. The auto-mode permission classifier blocked `gh pr merge` once ("Merge Without Review"), so the user may need to merge by hand.

---

## 4. After STORY-118 (Agreed Delivery Order)
STORY-113 → STORY-115 → STORY-114 → STORY-116 → STORY-112.
- **Adding a settings page:** follow the recipe in [docs/dashboard.md §3.4](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md). Add a schema to `GuildConfigSchemas`, a store in `GuildConfigService`, subscribe bot caches to `guild:configChanged`, then add the action, page and nav entry.
- **Sensitive writes** (moderation escalation policy, reaction-role publishing, integrations) must call `requireStepUp`, and the client must use the `withPasskeyCheck` retry pattern from [passkey-manager.tsx](file:///Z:/Projects/ririko-v2-2026/apps/web/src/components/passkeys/passkey-manager.tsx).
- **Owner console pages** (STORY-112, and the item shop in STORY-115) use `requireOwner`. Consider an action variant that returns `passkey-check-required` instead of redirecting.
- **Channel and role pickers** (`ChannelSelectField`, `RoleSelectField`) exist but are unused so far.
