# Handover Note: STORY-118 Session Management, Sign-In & Change Alerts, Browser Hardening & Authorization Coverage

- **Ticket Type & Points**: Story | 5 pts (`TASK-1172` = 2, `TASK-1173` = 3)
- **Epic**: `EPIC-011`
- **Author / Agent**: Claude Code (Opus 5.5)
- **Status**: DONE (merged in PR #645)
- **Timestamp**: 2026-09-25
- **Branch**: `feat/STORY-118-session-hardening` (targets `develop/2.0.0`)
- **Decisions**: [ADR-013](file:///Z:/Projects/ririko-v2-2026/docs/adr/ADR-013-dashboard-sessions-and-credential-theft-defense.md) (including the 2026-09-25 revision); details in [docs/dashboard.md](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md) §2.2, §2.4 and §7.

## 1. Summary of Work Accomplished

### TASK-1172: Sessions page, alerts, change notices
- **Active sessions page:** [/account/sessions](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/account/sessions/page.tsx) lists the user's live sessions: browser, IP, sign-in and last-active times, with the current one marked.
  - [actions.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/account/sessions/actions.ts): `revokeSession(id)` (not the current session) and `revokeOtherSessions()`.
  - Both actions use `checkDashboardRequest` and `requireSession`, and no step-up, so a user can always end a stolen session.
  - Revokes are audited as `web.session.revoke` and `web.session.revoke_all`.
  - `AccountNav` links the Passkeys and Sessions pages.
- **Repositories and service:**
  - `WebSessionRepository`: `listByUser`, `deleteForUser(userId, id)` (scoped, so a client-supplied ID cannot end another user's session) and `deleteOthersForUser`.
  - `SessionService`: `listForUser` (live sessions only; shares `isLive` with `resolve`), `revokeForUser` and `revokeOthers`.
- **New-device detection:**
  - A new dual-dialect `web_known_devices` table: primary key (`user_id`, `device_hash`), `first_seen_at`, `last_seen_at` (indexed).
  - [WebKnownDeviceRepository](file:///Z:/Projects/ririko-v2-2026/packages/database/src/repositories/web-known-device.repository.ts) and [KnownDeviceService](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/auth/known-devices.ts).
  - `/api/auth/callback` sets `__Host-ririko_device` (32 random bytes, 1 year, renewed at every sign-in). Only its SHA-256 is stored. Rows unseen for a year are deleted at sign-in.
  - An unknown device for that user schedules a DM.
- **DMs and notices:** [DiscordNotifier](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/discord-notifier.ts) uses the bot-token REST client.
  - `newDeviceSignIn`, `passkeyAdded`, `passkeyRemoved` (DMs through `POST /users/@me/channels`), and `guildSettingsChanged` (who, module, up to 10 field diffs, posted to `guild_settings.log_channel_id`).
  - Every call runs in `after()` from `next/server`, so responses are not delayed. Failures are logged and never thrown: Discord error 50007 is a warning, and guilds without a log channel are skipped.
  - **Injection-safe:** user-controlled text (passkey names, setting values) is inline code with backticks replaced. `allowed_mentions` is `{ parse: [] }`. The browser label comes from fixed names ([user-agent.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/user-agent.ts)), and an IP that is not an IP shows as "Unknown". A crafted passkey name, `X-Forwarded-For` or user agent therefore cannot plant a phishing link in a security DM.
- `WebServices` gained `knownDevices`, `audit` and `notifier`.

### TASK-1173: Browser hardening, taint, rate limits, coverage test
- **Headers only in [proxy.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/proxy.ts):** a per-request nonce CSP is set on the request (Next.js applies the nonce to its own scripts and stylesheets) and on the response.
  - Policy: `default-src 'self'`; `script-src 'self' 'nonce-…' 'strict-dynamic'`; `style-src 'self' 'nonce-…'` (plus `unsafe-inline` and `unsafe-eval` in development only); `img-src 'self' https://cdn.discordapp.com data: blob:`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`.
  - The matcher follows the Next.js guide: pages only, not `/api`, static files or prefetches.
- **Static headers in `next.config.ts` `headers()` for every path:** `nosniff`, `Referrer-Policy: same-origin` (stricter than the groomed `strict-origin-when-cross-origin`; same-origin POSTs still send `Origin`), COOP `same-origin`, `Permissions-Policy`, and HSTS (2 years, `includeSubDomains`) in production.
  - Both header sets live in [security-headers.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/security-headers.ts).
- **The root layout calls `await connection()`,** so every page renders per request. Without it, the prerendered `/_not-found` page had no nonces and its scripts were blocked.
- **[LocalTime](file:///Z:/Projects/ririko-v2-2026/apps/web/src/components/local-time.tsx)** fixes a hydration mismatch (React #418). Dates were formatted with the server locale in SSR and the browser locale on the client, in both the sessions list and the existing `PasskeyManager`. The server now renders UTC and the browser switches to local time after hydration (`useSyncExternalStore`).
- **Taint:** `experimental.taint: true`. `createWebServices` taints the config object reference, and with `experimental_taintUniqueValue` every credential string in it: keys matching `TOKEN`, `SECRET`, `KEY` or `PASSWORD`, each `SECRET_VAULT_PREVIOUS_KEYS` key, and `DATABASE_URL` (strings of 16 characters or more).
  - The lifetime object is the config itself, which lives as long as the process.
  - `/// <reference types="react/experimental" />` supplies the types.
- **Rate limits:** [rate-limit.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/rate-limit.ts) has an in-process token bucket, with limiters kept on `globalThis`.
  - Auth routes: 20 per IP, refilling 20 per minute. `limitAuthRequest(request)` answers 429 with `Retry-After: 60`.
  - Server Actions: a burst of 30, refilling 1 per second, per user (per IP before sign-in).
  - Buckets are pruned once there are more than 10,000.
- **`isDashboardRequest()` is replaced by `checkDashboardRequest()`.** It returns an error message or null and runs the Origin check plus the action rate limit. All actions and `saveGuildSettings` use it.
- **Coverage test:** [authorization-coverage.test.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/authorization-coverage.test.ts) with the checker in [testing/authorization-coverage.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/testing/authorization-coverage.ts), built on the TypeScript compiler API.
  - It scans every non-test source file under `apps/web/src`.
  - It follows calls through functions declared in the same file.
  - It requires a guard in every export of `'use server'` modules and `app/**/route.ts`. `requireSession` is allowed; `requireSessionForPasskeyCheck` counts only in `app/verify/actions.ts`.
  - It requires `checkDashboardRequest` (or `saveGuildSettings`) in every action.
  - The auth routes are an allowlist, and each must call `limitAuthRequest`.
  - It rejects re-exports, default exports, non-function exports and inline `'use server'` functions.
  - Fixtures prove that it fails on unguarded actions and routes. A manual mutation (removing `requireSession` from `revokeOtherSessions`) also made it fail.

## 2. Current State & Verification
- `pnpm -r typecheck` passes. ESLint shows 0 errors; its warnings are in untouched database repositories. Prettier is clean on every changed file. `next build` passes.
- **Full `vitest run`:** 198 files, 1786 tests pass.
  - One earlier run failed only on the network-bound Spotify extractor test in `packages/music` (25-second timeout). This branch does not touch it.
- **New tests:**
  - `web-known-device.repository.test.ts`, `known-devices.test.ts` and `user-agent.test.ts`.
  - `discord-notifier.test.ts`: DM flow, injection safety, 50007 handling, change notices and truncation.
  - Sessions `actions.test.ts`, the callback `route.test.ts` (a real `KnownDeviceService` on in-memory SQLite: DM for a new device, none for a known one, cookie attributes), new `SessionService` cases, and the `after()` notice in `settings-action.test.ts` and `session-guards.test.ts`.
  - `rate-limit.test.ts`, `request-context.test.ts`, `proxy.test.ts` and `authorization-coverage.test.ts`.
- **`drizzle-kit push` dry run** on a copy of the dev database: only `CREATE TABLE web_known_devices` and its index.
- **`next start` smoke test** on a DB copy with seeded sessions:
  - `/account/sessions` lists them. Revoking one, then "Sign out everywhere else", works in the browser pane and writes `web.session.revoke` to `audit_logs`.
  - Headers are present on pages and routes, and every `<script>` and stylesheet carries the nonce, including on the 404 page.
  - There are no CSP or hydration errors on the security, sessions or 404 pages. A Server Action and `navigator.credentials.create` run under the CSP (the pane has no authenticator, so the prompt closes).
  - The 21st logout POST from one IP gets 429, while another IP still gets 303.
  - A temporary edit that passed `DISCORD_CLIENT_SECRET` to a client prop failed the render with "Do not pass secrets to the client." The secret was not in the HTML, and the edit was reverted.
- **Not verified:** real Discord DMs and log-channel posts (tests use a fake REST client), and a full browser sign-in through Discord.

## 3. Roadblocks, Gotchas & Decisions Made
- **`experimental.taint` switches `app/` to React's experimental channel,** which Next.js requires for taint. Watch for React-experimental behavior differences after upgrades.
- **Every page is dynamic now** (root layout `connection()`). Nonce CSP requires it anyway, and all pages already read the session.
- **A new-device DM is sent on a user's first-ever sign-in too.** For someone who never used the dashboard, that sign-in is exactly the case worth reporting. It also means existing users get one DM after this ships.
- **Session IDs sent to the sessions page are the row keys** (SHA-256 of the cookie). A hash cannot be turned back into a cookie, and revokes are scoped to the user.
- **The rate limiter is per process** and keyed by `X-Forwarded-For`, which is spoofable unless a proxy overwrites it. This is documented in dashboard.md §7; ADR-013 already records the in-process choice.
- **Line endings:** `ddl.ts` is regenerated with LF; Git normalizes it (`core.autocrlf=true`).

## 4. Actionable Next Steps for Next Session / Continuing Agent
1. Run `pnpm db:push` on the dev database. Without `web_known_devices`, the Discord callback fails with `login_failed`.
2. Manual check with the real bot token:
   1. Sign in from a new browser or a private window: you should get a DM.
   2. Remove a passkey: DM.
   3. Save General settings in a guild that has `log_channel_id`: a notice appears in that channel.
3. Open the STORY-118 PR against `develop/2.0.0` after user review.
4. Next in the delivery order: STORY-113, then STORY-115, STORY-114, STORY-116 and STORY-112.
   - New Server Actions must call `checkDashboardRequest` and a guard, or the coverage test fails.
   - New settings pages get change notices automatically through `saveGuildSettings`.
