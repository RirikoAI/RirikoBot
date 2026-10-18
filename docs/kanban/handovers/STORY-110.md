# Handover Note: STORY-110 Next.js 16 App Router Scaffold, Discord OAuth2 & Guild Authorization

- **Ticket Type & Points**: Story | 8 pts (`TASK-1101` = 3, `TASK-1102` = 3, `TASK-1103` = 2)
- **Epic**: `EPIC-011` (Next.js 16 Web Dashboard & Management Portal)
- **Author / Agent**: Claude Code (Opus 5.5)
- **Status**: REVIEW
- **Timestamp**: 2026-09-25
- **Branch**: `feat/STORY-110-web-dashboard-auth` (targets `develop/2.0.0`)

## 1. Summary of Work Accomplished

### TASK-1101: `apps/web` workspace scaffold
- New package `@ririko/web` in [apps/web](file:///Z:/Projects/ririko-v2-2026/apps/web): Next.js 16.3, React 19.3, Tailwind CSS 4, App Router under `src/app`, strict TypeScript from `tsconfig.base.json` (including `exactOptionalPropertyTypes`) with Next's required overrides (`moduleResolution: Bundler`, `jsx: preserve`, `noEmit`, `@/*` path alias).
- Root scripts `dev:web`, `build:web` (both run `tsc -b` first, because workspace packages are consumed from `dist`) and `start:web`. `pnpm typecheck` covers the package through `pnpm -r`. ESLint loads `@next/eslint-plugin-next` (core-web-vitals) for `apps/web` only. Vitest aliases `server-only` to its no-op entry.
- [next.config.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/next.config.ts) loads the root `.env` (existing environment wins), keeps `better-sqlite3` and `pg` external, and allows `cdn.discordapp.com` images.
- `@ririko/core`:
  - [schema.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/schema.ts): `WebConfigSchema` extends the app schema and requires `DISCORD_CLIENT_SECRET`, `DASHBOARD_URL` (normalised to its origin) and `SECRET_VAULT_KEY`. The bot config is unchanged, apart from the new optional `SECRET_VAULT_KEY_VERSION` (default 1) and `SECRET_VAULT_PREVIOUS_KEYS`.
  - [loader.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/loader.ts): `parseConfig(schema, env)` and `loadWebConfig()`.
  - [secret-vault.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/security/secret-vault.ts): `SecretVault`, AES-256-GCM with the `v<version>.<iv>.<tag>.<ciphertext>` format, key rotation, and a `context` string bound as additional authenticated data.
- [services.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/services.ts): a `server-only` singleton, kept on `globalThis` for dev reloads, holding config, DB client, vault, OAuth client, session service, user repository, bot REST client and guild access service.

### TASK-1102: Discord OAuth2 and server-side sessions
- New dual-dialect table `web_sessions` ([sqlite](file:///Z:/Projects/ririko-v2-2026/packages/database/src/schema/sqlite/web.ts), [pg](file:///Z:/Projects/ririko-v2-2026/packages/database/src/schema/pg/web.ts)), regenerated SQLite DDL, and [WebSessionRepository](file:///Z:/Projects/ririko-v2-2026/packages/database/src/repositories/web-session.repository.ts).
- [session-service.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/auth/session-service.ts):
  - The cookie holds 32 random bytes; the row ID is their SHA-256 hash.
  - Discord tokens are encrypted with the context `web_sessions.discord_<kind>_token:<session id>`, so a ciphertext copied to another row fails to decrypt.
  - Sessions end after 30 minutes idle or 12 hours absolute. `last_seen_at` is written at most once a minute.
  - Login rotates the session ID and lazily deletes expired rows.
  - The Discord access token is refreshed 60 seconds before it expires. Concurrent refreshes of one session share a single call, because Discord rotates refresh tokens. A `400`/`401` from the refresh ends the session.
- [discord-oauth.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/auth/discord-oauth.ts): authorization URL (`identify guilds`, `state`, PKCE S256), code exchange and refresh with HTTP Basic client authentication, `/users/@me` and `/users/@me/guilds`. Errors never echo the response body.
- [oauth-state.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/auth/oauth-state.ts): the pending login (`state`, code verifier, `returnTo`) is sealed with the vault into the 10-minute `__Host-ririko_oauth` cookie. This also acts as the signed `state` parameter.
- [request.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/auth/request.ts): `sanitizeReturnTo` (same-site paths only, no `/api/`), client IP and user agent capture, and the Origin check.
- Routes:
  - [login](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/api/auth/login/route.ts) starts the OAuth2 flow.
  - [callback](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/api/auth/callback/route.ts) checks the state and scopes, upserts the `users` row and sets `__Host-ririko_session`.
  - [logout](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/api/auth/logout/route.ts) accepts POST only, checks Origin, deletes the row and clears the cookie.
- [session.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/auth/session.ts): `getSession()` and `getCurrentUser()` are cached per request, `requireSession(returnTo)` redirects to login, and there are cookie helpers. `__Host-` cookies are cleared with the full attribute set, because browsers ignore a `__Host-` Set-Cookie without `Secure`.
- Home page with sign-in, login error messages and a user menu with sign-out.

### TASK-1103: Guild discovery and `requireGuildAccess`
- [permissions.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/guilds/permissions.ts):
  - `canManageGuild` allows the guild owner, `ManageGuild` (0x20) or `Administrator` (0x8), using a BigInt bitfield.
  - `botInviteUrl` requests the 1.4.0 invite permission set `626721090433015`, which does not include Administrator.
- [bot-guilds.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/guilds/bot-guilds.ts): lists the bot's guild IDs with the bot token through `@discordjs/rest`, paginated and cached for 60 seconds.
- [guild-access.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/guilds/guild-access.ts):
  - Filters the user's guilds to manageable ones and intersects them with the bot's guilds.
  - Caches the user's guild list for 30 seconds per session.
  - A Discord `401` ends the session.
- [ttl-cache.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/ttl-cache.ts): TTL cache that shares in-flight loads and does not cache failures.
- [require-guild-access.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/guilds/require-guild-access.ts): the guard for pages, Server Actions and route handlers.
  - Non-snowflake IDs and unauthorized guilds return 404.
  - A missing session or an ended Discord grant redirects to login with `returnTo`.
- Pages:
  - [/servers](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/servers/page.tsx): server grid. Guilds with the bot get a Manage link; guilds without it get an invite link.
  - [/dashboard/[guildId]](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/page.tsx): guarded guild landing page showing the guild name and icon only.
  - Global `not-found` and `error` pages.

### Docs
- [SETUP.md §8.1](file:///Z:/Projects/ririko-v2-2026/SETUP.md) (dashboard setup), the README script table and `.env.example`.
- [docs/dashboard.md](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md): status, config and guard TTL semantics.
- [docs/database.md §2.15](file:///Z:/Projects/ririko-v2-2026/docs/database.md): `web_sessions` columns.

## 2. Current State & Verification
- `pnpm build` (`tsc -b`), `pnpm typecheck`, `pnpm lint` (0 errors; the 566 warnings all predate this branch) and `pnpm build:web` all pass. Prettier is clean on every changed file.
- `pnpm test`: 181 files and 1680 tests pass. New suites: `secret-vault.test.ts` (8), loader web config (2), `web-session.repository.test.ts` (3), `session-service.test.ts` (11), `discord-oauth.test.ts` (4), `oauth-state.test.ts` (4), `request.test.ts` (12 cases), `guild-access.test.ts` (13).
- Smoke test with `next start`, a fake client secret and a throwaway SQLite DB:
  - `/api/auth/login` redirects to Discord with `scope=identify guilds`, `state`, `code_challenge` and `code_challenge_method=S256`, and sets the sealed `__Host-ririko_oauth` cookie (`Secure; HttpOnly; SameSite=lax; Max-Age=600`).
  - An open-redirect `returnTo` falls back to `/servers`.
  - A callback with a forged state returns a 303 to `/?error=invalid_state` and clears the OAuth cookie.
  - Logout without Origin returns 403. With the dashboard Origin it returns a 303 and clears `__Host-ririko_session`.
  - `/servers` and `/dashboard/<snowflake>` without a session, or with a forged cookie, return a 307 to login with `returnTo`. A non-snowflake guild ID returns 404.
- A read-only bot-token call to `GET /users/@me/guilds` succeeded against real Discord (3 guilds).
- **Not verified:** a full real login. The local `.env` has no `DISCORD_CLIENT_SECRET`, and the redirect URI is not registered in the Discord Developer Portal. See the next steps.

## 3. Roadblocks, Gotchas & Decisions Made
- **The dashboard does not import `@ririko/bot`.** `createBotServices` would pull discord.js gateway code, all commands, music and canvas into the Next server. STORY-111 should move the shared domain wiring out of `apps/bot/src/services.ts` into a factory in `packages/services` (for example `createDomainServices(db)`) that both apps call.
- **`apps/web` is not a `tsc -b` project reference.** Next requires `noEmit` and bundler resolution. It is covered by `pnpm typecheck` and `pnpm build:web`.
- **No `SESSION_SECRET`.** Session IDs are random and stored only as hashes, and the OAuth cookie is authenticated by the vault's AES-256-GCM. `SECRET_VAULT_KEY` (with `SECRET_VAULT_KEY_VERSION` and `SECRET_VAULT_PREVIOUS_KEYS` for rotation) is the only web secret apart from the Discord client secret.
- **Logout does not revoke the Discord token.** Discord's revocation endpoint revokes the whole authorization, which would break the user's sessions on other devices. Deleting the row makes the encrypted tokens unreachable.
- **Guard freshness:** a revoked permission takes effect within 30 seconds (user guild cache), and bot removal within 60 seconds. If STORY-111 wants zero-delay checks for sensitive Server Actions, add an option to bypass the user guild cache in `GuildAccessService` rather than a second guard.
- **Access to a guild without the bot is `'denied'` (404).** The server grid shows an invite link for those guilds instead.
- **Existing databases:** SQLite auto-migration only runs on an empty file. Existing dev databases and Postgres need `pnpm db:push` to get `web_sessions`.
- **`__Host-` cookies need HTTPS or `localhost`.** Plain-HTTP LAN IPs cannot keep a session. Safari's handling of Secure cookies on `http://localhost` is unverified.
- **`X-Forwarded-For` is recorded for information only** and is never used for authorization.
- Out of scope, as groomed into STORY-117 per ADR-013: rate limits, nonce CSP and security headers, React taint APIs, passkeys and step-up, the active sessions page and new-device alerts, and the test that every Server Action and route handler calls the guard.
- Tooling: shell heredocs in this environment strip backslashes, so write files that contain `\` (such as the `sanitizeReturnTo` test cases) with the editor tools.

## 4. Actionable Next Steps for Next Session / Continuing Agent
1. Do a real login:
   1. In the Discord Developer Portal, copy the client secret into `.env` as `DISCORD_CLIENT_SECRET`.
   2. Add `http://localhost:3000/api/auth/callback` as an OAuth2 redirect.
   3. Set `DASHBOARD_URL=http://localhost:3000` and `SECRET_VAULT_KEY=$(openssl rand -hex 32)`.
   4. Run `pnpm db:push`, then `pnpm dev:web`.
   5. Sign in, open `/servers`, then open a guild.
2. Open the STORY-110 PR against `develop/2.0.0` after user review.
3. STORY-111 (TASK-1111): extract the domain service factory described above, then build the shared Zod schemas, `GuildConfigService` and the audit writer on top of `requireGuildAccess`.
