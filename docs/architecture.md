# Architecture

This page is for contributors. It explains how the parts of Ririko fit together and where to find each one. For setup, read [SETUP.md](../SETUP.md). For the daily workflow, read [development.md](development.md).

The decisions behind the design are in [archive/](archive/README.md). Those files are history. This page describes the code as it is today.

## 1. Principles

1. **Keep it simple.** Use plain modules and typed interfaces. Do not add message brokers, microservices or deep inheritance.
2. **One repository, many packages.** The bot, the dashboard and the command-line tool share code through pnpm workspace packages.
3. **Two databases, one code path.** Drizzle ORM runs on PostgreSQL (production) and SQLite (development and small installs).
4. **Slash and prefix commands are the same command.** Business logic exists once.
5. **Events, not polling.** Messages and state update when something changes.
6. **No plaintext secrets.** Keys come from the environment. Stored tokens are encrypted with AES-256-GCM.
7. **The AI is never the security boundary.** The application checks permissions before every tool call.

## 2. Layout

```text
apps/
  bot/        The Discord bot (gateway client, commands, listeners)
  web/        The dashboard (Next.js 16, React 19)
  cli/        The ririko command-line tool
packages/
  core/       Config schemas (Zod), errors, the event bus, time helpers, security helpers
  database/   Drizzle schemas, migrations, repositories, transactions, the client factory
  discord/    Command router, middleware, help center, REST command sync
  services/   Domain services: economy, TCG, moderation, streams, giveaways and more
  ai/         AI providers, fallback chain, memory, tools, personality
  music/      Player, queue, extractors, Lavalink client
  music-private/  Optional extra music sources. Git ignores it.
docs/         This documentation
assets/       Card, boss and adventure artwork and catalogs
scripts/      Build, check and card/boss tools
```

Dependencies point down:

- `apps/bot` uses `discord`, `services`, `music`, `ai`, `database` and `core`.
- `apps/web` uses `services`, `database` and `core`. It never imports `apps/bot`, because that would load the gateway client and the audio code into the web server.
- `apps/cli` uses `apps/bot` (to build the command list), `database` and `core`.
- `services` uses `database` and `core`.

Canvas drawing (cards, profile cards, welcome cards, memes) lives in `packages/services`, with `@napi-rs/canvas`.

## 3. Commands

The command code is in `apps/bot/src/commands/<area>/`. `apps/bot/src/command-set.ts` builds the full list. `packages/discord` holds the router and middleware.

### 3.1. Metadata

Each command has metadata: name, category, description, aliases, options, permissions, cooldown, rate limit and flags (`slashEnabled`, `prefixEnabled`, `isGuildOnly`, `isOwnerOnly`, `isHidden`, `registrationScope`). The router, the help center, the command registration and the dashboard Commands page all read this metadata.

At startup the bot writes the visible commands to the `commands` table. The dashboard lists commands from that table.

### 3.2. Dispatch

1. A command registers its name and aliases in a hash map. Lookups take constant time.
2. A slash interaction or a prefix message resolves to a command.
3. The context goes through the middleware, in this order. The first one that rejects stops the command.
   1. **Maintenance.** Only bot owners pass while maintenance is on.
   2. **Module toggle.** Checks the category switch. `general`, `admin` and `utility` are exempt.
   3. **Command override.** Applies the server and channel rules from the `command_settings` table. `help`, `ping` and `prefix` are exempt. Members with Manage Server skip it.
   4. **Permission.** Checks guild-only, owner-only, user permissions and bot permissions. The server owner passes.
   5. **Rate limit.** A sliding window for each user and command (default 10 calls in 10 seconds). Bot owners, server owners and administrators pass.
   6. **Cooldown.** The per-user cooldown. It runs last, so a rejected command never starts a cooldown.
4. After the middleware, `onCommandRun` counts the use for the dashboard Overview page.

Autocomplete and component interactions skip the middleware.

### 3.3. Registration Scopes

Discord allows 100 slash commands per scope. Member commands use the global scope. Admin and setup commands set `registrationScope: 'guild'` and register in each server. `CommandSynchronizer` refuses a scope that is over a limit before it calls Discord. `apps/bot/src/command-set.test.ts` fails when a new command overflows a scope or lands in the wrong one.

The CLI can build the same payloads without logging in: `ririko commands:sync`. See [development.md](development.md).

### 3.4. Adding a Command

1. Write the command in `apps/bot/src/commands/<area>/`. Follow a nearby command.
2. Add it to the list in `apps/bot/src/command-set.ts`.
3. If it is an admin command, set `registrationScope: 'guild'` and add it to the list in `command-set.test.ts`.
4. Add tests. Randomness must use a seeded generator.
5. Update the feature page in `docs/` and the table in [commands.md](commands.md).

## 4. Settings and the Dashboard

### 4.1. How a Setting Changes

```text
Dashboard form or ririko guild:config
  -> check the user (requireGuildAccess) and the request (origin, rate limit)
  -> parse with the Zod schema from packages/core
  -> GuildConfigService, in one transaction:
       write through the repositories
       bump guild_config_versions (server, module)
       write audit_logs (who, where, field changes)
  -> after the response: post a change notice in the log channel

Bot process
  -> GuildConfigWatcher polls guild_config_versions every 5 seconds
  -> emits guild:configChanged on the event bus
  -> each service clears its cached settings for that server
```

The dashboard and the CLI run in other processes, so they cannot clear the bot's memory. The watcher looks back 60 seconds, so two writes in the same millisecond are not missed.

### 4.2. Adding a Settings Page

1. Add a strict schema for the module to `GuildConfigSchemas` in `packages/core/src/config/guild-config.ts`. Include only keys the bot reads. Add the read and write code to `GuildConfigService`.
2. If a bot service caches the settings, subscribe it to `guild:configChanged` in `apps/bot/src/services.ts`.
3. Add `app/dashboard/[guildId]/<module>/actions.ts` (`'use server'`). The action returns `saveGuildSettings(guildId, '<module>', fields)`.
4. Add `page.tsx`. It calls `requireGuildAccess(guildId)`, reads the settings and renders `SettingsForm`.
5. Add the page to `GUILD_NAV_ITEMS` in `apps/web/src/lib/dashboard-nav.ts`.
6. Add the action to the expected entry points in `authorization-coverage.test.ts`.

Settings that change something risky pass `{ stepUp: true }`. They then need a passkey check from the last 5 minutes.

### 4.3. Settings Order

```text
Defaults in code
  -> environment variables (bot owner)
  -> server settings (guild_settings and the module tables)
  -> channel rules (command_settings)
  -> personal settings (such as a time zone)
  -> the options of one command call
```

A member can never override a server or system rule.

Some data is global because its tables have no server column: the economy settings, the card game rules, the item catalogs, the dungeon seasons and the achievements. Only bot owners change them, in the owner console.

### 4.4. Dashboard Security

- Sign-in uses Discord OAuth2 with PKCE. The scopes are `identify` and `guilds`.
- A session is a random ID in a `__Host-` cookie (HttpOnly, Secure, SameSite=Lax). The database stores only a hash of the ID. Discord tokens are encrypted with AES-256-GCM and a versioned key. A session ends after 30 minutes idle or 12 hours.
- Every server page, Server Action and route handler calls `requireGuildAccess`. It checks the user's permission again and the bot's membership on each call. Middleware (`proxy.ts`) never decides access. It only sets headers.
- A test lists every Server Action and route handler and fails if one skips a guard.
- Passkeys add a second step. Sensitive changes need a check from the last 5 minutes.
- A strict content security policy with a nonce, `server-only` imports and React taint markers keep secrets out of the browser.
- Rate limits are in memory, which is enough for one dashboard instance.

The full reasoning is in [archive/adr/ADR-013-dashboard-sessions-and-credential-theft-defense.md](archive/adr/ADR-013-dashboard-sessions-and-credential-theft-defense.md). The original page-by-page design is in [archive/dashboard-design.md](archive/dashboard-design.md).

## 5. Data

- The schemas are in `packages/database/src/schema/`, one folder for each dialect. Every change ships a migration for both dialects. See [database.md](database.md).
- Repositories hide the dialect. Code outside `packages/database` never writes SQL.
- Balance changes, trades, market sales and adventure payouts run in one transaction. The database also rejects a negative balance.
- Every credit change writes a row to a ledger with the balance before and after.

## 6. Feature Notes

### 6.1. Economy

Rewarding actions publish an `EconomyEvent`. `EconomyService` checks the anti-spam rules (60-second window, near-copy detection, minimum length, burst detection), calculates the reward and writes the ledger. Voice rewards come from `VoiceRewardService`, which runs every minute and pays only in servers that turned them on. Daily systems share one reset boundary (`RIRIKO_RESET_*`) and compute it when a value is read, so no scheduled job is needed. Details: [archive/economy-design.md](archive/economy-design.md).

### 6.2. Moderation

`PermissionService` checks the user permission, the bot permission and the role order for every punishment. `WarningEscalationService` adds up active warnings and applies the step of the policy. AutoMod rules run on every message. The anti-raid service watches joins. Details: [archive/moderation-design.md](archive/moderation-design.md).

### 6.3. AI

`ConversationManager` stores memory for each server, user and channel. `FallbackChainManager` tries the chosen provider first, then the others, with a circuit breaker. Tools are registered with Zod schemas, and a security interceptor checks the allowed list and the caller's permissions before it runs one. The model never gets a shell, SQL, files, web access or admin APIs. Details: [archive/ai-design.md](archive/ai-design.md).

### 6.4. Music

`MusicPlayerService` hands queries to Lavalink when a node is connected. Otherwise it uses `ExtractorPipeline` with the built-in adapters. A queue is kept in memory for each server. `MusicEmbedController` updates the player message when events happen, one update at a time for each server, with a 50 ms debounce. It sends a new message only when Discord says the old one is gone. Details: [archive/music-design.md](archive/music-design.md).

### 6.5. Waifu TCG

Cards, items, energy and dungeon progress belong to the user. `EnergyLifecycleService` is the only way to spend energy. It also refills it at the reset boundary. The dungeon engine builds an encounter from the season's curve, the boss definition and floor overrides. Rules that owners can change are read through a resolver with a 30-second cache. Cards are drawn with `@napi-rs/canvas` and cached in `public/cards/`. Details: [archive/waifu-tcg-design.md](archive/waifu-tcg-design.md) and [archive/tcg-card-synthesis.md](archive/tcg-card-synthesis.md).

### 6.6. Adventures

The scenario graphs, the engine and the payout service are in `packages/services/src/adventure/`. A durable session row, keyed by the user ID, makes sure a user has one active story. A choice receipt for each decision stops double charges. Settlement is one transaction. Details: [archive/adventure-game-spec.md](archive/adventure-game-spec.md) and [archive/adventure-runtime.md](archive/adventure-runtime.md).

### 6.7. Integrations

External services sit behind small adapters. A failing service must not hang the bot, so every request has a timeout and retry rule. See [adapters.md](adapters.md) for the list.

## 7. Operation

- `GET /health` and `GET /ready` on `HEALTH_PORT` report the state of the bot. See [deployment.md](deployment.md).
- `ririko doctor` checks the environment. The full list of commands is in [development.md](development.md).
- Tests, coverage and the privacy scan are in [testing.md](testing.md).
