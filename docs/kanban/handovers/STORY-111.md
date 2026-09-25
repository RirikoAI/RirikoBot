# Handover Note: STORY-111 Shared Zod Config Schemas, Audit Trail, Dashboard Shell & CLI Parity

- **Ticket Type & Points**: Story | 8 pts (`TASK-1111` = 3, `TASK-1112` = 3, `TASK-1113` = 2), shipped with prerequisite `CHORE-1101` (2 pts, see [CHORE-1101.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/CHORE-1101.md))
- **Epic**: `EPIC-011`
- **Author / Agent**: Claude Code (Opus 5.5)
- **Status**: REVIEW
- **Timestamp**: 2026-09-25
- **Branch**: `feat/STORY-111-guild-config` (targets `develop/2.0.0`)

## 1. Summary of Work Accomplished

### TASK-1111: Shared schemas, `GuildConfigService`, audit writer
- [guild-config.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/guild-config.ts) (`@ririko/core`):
  - `GuildConfigSchemas` has one strict Zod object per module. Only `general` exists so far (`prefix`, `timezone`).
  - `PrefixSchema` and `TimezoneSchema` carry the rules and user messages that used to live in `GuildSettingsService`. `/prefix` and `/timezone` now validate with them, so the bot, dashboard and CLI agree.
  - `DEFAULT_COMMAND_PREFIX` moved here and is still re-exported from `@ririko/discord`. `isValidTimeZone` and `canonicalTimeZone` moved to `packages/core/src/time/time-zone.ts` and are still re-exported from the reminders module.
  - The app config gains `DEFAULT_PREFIX` (validated by `PrefixSchema`, default `!`).
- [audit-log.repository.ts](file:///Z:/Projects/ririko-v2-2026/packages/database/src/repositories/audit-log.repository.ts): an append-only writer. `audit_logs` gains a `user_agent` column in both dialects.
- [guild-config.service.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/guild/guild-config.service.ts):
  - `get(guildId, module)` returns stored values with defaults applied.
  - `update(guildId, module, patch, actor)` runs in one `withTransaction`: read the current values, parse `{ ...before, ...patch }` with the strict schema, diff, write through `GuildSettingsRepository`, `guild_config_versions.bump`, then write the audit row. The audit row has `action = guild_config.<module>.update`, `details = { source, changes }`, IP and user agent.
  - Unchanged values write nothing. Invalid input throws `GuildConfigValidationError` with `fieldErrors`.
- `@ririko/services` gains a `./guild` subpath export, so the web server and CLI load only the guild module, not the whole services barrel (canvas, AI SDKs, music).

### TASK-1112: Dashboard shell, form kit, General tab
- [layout.tsx](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/layout.tsx): guild chrome with the guild icon and name, and a sidebar driven by `GUILD_NAV_ITEMS` ([dashboard-nav.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/dashboard-nav.ts)). The guild root redirects to its first page.
- [settings-action.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/settings-action.ts): `saveGuildSettings(guildId, module, patch)` runs the dashboard Origin check, `requireGuildAccess`, then `GuildConfigService.update` with the session user, IP and user agent, then `revalidatePath`. Validation errors map to form state. `pickFormFields` takes only the named string fields.
- [settings-form.tsx](file:///Z:/Projects/ririko-v2-2026/apps/web/src/components/settings-form.tsx) (client): `SettingsForm` uses `useActionState`, with `TextField`, `SelectField` and a pending-aware submit button. Fields show per-field errors with `aria-invalid` and `aria-describedby`, and keep the returned values after React's automatic form reset.
- [guild-resources.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/guilds/guild-resources.ts) and [guild-pickers.tsx](file:///Z:/Projects/ririko-v2-2026/apps/web/src/components/guild-pickers.tsx): `ChannelSelectField` (text and announcement channels, grouped by category in Discord's order) and `RoleSelectField` (without @everyone and managed roles), read with the bot token and cached for 60 seconds. No page uses them yet; the first consumer is expected in STORY-115 or STORY-116.
- [General page](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/general/page.tsx) and [action](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/general/actions.ts): prefix and time zone, with an IANA datalist. Locale is left off because the bot does not read it.
- Recipe for new pages: [docs/dashboard.md §3.4](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md).

### TASK-1113: `ririko guild:config <guild_id> [key] [value]`
- [guild-config.ts](file:///Z:/Projects/ririko-v2-2026/apps/cli/src/commands/guild-config.ts):
  - Keys are `module.field`, taken from the schemas.
  - With no key it lists every setting with its value and description. With a key alone it prints the bare value, which is script-friendly. With a key and a value it sets the value through `GuildConfigService`.
  - The audit actor is `cli:<os user>` with `details.source = 'cli'`.
  - Unknown keys, invalid values and malformed guild IDs raise `ValidationError`, so the CLI exits with code 1.

## 2. Current State & Verification
- `pnpm build`, `pnpm typecheck`, `pnpm lint` (0 errors) and `pnpm build:web` pass. Prettier is clean on every file this branch created. The six touched files that fail Prettier already failed it on `develop/2.0.0`.
- `pnpm test`: 189 files, 1718 tests pass. New tests:
  - Schemas (10), `GuildConfigService` (7), CLI (5).
  - Watcher (4), version repository (3), bot sync (1).
  - Resource directory (2), settings action (5).
- `drizzle-kit push` against a copy of the dev database (including its WAL) applied only the additive statements `CREATE TABLE guild_config_versions` (plus its index) and `ALTER TABLE audit_logs ADD user_agent text`.
- The real CLI against that copy listed settings, set the prefix (writing a `cli:<user>` audit row and version 1 in the feed), read it back, and rejected `GMT+8` with the schema message.
- Smoke test with `next start`:
  - Guild routes redirect to login when there is no session, and a non-snowflake guild ID returns 404.
  - A cross-origin Server Action POST is aborted by Next's own origin check before our code runs.
- **Not verified:** saving on the General tab as a signed-in user. It needs a real Discord login (see the next steps).

## 3. Roadblocks, Gotchas & Decisions Made
- **The bot needs `pnpm db:push`.** On an existing database the bot's `GuildConfigWatcher` logs a missing-table error every 5 seconds until `guild_config_versions` exists.
- **`/prefix` and `/timezone` in Discord do not write audit rows or bump the feed.** The bot updates its own cache directly, and ADR-013 scopes audit to the dashboard and CLI. Route them through `GuildConfigService` if bot commands should be audited too.
- **No shared service factory yet.** `GuildConfigService` needs only repositories, so the dashboard and CLI build it directly. This replaces the extraction the STORY-110 handover proposed.
- **`requireGuildAccess` always uses `/dashboard/<id>` as `returnTo`**, so after a forced re-login the user lands on the guild's first page, not the page they were on.
- **Server Actions are guarded twice:** Next's built-in Origin/Host check, and ours against `DASHBOARD_URL`.
- **Tooling:** shell heredocs in this environment mangle backticks and backslashes; write such files with the editor tools.

## 4. Actionable Next Steps for Next Session / Continuing Agent
1. Run `pnpm db:push` on the dev database, then sign in and save the General tab.
   - Expected: `/prefix` in Discord shows the new prefix within about 5 seconds.
   - Expected: `pnpm cli guild:config <guild_id>` shows the same values.
2. Open the STORY-111 PR against `develop/2.0.0` after user review.
3. Next is STORY-117, following the agreed order.
   - TASK-1171 also adds `BOT_OWNER_ID` to the config schema and wires it as `ownerIds`.
   - TASK-1173's coverage test should check that every `'use server'` export calls `saveGuildSettings` or `requireGuildAccess`.
