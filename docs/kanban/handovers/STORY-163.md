# Handover Note: STORY-163 Command Overrides Engine & Page

- **Ticket Type & Points**: Story | 5 pts (`TASK-1631` = 3, `TASK-1632` = 2)
- **Epic**: `EPIC-011`
- **Author / Agent**: Claude Code (Opus 5.5)
- **Status**: DONE (merged in PR #651)
- **Timestamp**: 2026-09-26
- **Branch**: `feat/STORY-163-command-overrides` (targets `develop/2.0.0`)

## 0. Decisions Made at Story Start (2026-09-26)
The story left three questions open. The user chose:
- **Cooldowns are enforced.** The effective cooldown is the rule's override, otherwise the command's own `cooldownSeconds`. It counts per member and command.
- **Members with Manage Server bypass** disabled commands and role rules, so staff cannot lock themselves out. They do **not** bypass cooldowns.
- **`help`, `ping` and `prefix` can never be overridden** (`COMMAND_OVERRIDE_EXEMPT` in core).

Rule semantics:
- A channel rule replaces the server rule in that channel. Fields are not merged.
- Threads use their parent channel's rule.
- A blocked role wins over an allowed role. A non-empty allowed list requires one of those roles.
- A role cannot be in both lists (the schema rejects it; the page hides it from the other list).

## 1. Summary of Work Accomplished

### TASK-1631: Engine
- **Core** ([command-overrides.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/command-overrides.ts)):
  - `CommandOverrideSchema` and `CommandOverridesSchema`: up to 500 rules, 25 roles per list, cooldowns from 0 to 3600 s, one rule per command and channel.
  - Rules that change nothing are dropped. The rest are sorted by `compareCommandOverrides` (command, then server rule first), so equal lists compare equal.
  - `resolveCommandOverride(rows, command, channelId)`.
  - New `commands` module in `GuildConfigSchemas` with one key, `overrides` (JSON).
- **Database:**
  - [CommandSettingsRepository](file:///Z:/Projects/ririko-v2-2026/packages/database/src/repositories/command-settings.repository.ts): `listForGuild` and `replaceForGuild` (delete then insert, with `randomUUID()` ids because the SQLite `id` has no default).
  - [CommandCatalogRepository](file:///Z:/Projects/ririko-v2-2026/packages/database/src/repositories/command-catalog.repository.ts): `list` and `replaceAll` over the previously unused `commands` table.
  - **No schema change, so no `db:push`.**
- **Services:**
  - `GuildConfigService` has a `commands` store. Its deps gain `commandSettings` and `commandCatalog` (wired in the web, CLI and tests). Writing a command missing from the catalog fails with `Unknown command: \`x\`.`, or with "Start the bot once…" when the catalog is empty.
  - [CommandOverrideService](file:///Z:/Projects/ririko-v2-2026/packages/services/src/guild/command-override.service.ts): per-guild cache (5-minute TTL safety net). Read errors propagate, so a database fault never lifts a restriction.
- **Discord:**
  - [createCommandOverrideMiddleware](file:///Z:/Projects/ririko-v2-2026/packages/discord/src/middleware/overrides.ts): throws `CommandDisabledError` or `CommandPermissionError`. When a slash interaction carries only the raw API member, it fetches the member.
  - `overrideChannelId(ctx)` maps a thread to its parent.
  - `createCooldownMiddleware`'s `getCooldownSeconds` may now return a Promise.
- **Bot:**
  - [main.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/main.ts) passes `middlewares: [overrides, cooldown]` to the router. This is the first time the pipeline is non-empty. Overrides run first, so a blocked command starts no cooldown.
  - After registering commands, the bot calls `syncCommandCatalog` ([command-catalog.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/command-catalog.ts)). Hidden and owner-only commands are left out. A failure is logged and startup continues.
  - [services.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/services.ts) drops the override cache on `guild:configChanged` for `module === 'commands'`.

### TASK-1632: Page and CLI keys
- [/dashboard/[guildId]/commands](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/commands/page.tsx):
  - Commands are grouped by category in folding sections, with a search box.
  - Each command has an optional server-wide rule and any number of channel rules. Each rule has on/off, a cooldown (blank means the command's own), and allowed and blocked role chips.
  - The page shows each command's own cooldown and the Discord permission it already needs.
  - Rules are submitted as one hidden JSON field ([command-overrides-field.tsx](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/commands/command-overrides-field.tsx)). Each rule that will be saved shows its "Row N", which matches the error messages.
  - After a failed save, sections that hold rules start open.
  - No step-up, like AutoMod.
- Nav entry `commands` (the slug must equal the module for change notices), audit label "Command settings changed", and an authorization coverage entry.
- `OptionList` is now exported from `settings-form.tsx`.
- **CLI:** `ririko guild:config <guild> commands.overrides '<json>'` comes from the schema. Fixed while here: `formatConfigValue` printed an empty list as `''`, which could not be set back, for JSON rows as well as for `moderation.escalationSteps` `[]`. Empty lists now print as `[]`, `SnowflakeListSetting` accepts JSON list text, and the listing still shows `(none)`.
- **Docs:** [commands.md](file:///Z:/Projects/ririko-v2-2026/docs/commands.md) §3 (what is wired), [dashboard.md](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md) §4 item 19, [database.md](file:///Z:/Projects/ririko-v2-2026/docs/database.md) §2.2.

## 2. Current State & Verification
- `pnpm build` (`tsc -b`), `pnpm -r typecheck` and `pnpm build:web` pass (the build lists `/dashboard/[guildId]/commands`).
- ESLint shows 0 errors on the touched files; the two warnings in `main.ts` are pre-existing `any`.
- Prettier is clean on every new file and every touched file that was clean on `develop/2.0.0`. `apps/bot/src/main.ts` and `services.ts` already failed Prettier and were not reformatted.
- **Full `vitest run`:** 217 files, 1913 tests pass.
  - A first run lost 14 tests to 5-second timeouts (canvas card rendering and similar) while the user's dev server and bot were running. They passed alone and in a full rerun.
- **New tests:**
  - Core: schema edges and precedence.
  - Both repositories.
  - `GuildConfigService` `commands` store: order-insensitive diff, feed bump, audit, unknown and exempt commands, empty catalog.
  - `CommandOverrideService` cache and TTL.
  - Middleware: disabled, blocked, allowed, bypass, raw member fetch, exempt, DM, thread parent, async cooldown.
  - Bot: cache drop after a watcher tick; catalog mapping and a failed sync.
  - CLI: JSON round trip, empty lists, unknown command.
  - Audit label and coverage entry.
- **Live bot:** the bot running from this working tree restarted on the change and wrote 115 commands to `commands` in `data/ririko.sqlite` (for example `rps` with cooldown 5).
- **Real CLI against a backup copy of the dev database:**
  - Set `rps` off and `daily` to a 30 s cooldown, which wrote two `command_settings` rows, a `commands` feed version and a `cli:<user>` audit row.
  - `nope` was rejected as unknown and `help` as always available.
- **Browser check** on a temporary preview page with the real field and the shared schema, since deleted (the real page needs a Discord sign-in):
  - Rules and chips render.
  - An out-of-range cooldown and a non-numeric cooldown show `Row 1:` errors and keep the input.
  - A valid save round-trips.
  - A blocked role is hidden from that rule's allowed list.
  - No console errors.
  - The check found and fixed two issues: a controlled `open={false}` kept sections shut, and native `max` validation could block a submit on a box inside a folded section.
- **Not verified:** the real page while signed in, and real Discord effects. See §4.

## 3. Roadblocks, Gotchas & Decisions Made
- **Cooldowns now apply to 14 commands that declared them (2 to 5 s) but were never enforced.** Users will notice `⏳ You must wait Ns…` on fast repeats of those commands.
- **Cooldowns are in memory**, so they reset when the bot restarts and are per process (per shard if sharding is added).
- **Autocomplete and help menu interactions** skip the router pipeline, so rules do not apply to them.
- **Aliases share the canonical command's rule.** Rules store canonical names, and the catalog check rejects aliases.
- **Catalog timing:** the page and CLI see new or renamed commands only after the bot restarts. A rule for a command that no longer exists stays stored and matches nothing. The next save through the page or CLI fails with `Unknown command` until that rule is removed.
- **`commands.default_permission` is `varchar(64)` on Postgres.** Permission names are joined with commas and fall back to the first name if they would not fit. Every command today needs at most one permission.
- **No unique key on `command_settings`.** `replaceForGuild` deletes and inserts inside the settings transaction. On Postgres (READ COMMITTED), two concurrent saves could each delete and then each insert, leaving duplicates. `GuildConfigService.update` now bumps the change-feed row **before** writing, so its row lock orders concurrent saves of the same module; the later save deletes what the earlier one inserted. On SQLite, `BEGIN IMMEDIATE` already serializes writes.
- **Outside changes:** `AGENTS.md` and `GEMINI.md` at the repo root had uncommitted edits (11 added lines each) that this session did not make. They were left unstaged.

## 4. Actionable Next Steps for Next Session / Continuing Agent
1. With the real bot and `pnpm dev:web`, signed in as a guild manager:
   1. On Commands, turn `rps` off server wide and save. Within about 5 s (feed tick), `/rps` from a member without Manage Server should reply `🔒 \`rps\` is disabled in this server.`. A Manage Server member should still run it.
   2. Add a channel rule for `rps` in one channel with it on. It should run there only.
   3. Block a role on `daily` and check `🚫 One of your roles cannot use \`daily\` in this server.`.
   4. Set a 30 s cooldown on a command and run it twice.
   5. Check the change notice in the log channel and the "Command settings changed" audit entry.
2. Review and open a PR for `feat/STORY-163-command-overrides` into `develop/2.0.0`.
3. Next in the delivery order: STORY-164 (Reaction Roles builder, Auto Roles and Auto Voice).
