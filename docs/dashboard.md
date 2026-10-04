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
- Sensitive writes always need a passkey check newer than 5 minutes: the owner console, the moderation escalation policy, every reaction role panel write (publish, edit, remove a role, delete a panel), and integrations. Users without a passkey cannot perform them.
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


### 2.5. Card Album (TASK-1123)
- `/account/album` shows the signed-in user's own Waifu TCG cards, 24 per page, newest first, with a rarity filter and a favourites-only filter (plain `GET` query: `?rarity=`, `?favorites=1`, `?page=`). The user id always comes from the session; there is no way to view another user's album.
- `CardAlbumService` (`@ririko/services/tcg-album`) reads one page with `WaifuCardRepository.listUserAlbum`, a single join of `user_cards`, `waifu_cards`, `waifu_assets` and `waifu_sources`. The page HTML lists the cards only (BUG-0028: inlining every render as a base64 data URL made a 24-card page about 40 MB).
- Each card's `<img>` loads `GET /api/album/cards/<userCardId>`. The route calls `requireSession` and `CardAlbumService.cardImage`, which finds the card with `WaifuCardRepository.findUserAlbumEntry` only when the signed-in user owns it (any other ID is a 404) and draws it with the bot's `CardImageService`, so a card already in `public/cards/<cardId>.png` is read from disk. The response is `Cache-Control: private, no-cache` with an ETag: the browser revalidates (304) on every view, so a traded card or taken-down art is never served from a stale cache, including to the next user on a shared browser.
- The renderer (and the native canvas) is imported only when a card is drawn. One user's draws run one at a time. Each cold draw blocks the event loop for about 0.1 s, so the queue yields a turn before every draw, which lets pages and navigations be served in between.
- `AlbumCardImage` (a client component) loads the cards in page order, at most two at a time (`LoadSlots`). Because the server draws one card at a time, more requests in flight would only hold the browser's six HTTP/1.1 connections. A click on Older, Newer or Filter would then wait behind them: with 24 images in flight, the navigation took about 6 s on a cold cache and failed the E2E album spec. A card the route cannot draw (500) shows a placeholder instead of breaking the page. Images stay on `'self'`, so the CSP `img-src` is unchanged.
- Renders are cached in `public/cards/<cardId>.png`, the same folder the bot uses, so a card the bot has already shown is read from disk. In Docker the bot and the dashboard must share that volume, or each keeps its own cache.
- Read only: equipping, favouriting, trading and dismantling stay in `/cards` in Discord.

---

## 3. Configuration Scope & Mutation Path

### 3.1. Guild-Scoped vs Global Settings
- **Guild-scoped settings** (most modules) are edited by users who pass `requireGuildAccess` for that guild.
- **Global settings** are shared by every guild because their tables have no guild column: `economy_config` (daily reward, bank capacity), `tcg_system_configs` (market tax, listing expiry, energy governance), `dungeon_seasons` / `dungeon_bosses`, and the item and achievement catalogs (`economy_items`, `economy_item_categories`, `game_items`, `game_achievements`). They are edited only in the **owner console**, gated to bot owners with a passkey. A guild manager must never be able to change data that other guilds share.

### 3.1.1. Owner Console (STORY-165)
- `/owner` is shown to `BOT_OWNER_ID` users only. Everyone else gets a 404, and the header shows the "Owner console" link only to owners. The layout and every page call `requireOwner`, so an owner must have a passkey and a passkey check from the last five minutes.
- Every owner Server Action runs `runOwnerAction` ([owner-action.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/owner-action.ts)), which checks, in order:
  1. The dashboard Origin and the rate limit.
  2. That the user is a bot owner.
  3. The five-minute passkey check. If it is missing, the form offers "Confirm with passkey and save".

  The authorization coverage test accepts `runOwnerAction` as both the request guard and the authorization guard.
- Owner writes go through the owner services in `@ririko/services/owner`: `EconomyConfigService`, `ItemCatalogService`, `TcgRulesService`, `DungeonSeasonAdminService`, `TcgItemCatalogService` and `TcgAchievementAdminService`. Their audit entries have no guild (`guild_id` is null), with the actions `owner.economy_config.update`, `owner.shop_item.*` / `owner.shop_category.*`, `owner.tcg_rules.update`, `owner.dungeon_*`, `owner.tcg_item.*` and `owner.achievement.update`. The guild audit viewer does not show them yet.
- Pages:
  - `/owner/economy` edits the global economy values (docs/economy.md 5.4).
  - `/owner/tcg` edits the global Waifu TCG rules: market tax and listing expiry, energy and potions (TASK-1124).
  - `/owner/shop` lists the item catalog with holder counts and manages categories.
  - `/owner/shop/new` and `/owner/shop/[itemId]` edit an item.
  - `/owner/dungeon` lists dungeon seasons; `/owner/dungeon/new` and `/owner/dungeon/[seasonId]` edit a season and show its difficulty curve; `/owner/dungeon/[seasonId]/bosses/[bossKey]` edits a boss (TASK-1122); `/owner/dungeon/[seasonId]/floors/[floorNumber]` edits a floor's first-clear and repeat-clear loot (TASK-1126).
  - `/owner/tcg-shop` lists the Waifu TCG items (`game_items`) with holder counts; `/owner/tcg-shop/[itemId]` edits a built-in item's shop fields (kept across bot restarts) or every field of custom gear; `/owner/tcg-shop/new` adds custom gear (TASK-1125, docs/waifu-tcg.md 13.1).
  - `/owner/achievements` edits the wording, tier, rewards and visibility of each achievement (TASK-1125, docs/waifu-tcg.md 14.2.1).
- `ririko economy:config [key] [value]` is the CLI for the economy values, and `ririko tcg:rules [key] [value]` for the TCG rules. They use the same schema, service and audit trail as the owner console.
- Guild-scoped TCG settings (drop settings and the TCG Manager Role) stay with guild managers on `/dashboard/[guildId]/tcg` (TASK-1121). `/dashboard/[guildId]/tcg/achievements` shows guild managers, read only, how many members unlocked and claimed each achievement (TASK-1125).

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
   - Build fields from the setting types in the same file, so the dashboard and the CLI share one parser: `FlagSetting` (booleans; the CLI may pass `on`/`off`), `IntSetting(min, max)`, `OptionalSnowflakeSetting` (an empty value clears it), `SnowflakeListSetting(max)` (the CLI passes IDs comma separated) and `JsonSetting(schema)` for lists of rows (the CLI and the form pass JSON text).
   - Validation errors inside a list keep their row number (`Row 3: Timeout steps need a length.`).
2. If a bot service caches those settings, subscribe it to `guild:configChanged` in `apps/bot/src/services.ts`.
3. Add `app/dashboard/[guildId]/<module>/actions.ts` (`'use server'`) whose action returns `saveGuildSettings(guildId, '<module>', fields)`.
   - Read `fields` with `pickFormFields(formData, [...])` for text fields, or `readFormFields(formData, { text, list, flag })` when the form has lists or checkboxes.
   - `saveGuildSettings` runs `checkDashboardRequest` (Origin and rate limit), `requireGuildAccess`, validation, the audited write, `revalidatePath` and the log-channel change notice.
   - Settings that must match the guild (a role Ririko can give, a channel of the right type) pass `{ check }`, which runs after the guards and returns field errors before anything is written (`lib/server/guilds/setting-checks.ts`). The CLI has no Discord access, so the schema must still keep the bot safe on its own.
   - Sensitive modules (Section 2.3) pass `{ stepUp: true }`. Without a passkey check from the last five minutes nothing is written; the form offers "Confirm with passkey and save" and submits the same values again, or links to the Security page if the user has no passkey.
   - Any other Server Action must call `checkDashboardRequest` and a guard itself, or the coverage test fails.
4. Add `page.tsx` that calls `requireGuildAccess(guildId)`, reads `guildConfig.get(guildId, '<module>')` and renders `SettingsForm`. Field errors and saved values come back through `useActionState`.
   - Fields: `TextField`, `NumberField`, `ToggleField`, `SelectField`, `ListField`, and the guild pickers `ChannelSelectField`, `RoleSelectField`, `ChannelListField` and `RoleListField`.
   - For a custom client field, use `useSettingsField(name, description)` and `FieldNotes` from `components/settings-form.tsx` (see the escalation step builder).
5. Add the page to `GUILD_NAV_ITEMS` in `apps/web/src/lib/dashboard-nav.ts` and its action to the expected entry points in `authorization-coverage.test.ts`.

---

## 4. Comprehensive Module Configuration Pages

The dashboard provides dedicated management views for all 20+ bot modules:
1. **Overview**: Live server stats (member count, active voice channels, command usage graphs, bot latency).
   - *Shipped in STORY-113:* member and online counts, active voice channels (members in voice, bots not counted), a 30-day command usage chart with a table view, the most used commands, and Ririko's latency, version and uptime. See Section 5.
2. **General**: Server prefix, default embed color, bot language, timezone.
3. **Moderation**: Case logs, warning escalation policy builder, moderation history inspector.
   - *Shipped in STORY-114:* the escalation policy builder. Steps are stored in `guild_settings.escalation_steps` (null means the default policy, an empty list turns escalation off), and saving needs a fresh passkey check. The case log and history inspector shipped in STORY-113 as the separate **Case Log** page (`/dashboard/{guildId}/cases`).
4. **AutoMod**: Toggles and threshold sliders for invite spam, phishing shields, caps lock, and mention limits.
   - *Shipped in STORY-114:* per rule (phishing shield, invite filter, mention spam, burst spam) an on/off switch, the action (delete, or delete plus warn, 10-minute timeout, kick or ban), the mention or message limit, and exempt roles and channels, stored in `moderation_rules`. There is no caps-lock rule, so the page has none. Warnings from AutoMod count toward the escalation policy.
5. **Music**: Default volume, DJ role picker, music channel binding, audio filter presets.
   - *Shipped in STORY-116 as `/dashboard/[guildId]/music` (module `music`):* default volume, music channel (the bot posts a new controller there), a DJ role the bot now enforces on playback commands and controller buttons, and leaving empty voice channels, which the bot now does. Filters are per session and are not saved, so they are not on the page. See docs/music.md 9.1.
6. **AI Chatbot**: Personality prompt editor, model selection (Gemini / OpenAI / Ollama), tool toggles.
   - *Shipped in STORY-116 as `/dashboard/[guildId]/ai` (module `ai`):* AI channel, speaking style, persona prompt (1500 characters), allowed tools (none turns tools off), and a provider and model the fallback chain tries first. Only providers with credentials are offered. Before STORY-116 the saved model was never used. See docs/ai.md 4.2 and 6.1.
7. **Image Generation**: Provider selector, daily user quota limits, style presets.
   - *Shipped in STORY-116 as `/dashboard/[guildId]/images` (module `images`, table `image_guild_settings`):*
     - The default provider (configured ones only) and style preset `/imagine` uses when a member picks none.
     - Images per member in 24 hours on this server. It is capped by the bot quota `IMAGE_DAILY_QUOTA`, which now counts completed images across all providers (before, each provider had its own count).
     - `/stablediffusion-model` sets the same row.
8. **Economy & Banking**: Currency name, daily reward base amount, bank interest rates, item shop manager. The item catalog (`economy_items`, `economy_item_categories`) is global, so the shop manager lives in the owner console.
   - *Moved to STORY-165 (2026-09-27):* balances, the daily reward and the bank are global per user and nothing economy-related is read per guild, so there is no guild Economy page. The owner console edits the daily reward, streak bonus and bank capacity, and the item catalog. The currency name is fixed ("credits"), and bank interest is not live yet (`applyDailyInterest` has no caller).
   - *Shipped in STORY-165 (owner console, Section 3.1.1):*
     - `/owner/economy`: the daily reward, the streak bonus per day, the largest streak bonus, the bank capacity at level 0 and per level.
     - `/owner/shop`: items (code, name, description, price, rarity, category, icon, on sale, daily purchase limit, effect and its amount) and categories.
     - Items members hold, and items or categories from the default catalog, can only be retired. An item must be retired before it can be deleted.
9. **XP & Ranking**: XP rate multipliers, voice XP toggles, level-up announcement channel.
   - *Shipped in STORY-115 as `/dashboard/[guildId]/xp` (module `xp`):* level-up announcements on/off and channel, the XP rate (0 to 300%), no-XP channels (text and voice) and roles, and voice rewards (off by default). See docs/economy.md 3.2 and 6.2.
10. **Waifu TCG & Gamification Settings** (items marked *owner console* edit global tables and are gated to bot owners with a passkey; see Section 3.1):
    - **Card Drop Management**: Drop channel selector, message frequency slider (50–200 messages), active hours timepicker, claim window timer.
      - *Shipped in TASK-1121 as `/dashboard/[guildId]/tcg` (module `tcg`, columns `guild_settings.tcg_*`):* drops on/off (off by default), drop channel (empty counts every channel), unique chatters before a drop (5 to 500), start and end hour in the server time zone (an end before the start runs past midnight; equal hours mean all day), claim window (15 to 600 s) and the repeat-claim cooldown (0 to 60 min). The bot's message listener counts messages that pass the anti-spam check and posts the drop; members claim it with `/card action:claim`. `DropManager` loads the settings once per guild and reloads them on `guild:configChanged` for `tcg` or `general` (time zone). `/tcg-admin action:drops` edits the same settings from Discord through `GuildConfigService` (audited with `source: 'discord'`).
    - **Rarity & Market Controls** (*owner console*, `tcg_system_configs`): Drop weight fine-tuning, marketplace tax rate slider (1%–20%), listing expiration duration.
      - *Shipped in TASK-1124 as `/owner/tcg`:* market tax (1% to 20%, stored as the fraction `market_tax_rate`) and listing expiry (1 to 30 days, `listing_expiry_days`). `MarketService` reads them for every new listing; `/market` and `/tcg-info` show the live values. Drop weight tuning is not offered: rarity odds are fixed in `CardGenerator`.
    - **Dungeon Season & Tower Floor Manager** (*owner console*, `dungeon_seasons` / `dungeon_bosses`). The difficulty curve chart calls the same scaling functions the dungeon engine uses, imported from `@ririko/services`, never reimplemented:
      - **Tutorial Configuration**: Enable/disable tutorial gate, configure introductory starter rewards.
      - **Season Lifecycle Editor**: Create new seasons (S1, S2, S3...), set active dates, assign theme elements (Fire, Ice, Light, Shadow, etc.), and customize environmental affixes.
      - **Interactive Difficulty Curve Visualizer**: Real-time chart displaying enemy HP/ATK/DEF trajectories across floors (F1–F50+) based on selected model (`Linear`, `Polynomial`, `Exponential`, `Hybrid`) and growth rate parameter $r$ (0.03 to 0.25).
      - **Boss Enrage & Shield Layer Configurator**: Set turn-count enrage limits, multi-layer elemental shield requirements, and first-clear vs repeat loot drop tables.
      - *Shipped in TASK-1122 as `/owner/dungeon`:* a season list with status (live, waiting behind a later season, scheduled, ended, off), a season editor (ID, name, description, start and end day in UTC, on/off, theme element, affix set, growth model and curve parameters, season enrage) and a boss editor (stat multipliers, crit, named skill, enrage, up to three ward layers, turn limit, signature drop from `game_items`). The HP curve chart plots `seasonCurvePoints`, which runs the bot's `ScalingEngine`, from the canvas-free `@ririko/services/dungeon` subpath; the tooltip gives HP, ATK, DEF and SPD per floor. The tutorial season is fixed and not editable. Writes go through `DungeonSeasonAdminService` and audit `owner.dungeon_season.create|update` and `owner.dungeon_boss.update`. Tutorial configuration is not offered: the tutorial is fixed in `TutorialService`.
      - *Shipped in TASK-1126:* first-clear vs repeat-clear loot tables per floor (`dungeon_floors.first_clear_rewards` / `repeat_rewards_table`), read by `DungeonLootService`; empty fields keep the bracket defaults. Audit `owner.dungeon_floor.update`.
    - **Energy & Stamina Governance** (*owner console*, `tcg_system_configs`):
      - Numerical input for **Global Energy Cap** (100–1000, default 300).
      - Slider for **Base Energy** (50–200, default 100) and **Energy Scaling Per Level** (1–5).
      - Daily Consumable Energy Restore Limit slider (1–10/day, default 3).
      - Daily replenishment schedule cron string (default `'0 0 * * *'`).
      - *Shipped in TASK-1124 on `/owner/tcg`:* energy cap, base capacity, capacity per level, energy potions per day, bonus energy cap and bonus energy per day. `EnergyLifecycleService` reads them through a rules resolver (capacity, potion limit, daily bonus); the economy `/use` potion path is capped by the same limit. The cron string is not offered: the daily reset comes from the `RIRIKO_RESET_*` environment settings, so the unused `daily_replenish_cron`, `dungeon_scaling_model` and `dungeon_growth_rate` keys are deleted at bot start. Rules are cached 30 seconds in each process. `ririko tcg:rules [key] [value]` is the CLI, and bot owners can set them with `/tcg-admin action:energy|market`; all three paths use `TcgRulesService` and audit `owner.tcg_rules.update`.
    - **Role Permissions**: Role selector for **TCG Manager Role** authorized to adjust game rules and run `/tcg-admin`.
      - *Shipped in TASK-1121 on the same page:* the role is per guild (`guild_settings.tcg_manager_role_id`). Its members can run `/tcg-admin` in that server (view and drop settings) without Manage Server; only members with Manage Server can change the role. The old global `tcg_system_configs.tcg_manager_role_id` key is deleted at bot start with a warning, because its guild cannot be known.
    - **Shop Catalog Manager** (*owner console*, `game_items`; respects catalog-code seeding from BUG-0015): Visual catalog editor to manage basic shop equipment, accessories, potions, and daily purchase quotas.
    - **Achievement Manager** (*owner console* for edits, `game_achievements` is global): Live inspector for achievement completion telemetry, active reward tables, and toggleable seasonal achievements.
11. **Games**: Enable/disable specific mini-games, wager limits, cooldown sliders.
   - *Shipped in STORY-115 as `/dashboard/[guildId]/games` (module `games`):* a maximum wager (`guild_settings.max_game_wager`, empty for no limit) that coinflip, dice, highlow, rps and tictactoe check before taking credits, and per game an on/off switch and a cooldown. The rules are the games' server-wide `command_settings` rows, so the Commands page shows them too; saving the Games page keeps their roles and every channel rule. The TCG `/game` wager is not limited.
12. **Giveaways**: Active giveaway list, winner reroll buttons, historical log.
   - *Shipped in STORY-115 as `/dashboard/[guildId]/giveaways`:* running giveaways (end time, entries) with **End now**, and the last 25 ended ones with winners, rerolled winners and **Reroll** (optional winner count, up to 20). The web process runs the same `GiveawayEngine` without its scheduler and posts through the bot-token REST client. `endGiveaway` claims a giveaway only once, so the scheduler, `/giveaway end` and the dashboard cannot all end it. Ends and rerolls are audited (`giveaways.end`, `giveaways.reroll`) and post change notices; they need no passkey check. Giveaways are still created in Discord.
13. **Reaction Roles**: Visual message builder and role mapping manager.
   - *Shipped in STORY-164 as `/dashboard/[guildId]/reaction-roles`:* a builder for a message (text and an optional embed) with up to 25 role buttons (5 per row, one click mode for the panel: toggle, give only, remove only or pick one) or one role menu (up to 25 options, a pick limit; a member's choice replaces their roles from that menu), with a live preview. Ririko posts it through the bot-token REST client, or edits one of its own messages that carries no other feature's components. Bindings are stored in `reaction_roles` (buttons by `rr:btn:<binding id>`, menu options by role under the panel's `group_id`) in one transaction with an audit entry; if that fails, the new message is deleted or the edited one restored. The panel list shows every message with bindings, including emoji reactions from `/create-reaction-role`; each role can be removed (its button, option or Ririko's reaction goes too), and a panel can lose all its roles or, for Ririko's own messages, be deleted. Every write needs a fresh passkey check, is audited and posts a change notice. Roles are checked against Ririko's highest role, as in the bot.
14. **Auto Voice**: Join-to-create channel assigner, user limit, bitrate presets.
   - *Shipped in STORY-164 as `/dashboard/[guildId]/autovoice` (module `autovoice`, CLI key `autovoice.hubs`):* up to 20 hubs, each with its voice channel, a name template (`{user}`), a user limit and a bitrate preset capped at the guild's boost tier. The bot deletes only the channels it created (BUG-0021), and lowers a saved bitrate to what the guild allows when it creates a channel.
   - **Auto Roles** (`/dashboard/[guildId]/autoroles`, module `autoroles`, STORY-164): join roles for members and for bots (up to 10 each) with an on/off switch, and the verification role that `/autorole send-verify` buttons give. The pickers offer only roles Ririko can give, and the save checks them again against Discord.
15. **Stream Alerts**: Streamer subscription list (Twitch/YouTube/TikTok), announcement templates, mention roles.
   - *Shipped in STORY-166 as `/dashboard/[guildId]/streams`:*
     - Lists the server's subscriptions (platform, streamer, live state, channel, role) with a preview of each announcement, and adds, edits and removes them.
     - `/stream` and the page share `StreamAlertService` (`@ririko/services/stream-alerts`). Both resolve handles with the same platform adapters and store uuid IDs; the command used to write text IDs, which Postgres refused.
     - A server can follow up to 25 streamers, the most `/stream list` can show. An announcement message has at most 1000 characters and the variables `{streamer}`, `{title}`, `{game}`, `{platform}`, `{url}` and `{role}`.
     - Announcements may ping only the subscription's role (`allowedMentions`), so a stream title with `@everyone` pings nobody.
     - Changes are audited (`stream_alerts.subscribe`, `.update`, `.remove`, with `source` `dashboard` or `command`) and post change notices.
     - The dashboard needs the same Twitch credentials as the bot to resolve Twitch handles; without them it stores the handle as typed, as `/stream` does.
16. **Free Games**: Epic/Steam/GOG announcement channels and notification ping roles.
   - *Shipped in STORY-166 as `/dashboard/[guildId]/freegames` (module `freegames`):* the announcement channel (empty turns announcements off) and a ping role, stored in `free_game_channels.mention_role_id`. The role is mentioned above each announcement and is the only mention allowed. `/freegames setchannel` takes an optional role too. The bot checks Epic Games Store and Steam; there is no GOG provider.
17. **Welcome & Farewell**: Interactive canvas preview card editor with custom background uploads.
   - *Shipped in STORY-166 as `/dashboard/[guildId]/welcome` and `/farewell` (modules `welcome` and `farewell`):*
     - Settings: on/off, channel, message (up to 200 characters, `{user}`, `{server}`, `{memberCount}`), a `#rrggbb` text color and a background link. `/welcomer` and `/farewell` apply the same checks.
     - The preview is the saved card drawn on the server by the bot's `WelcomerService`, with the viewer's name and avatar. `@napi-rs/canvas` is a server external package, loaded only by these pages.
     - Background links must point to a public address. `assertPublicUrl` (`@ririko/services/net`, no canvas) checks the link when it is saved, from the dashboard, the CLI or the command, and again for every redirect when the bot or the preview fetches it.
     - Uploads: PNG, JPEG, WebP or GIF, up to 2 MB and 4096 pixels a side, checked by their bytes. They are stored in `storage/welcomer-backgrounds` (shared by the bot and dashboard containers, see docs/deployment.md) and named in `guild_welcomer.background_file` / `guild_farewell.background_file`. An upload replaces the link and a link replaces the upload; older files are deleted.
18. **Logging**: Channel bindings for message edits, deletes, voice joins, and role updates.
   - *Shipped in STORY-114:* the one channel the bot has, `guild_settings.log_channel_id`. It receives moderation cases, anti-raid alerts and dashboard change notices. The bot writes no message, voice or role logs, so per-event bindings would be placeholders.
19. **Command Overrides**: Enable/disable specific commands or limit them to staff roles.
   - *Shipped in STORY-163 as `/dashboard/[guildId]/commands`:* per command, a server-wide rule and per-channel rules, each with on/off, allowed roles, blocked roles and a cooldown override, stored in `command_settings` (module `commands`, CLI key `commands.overrides`). The command list comes from the `commands` table, which the bot rewrites at startup. `help`, `ping` and `prefix` cannot be overridden, and members with Manage Server bypass every rule except cooldowns.
20. **Integrations & Secrets**: Third-party API status (`Configured ✓`). Secrets are **never** displayed.
   - *Shipped in STORY-116 as `/dashboard/[guildId]/integrations`:* read-only, grouped by Discord, AI chat, image generation, stream alerts and music. `integrationStatus` in `@ririko/core` returns only whether each integration is configured, so no configured value reaches the page. `ririko doctor` uses the same image provider list.

---

## 5. Overview Data Sources & Analytics
Shipped in STORY-113. The bot is the only writer of the three activity tables; the dashboard only reads them.
- **Member and online counts**: Discord REST `GET /guilds/{id}?with_counts=true` with the bot token, cached for 60 seconds. When Discord does not answer, the tiles show a dash and the rest of the page still loads.
- **Command usage graph**: `command_usage_daily` (guild, UTC day, command, count). The command router calls its `onCommandRun` hook when a command passes the middleware pipeline, just before it executes; commands stopped by a middleware and commands outside a guild are not counted. `CommandUsageRecorder` keeps the counts in memory and adds them to the table every 60 seconds and on shutdown, and deletes rows older than 90 days once a day. A crash loses at most one minute of counts.
- **Bot latency, guild count and uptime**: `BotStatusReporter` writes the `bot_status` row (`id = 'bot'`: gateway ping, guild count, version, start time) every 30 seconds from gateway READY. A row older than 90 seconds (`BOT_STATUS_STALE_MS`) means Ririko is offline. The EPIC-012 `/health` and `/ready` probes can reuse the same row.
- **Active voice channels**: Discord REST cannot list a guild's voice states, so the same reporter writes `guild_voice_activity` (per guild, the channels with at least one member who is not a bot). It writes a guild only when its channels changed and removes the row when voice empties. The first write after start-up clears the table, because rows from an earlier run may be stale. While the bot is offline, the page shows voice activity as unknown.
- **Moderation case log** (`/dashboard/{guildId}/cases`): read-only, newest first, 25 cases per page with a case-number cursor (`?before=`). Filters: member and moderator by user ID, action (the types the guild has used), and a UTC date range; clicking a member filters by them. The case page (`/cases/{number}`) shows the case with its metadata, and the member's warnings (whether each still counts toward escalation), staff notes and other cases. User names come from Discord REST `GET /users/{id}`, cached for 10 minutes.
- **Dashboard audit viewer** (`/dashboard/{guildId}/audit-log`): the guild's `audit_logs` entries, newest first, 25 per page with a `(created_at, id)` cursor. Each entry shows the actor, the source (Dashboard or CLI) and a before/after table per changed field; channel and role IDs are shown as `#name` and `@name`. IP addresses and user agents are not shown, because every manager of the guild can open the page and those belong to the actor.

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
| Stolen session cookie (XSS or infostealer malware) | HttpOnly `__Host-` cookie and strict CSP against XSS. Short idle and absolute expiry, ID rotation, passkey step-up for sensitive writes, new-device alerts, "sign out everywhere". Chrome DBSC (STORY-119) binds the session to a TPM-held key on supported browsers: the bound cookie lives 10 minutes and needs a signed refresh, so a copied cookie stops working within minutes; other browsers keep the behavior above. |
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
| STORY-112 | 8 | Guild TCG settings (persisted drops, guild-scoped TCG Manager Role) and owner-gated global TCG rules | 4 (TCG) |
| STORY-167 | 8 | Owner dungeon season and boss editor, difficulty curve chart, configurable floor loot | 4 (TCG) |
| STORY-168 | 5 | Card album viewer, TCG shop catalog manager and achievement manager | 4 (TCG) |
| STORY-113 | 5 | Overview tab, command usage counters, bot status record, voice activity, case log and audit viewers | 4 (Overview), 5 |
| STORY-114 | 8 | Typed settings and step-up settings forms, Logging, Moderation escalation and AutoMod pages, real AutoMod actions | 3.4, 4 (3, 4, 18) |
| STORY-115 | 8 | XP, Games, Giveaways pages, voice rewards, giveaway end guard | 4 (9, 11, 12) |
| STORY-116 | 13 | Music (DJ role, auto-leave), AI (per-guild provider and model), Image Generation (per-guild settings) and Integrations pages | 4 (5, 6, 7, 20) |
| STORY-117 | 5 | Passkey sign-in gate, step-up, owner guard, recovery CLI | 2.3 |
| STORY-118 | 5 | Session management and alerts, CSP and taint guards, rate limits, authorization coverage test | 7 |
| STORY-119 | 8 | Chrome DBSC device-bound sessions (protocol core, register and refresh routes, bound cookie enforcement, Device-bound badge) | 7 |
| STORY-163 | 5 | Command Overrides engine (repository, catalog, override middleware) and page | 4 (19) |
| STORY-164 | 8 | Reaction Roles builder (buttons and select menus), Auto Roles and Auto Voice pages | 2.3, 4 (13, 14) |
| STORY-165 | 13 | Owner console: global economy settings, live bank capacity, item shop manager, item codes and a seed that works on Postgres | 3.1, 4 (8) |
| STORY-166 | 13 | Stream Alerts, Free Games (ping role), Welcome & Farewell editor (preview, background upload); needs STORY-133 | 4 (15, 16, 17) |
