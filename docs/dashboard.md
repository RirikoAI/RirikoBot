# Web Dashboard & Management Portal Specification (Ririko AI 2.0.0)

## 1. Overview & Fullstack Architecture
The **Ririko Management Dashboard** (`apps/web`) is a modern web application built on **Next.js 16 (App Router)** and **React 19**. It provides server administrators with complete graphical control over bot settings, server analytics, card collections, and moderation cases without requiring Discord commands.

> **Status (2026-09-25):** STORY-110 is implemented: the `apps/web` scaffold, Discord OAuth2 login, server-side sessions, the server selector and the `requireGuildAccess` guard. The module pages (STORY-111..117) are not built yet. Section 8 maps each part of this spec to its ticket. Security decisions are recorded in [ADR-013](adr/ADR-013-dashboard-sessions-and-credential-theft-defense.md). Local setup is in [SETUP.md](../SETUP.md#81-run-the-web-dashboard).

### 1.1. Integration with the Monorepo
- `apps/web` is a pnpm workspace package (`@ririko/web`) wired into `tsc -b`, ESLint and Vitest like the other apps.
- Web environment variables are validated by `loadWebConfig()` in `@ririko/core`: `DISCORD_CLIENT_SECRET`, `DASHBOARD_URL` (the OAuth redirect URI is `${DASHBOARD_URL}/api/auth/callback`) and `SECRET_VAULT_KEY` are required for the dashboard only. `SECRET_VAULT_KEY_VERSION` and `SECRET_VAULT_PREVIOUS_KEYS` rotate the vault key without breaking stored ciphertexts.
- A server-only module (`apps/web/src/lib/server/services.ts`) opens the dual-dialect database client and constructs only what the dashboard uses. It does not import `@ririko/bot`, which would pull the gateway client, commands and audio stack into the web server. When STORY-111 needs the domain services, their wiring moves out of `apps/bot/src/services.ts` into a shared factory in `packages/services` that both apps call.
- The dashboard never reimplements domain logic. It calls the same services the bot commands and the CLI call.

---

## 2. Authentication, Sessions & Guild Authorization

```text
User Browser
     │
     ▼
Discord OAuth2 Flow (/api/auth/login → /api/auth/callback)
     │ [Scopes: identify, guilds] [state + PKCE S256, sealed in a 10-minute __Host- cookie]
     ▼
Server-Side Session
 ├── __Host- cookie holds 32 random bytes (HttpOnly, Secure, SameSite=Lax, Path=/)
 └── web_sessions row keyed by SHA-256(session ID); Discord tokens encrypted with AES-256-GCM
     │
     ▼
Guild Discovery Pipeline
 ├── 1. Fetch user guilds from the Discord API (user token, server-side only)
 ├── 2. Keep guilds where the user has `ManageGuild` (0x20) or `Administrator` (0x8)
 ├── 3. Intersect with guilds the bot is in (bot-token REST, short TTL cache)
 └── 4. Render the server selector grid (invite link for guilds without the bot)
```

### 2.1. Sessions
- Sessions are opaque and stored server-side. JWT, JWE, JWKS and sealed-cookie sessions were rejected because a self-contained token cannot be revoked (see ADR-013).
- The database stores only the SHA-256 hash of the session ID, plus user ID, created, last-seen and expiry timestamps, IP, user agent, `step_up_at`, and the Discord access and refresh tokens encrypted under a versioned environment key.
- Sessions expire after **30 minutes idle** or **12 hours absolute**. The session ID rotates on login and on passkey step-up.
- Logout, per-session revoke and "sign out everywhere" take effect on the next request.

### 2.2. Authorization Rules
- Every guild page, Server Action and route handler calls `requireGuildAccess(guildId)` (`apps/web/src/lib/server/guilds/require-guild-access.ts`). It re-verifies guild ownership, `ManageGuild` or `Administrator`, and bot membership on every call. The user's guild list is cached for 30 seconds per session and the bot's guild list for 60 seconds, so a user who loses the permission on Discord is rejected within 30 seconds, and a guild the bot leaves is rejected within 60 seconds. Unauthorized and unknown guilds both return 404.
- A Discord `401` on the user's guild list (the user deauthorized the app) ends the session and sends the user back through login.
- Server Actions are public HTTP endpoints. The `guildId` from the client is never trusted until the guard has checked it.
- Next.js middleware (`proxy.ts`) is **never** the authorization layer (CVE-2025-29927 bypassed middleware-only checks). Authorization runs in the data path.
- A test enumerates every Server Action and route handler and fails if one skips the guard ([authorization-coverage.test.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/authorization-coverage.test.ts), TASK-1173). It parses each `'use server'` module and `route.ts` with the TypeScript compiler API and follows calls through functions in the same file. Every export must call `saveGuildSettings`, `requireGuildAccess`, `requireSession`, `requireStepUp` or `requireOwner` (`requireSessionForPasskeyCheck` only in `app/verify/actions.ts`), and every Server Action must also call `checkDashboardRequest`. The auth routes (login, callback, logout) are an explicit allowlist and must call `limitAuthRequest` instead. Re-exports, default exports and inline `'use server'` functions are rejected because the check cannot follow them.
- Global (non-guild) settings use an owner guard that checks the bot `ownerIds` (see Section 3.1).

### 2.3. Passkey Sign-In Gate & Step-Up
- Passkeys are optional. Once a user has at least one, every sign-in must complete a passkey check before any page or Server Action works, so a compromised Discord account alone cannot reach the dashboard.
- Removing a passkey needs a passkey check newer than 5 minutes, is audited, and sends the user a DM. There is no "keep passkeys but stop asking" setting.
- Sensitive writes always need a passkey check newer than 5 minutes: the owner console, the moderation escalation policy, reaction-role publishing, and integrations. Users without a passkey cannot perform them.
- Bot owners (`BOT_OWNER_ID`) must have a passkey to use the owner console.
- A passkey check rotates the session ID.
- Authenticators are asked for a fingerprint, face or PIN but only user presence is required, because some (for example a Windows passkey used through Edge) do not report verification (ADR-013 revision item 7, BUG-0020). Every rejected passkey is logged with its reason (`[web] Passkey check rejected …`).
- Lost authenticators are recovered with `ririko passkeys:reset <user_id>` by an operator.
- Sessions stay opaque and server-side; JWE was re-evaluated and rejected (ADR-013, revision 2026-09-25).

### 2.4. Session Management & Alerts (TASK-1172)
- `/account/sessions` lists the user's live sessions (browser, IP, sign-in and last-active times, current one marked). Each other session can be signed out, and "Sign out everywhere else" ends all of them. Revoking needs no fresh passkey check, so a user can always end a stolen session; the delete is scoped to the user's own sessions. Revokes are audited as `web.session.revoke` and `web.session.revoke_all`.
- A long-lived random `__Host-ririko_device` cookie (1 year, renewed at every sign-in) marks known browsers; only its SHA-256 is stored in `web_known_devices`. A sign-in from a browser the user has not used before sends them a Discord DM. Malware that copies the browser profile copies this cookie too, so it is an alert, never an authorization check.
- Adding or removing a passkey also sends a DM.
- DMs and change notices go through the bot-token REST client after the response is sent (`after()` from `next/server`). They are best effort: users who block DMs (Discord error 50007) and guilds without a log channel are skipped, and failures are only logged. User-controlled text (passkey names, setting values) is shown as inline code and mentions are disabled, so it cannot become a link or a ping; the browser is described from fixed names, never the raw user agent.

---

## 3. Configuration Scope & Mutation Path

### 3.1. Guild-Scoped vs Global Settings
- **Guild-scoped settings** (most modules) are edited by users who pass `requireGuildAccess` for that guild.
- **Global settings** are shared by every guild because their tables have no guild column: `tcg_system_configs` (market tax, listing expiry, energy governance), `dungeon_seasons` / `dungeon_bosses`, and the item and achievement catalogs (`economy_items`, `economy_item_categories`, `game_items`, `game_achievements`). They are edited only in the **owner console**, gated to bot owners with a passkey. A guild manager must never be able to change data that other guilds share.
- Guild-scoped TCG settings (such as drop settings and the TCG Manager Role) stay with guild managers.

### 3.2. No Placeholder Settings
Each page exposes only settings the bot actually reads. A backing column is added only where the bot consumes it. Settings listed in Section 4 that the bot does not read yet are either wired end to end in the same ticket or left off the page.

### 3.3. Mutation Path
```text
Server Action
 ├── requireGuildAccess(guildId) or owner guard
 ├── passkey step-up check (sensitive writes only)
 ├── Zod parse with the shared schema from @ririko/core
 └── GuildConfigService (packages/services), in one transaction
      ├── write through the existing repositories
      ├── bump guild_config_versions (guild, module)
      └── write audit_logs (actor, IP, user agent, before/after field diffs)
 └── after the response: post a change notice (who, module, field diffs) to the guild's
     log_channel_id when something changed

Bot process
 └── GuildConfigWatcher polls guild_config_versions every 5 seconds
      └── emits guild:configChanged on the EventBus; each service evicts its cached settings
```

The dashboard and CLI run in separate processes from the bot, so they cannot clear the bot's in-memory caches directly (CHORE-1101). The watcher compares versions over a 60-second overlap window, so a second write in the same millisecond, or a write committed after a newer one, is still picked up. A module whose bot-side service caches settings must subscribe to `guild:configChanged` when its dashboard page is added.

### 3.4. Adding a Settings Page
1. Add the module's strict schema to `GuildConfigSchemas` in `packages/core/src/config/guild-config.ts` (only keys the bot reads) and its read/write store to `GuildConfigService` in `packages/services/src/guild/guild-config.service.ts`.
2. If a bot service caches those settings, subscribe it to `guild:configChanged` in `apps/bot/src/services.ts`.
3. Add `app/dashboard/[guildId]/<module>/actions.ts` (`'use server'`) whose action returns `saveGuildSettings(guildId, '<module>', pickFormFields(formData, [...]))`. That helper runs `checkDashboardRequest` (Origin and rate limit), `requireGuildAccess`, validation, the audited write, `revalidatePath` and the log-channel change notice. Any other Server Action must call `checkDashboardRequest` and a guard itself, or the coverage test fails.
4. Add `page.tsx` that calls `requireGuildAccess(guildId)`, reads `guildConfig.get(guildId, '<module>')` and renders `SettingsForm` with `TextField`, `SelectField`, `ChannelSelectField` or `RoleSelectField`. Field errors and saved values come back through `useActionState`.
5. Add the page to `GUILD_NAV_ITEMS` in `apps/web/src/lib/dashboard-nav.ts`.

---

## 4. Comprehensive Module Configuration Pages

The dashboard provides dedicated management views for all 20+ bot modules:
1. **Overview**: Live server stats (member count, active voice channels, command usage graphs, bot latency).
2. **General**: Server prefix, default embed color, bot language, timezone.
3. **Moderation**: Case logs, warning escalation policy builder, moderation history inspector.
4. **AutoMod**: Toggles and threshold sliders for invite spam, phishing shields, caps lock, and mention limits.
5. **Music**: Default volume, DJ role picker, music channel binding, audio filter presets.
6. **AI Chatbot**: Personality prompt editor, model selection (Gemini / OpenAI / Ollama), tool toggles.
7. **Image Generation**: Provider selector, daily user quota limits, style presets.
8. **Economy & Banking**: Currency name, daily reward base amount, bank interest rates, item shop manager. The item catalog (`economy_items`, `economy_item_categories`) is global, so the shop manager lives in the owner console.
9. **XP & Ranking**: XP rate multipliers, voice XP toggles, level-up announcement channel.
10. **Waifu TCG & Gamification Settings** (items marked *owner console* edit global tables and are gated to bot owners with a passkey; see Section 3.1):
    - **Card Drop Management**: Drop channel selector, message frequency slider (50–200 messages), active hours timepicker, claim window timer. *Current gap:* `DropManager` keeps `GuildDropConfig` in an in-memory `Map` and nothing calls `setGuildConfig` outside tests, so every guild runs on `DEFAULT_DROP_CONFIG`. These settings must be persisted and loaded by the bot before the page can expose them (TASK-1121).
    - **Rarity & Market Controls** (*owner console*, `tcg_system_configs`): Drop weight fine-tuning, marketplace tax rate slider (1%–20%), listing expiration duration.
    - **Dungeon Season & Tower Floor Manager** (*owner console*, `dungeon_seasons` / `dungeon_bosses`). The difficulty curve chart calls the same scaling functions the dungeon engine uses, imported from `@ririko/services`, never reimplemented:
      - **Tutorial Configuration**: Enable/disable tutorial gate, configure introductory starter rewards.
      - **Season Lifecycle Editor**: Create new seasons (S1, S2, S3...), set active dates, assign theme elements (Fire, Ice, Light, Shadow, etc.), and customize environmental affixes.
      - **Interactive Difficulty Curve Visualizer**: Real-time chart displaying enemy HP/ATK/DEF trajectories across floors (F1–F50+) based on selected model (`Linear`, `Polynomial`, `Exponential`, `Hybrid`) and growth rate parameter $r$ (0.03 to 0.25).
      - **Boss Enrage & Shield Layer Configurator**: Set turn-count enrage limits, multi-layer elemental shield requirements, and first-clear vs repeat loot drop tables.
    - **Energy & Stamina Governance** (*owner console*, `tcg_system_configs`):
      - Numerical input for **Global Energy Cap** (100–1000, default 300).
      - Slider for **Base Energy** (50–200, default 100) and **Energy Scaling Per Level** (1–5).
      - Daily Consumable Energy Restore Limit slider (1–10/day, default 3).
      - Daily replenishment schedule cron string (default `'0 0 * * *'`).
    - **Role Permissions**: Role selector for **TCG Manager Role** authorized to adjust game rules and run `/tcg-admin`.
    - **Shop Catalog Manager** (*owner console*, `game_items`; respects catalog-code seeding from BUG-0015): Visual catalog editor to manage basic shop equipment, accessories, potions, and daily purchase quotas.
    - **Achievement Manager** (*owner console* for edits, `game_achievements` is global): Live inspector for achievement completion telemetry, active reward tables, and toggleable seasonal achievements.
11. **Games**: Enable/disable specific mini-games, wager limits, cooldown sliders.
12. **Giveaways**: Active giveaway list, winner reroll buttons, historical log.
13. **Reaction Roles**: Visual message builder and role mapping manager.
14. **Auto Voice**: Join-to-create channel assigner, user limit, bitrate presets.
15. **Stream Alerts**: Streamer subscription list (Twitch/YouTube/TikTok), announcement templates, mention roles.
16. **Free Games**: Epic/Steam/GOG announcement channels and notification ping roles.
17. **Welcome & Farewell**: Interactive canvas preview card editor with custom background uploads.
18. **Logging**: Channel bindings for message edits, deletes, voice joins, and role updates.
19. **Command Overrides**: Enable/disable specific commands or limit them to staff roles.
20. **Integrations & Secrets**: Third-party API status (`Configured ✓`). Secrets are **never** displayed.

---

## 5. Overview Data Sources & Analytics
- **Member and online counts**: Discord REST `GET /guilds/{id}?with_counts=true` with the bot token.
- **Command usage graph**: no command usage is recorded today. A dual-dialect `command_usage_daily` table (guild, command, day, count) is incremented by the command router after dispatch (TASK-1131).
- **Bot latency, guild count and uptime**: the bot has no HTTP server today. It refreshes a small bot status record on a fixed interval, and the dashboard reads it. The EPIC-012 `/health` and `/ready` probes can reuse the same record.
- **Moderation case log**: read-only inspector over `moderation_cases`, `moderation_warnings` and `moderation_notes`, with filters by user, moderator, action and date, and cursor pagination (TASK-1132).
- **Dashboard audit viewer**: renders `audit_logs` entries with their field diffs (TASK-1132).

---

## 6. Shared Zod Validation & Dashboard-to-CLI Parity

In compliance with Sections 43 and 72 of `BLUEPRINT.md`:
- Configuration schemas are defined once in `packages/core/src/config/guild-config.ts` (`GuildConfigSchemas`, one strict Zod object per module) and only for keys the bot reads. The `/prefix` and `/timezone` commands validate with the same `PrefixSchema` and `TimezoneSchema`.
- Both the **Web Dashboard** and the **CLI** invoke the exact same application services (`GuildConfigService`) and validation schemas.
- Any change that can be configured via the web UI can also be executed via `ririko guild:config <guild_id> [key] [value]`: no key lists all keys, a key alone reads its value, and a key with a value sets it. CLI changes are written to `audit_logs` with a CLI actor marker.

---

## 7. Security & Secret Redaction
The decisions and rejected alternatives (JWKS, JWE, browser-side request signing) are recorded in [ADR-013](adr/ADR-013-dashboard-sessions-and-credential-theft-defense.md). A stolen credential cannot be made impossible; the design makes it short-lived, revocable, unable to perform sensitive writes without a second factor, and visible to its owner.

| Threat | Defense |
|---|---|
| Stolen session cookie (XSS or infostealer malware) | HttpOnly `__Host-` cookie and strict CSP against XSS. Short idle and absolute expiry, ID rotation, passkey step-up for sensitive writes, new-device alerts, "sign out everywhere". Chrome DBSC as an optional enhancement where supported. |
| Compromised Discord account | Enrolled passkeys are always required; bot owners must have one. Discord login alone cannot pass step-up. |
| Leaked database or backup | Only SHA-256 hashes of session IDs are stored. Discord tokens are AES-256-GCM encrypted under a key held outside the database. |
| Stolen user OAuth token | Scopes are `identify` and `guilds` only (read-only). Mutations use the bot token on the server after authorization. |
| Guild ID tampering (IDOR) | `requireGuildAccess` in every Server Action and route handler, never in middleware, enforced by a coverage test. |
| Cross-site request forgery | SameSite=Lax cookie, Server Action origin verification, Origin checks on route handlers, signed OAuth2 `state` (plus PKCE if Discord accepts it for this application type). |
| Secret leakage to the client | `server-only` imports and React taint APIs: `experimental.taint` is on, `createWebServices` taints the config object and every credential in it (bot token, OAuth client secret, vault keys including previous ones, `DATABASE_URL`, provider API keys), so rendering one into a Client Component fails. |
| Silent account takeover | New-device DM alerts, dashboard change notices in the guild log channel, `audit_logs` with IP and user agent, active sessions page. |

1. **Zero Secret Exposure**: Third-party tokens, Discord bot tokens, and database passwords are never rendered to HTML or sent to client React components. The UI displays only whether each integration is configured:
   ```text
   Twitch Integration: Configured ✓
   Gemini API:         Configured ✓
   ```
2. **Browser Hardening** (TASK-1173): [proxy.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/proxy.ts) sets a per-request nonce CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`, no `unsafe-inline` for scripts or, in production, styles; `frame-ancestors 'none'`, `form-action 'self'`, `base-uri 'self'`, `object-src 'none'`, images from `'self'` and `cdn.discordapp.com`). It only sets headers and never authorizes. The root layout calls `connection()` so every page, including the 404 page, renders per request and gets the nonce. `next.config.ts` sends `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin`, a `Permissions-Policy` that disables camera, microphone, geolocation, payment, USB and topics, and HSTS in production. Both header sets are defined in `src/lib/security-headers.ts`. No `dangerouslySetInnerHTML`.
3. **CSRF Protection**: All mutation endpoints use Next.js Server Actions with built-in origin verification; route handlers check the `Origin` header.
4. **Rate Limiting** (TASK-1173): in-process token buckets in `src/lib/server/rate-limit.ts`, enough for one dashboard instance (ADR-013). Auth routes allow 20 requests per client IP, refilling 20 per minute, and answer `429` with `Retry-After`. Server Actions allow a burst of 30 per signed-in user (per IP before sign-in), refilling one per second; `checkDashboardRequest` returns an error message instead. Client IPs come from `X-Forwarded-For`, so run the dashboard behind a proxy that overwrites it.
5. **Audit Trail**: Every modification performed on the dashboard or through `ririko guild:config` generates an entry in `audit_logs` capturing actor, IP address, user agent, timestamp, and field diffs.

---

## 8. Delivery Plan (EPIC-011)
Tickets and estimates live on [BOARD.md](kanban/BOARD.md) under **Groomed Stories & Tasks for EPIC-011**. STORY-110 and STORY-111 come first; the other stories can run in any order after STORY-111.

| Story | Pts | Scope | Spec sections |
|---|---|---|---|
| STORY-110 | 8 | `apps/web` scaffold, Discord OAuth2, server-side sessions, guild authorization guard | 1.1, 2, 2.1, 2.2 |
| STORY-111 | 8 | Shared Zod schemas, `GuildConfigService` and audit writer, dashboard shell and General tab, `ririko guild:config` | 3, 4 (General), 6 |
| STORY-112 | 8 | TCG settings, owner-only season editor and curve visualizer, card album, shop and achievement managers | 4 (TCG) |
| STORY-113 | 5 | Overview tab, command usage counters, bot status record, case log and audit viewers | 4 (Overview), 5 |
| STORY-114 | 8 | Moderation, AutoMod, Logging, Command Overrides, Reaction Roles, Auto Roles, Auto Voice pages | 4 (3, 4, 13, 14, 18, 19) |
| STORY-115 | 5 | Economy, XP, Games, Giveaways pages | 4 (8, 9, 11, 12) |
| STORY-116 | 8 | Music, AI, Image Generation, Stream Alerts, Free Games, Welcome & Farewell, Integrations pages; needs STORY-133 | 4 (5, 6, 7, 15, 16, 17, 20) |
| STORY-117 | 5 | Passkey sign-in gate, step-up, owner guard, recovery CLI | 2.3 |
| STORY-118 | 5 | Session management and alerts, CSP and taint guards, rate limits, authorization coverage test | 7 |
| STORY-119 | 3 (backlog) | Chrome DBSC device-bound sessions | 7 |
