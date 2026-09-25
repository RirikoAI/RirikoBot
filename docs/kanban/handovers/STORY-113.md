# Handover Note: STORY-113 Server Analytics Overview, Moderation Case Log Inspector & Dashboard Audit Viewer

- **Ticket Type & Points**: Story | 5 pts (`TASK-1131` = 3, `TASK-1132` = 2)
- **Epic**: `EPIC-011`
- **Author / Agent**: Claude Code (Opus 5.5)
- **Status**: REVIEW
- **Timestamp**: 2026-09-26
- **Branch**: `feat/STORY-113-overview-case-log` (targets `develop/2.0.0`)
- **Commits**: `32753be` (start), `e82c7b8` (TASK-1131), `5677065` (TASK-1132)

## 1. Summary of Work Accomplished

### TASK-1131: Command usage counters, bot status heartbeat, voice activity and the Overview tab
- **New tables** in both dialects ([sqlite/activity.ts](file:///Z:/Projects/ririko-v2-2026/packages/database/src/schema/sqlite/activity.ts), [pg/activity.ts](file:///Z:/Projects/ririko-v2-2026/packages/database/src/schema/pg/activity.ts)). `ddl.ts` is regenerated.
  - `command_usage_daily`: primary key (`guild_id`, `day`, `command_name`), `count`. `day` is the UTC day as `YYYY-MM-DD`.
  - `bot_status`: one row, `id = 'bot'`, with gateway ping, guild count, version, start time and last update.
  - `guild_voice_activity`: per guild, the voice channels that have at least one member who is not a bot.
- **[BotActivityRepository](file:///Z:/Projects/ririko-v2-2026/packages/database/src/repositories/bot-activity.repository.ts)**: adds usage counts (`count = count + excluded.count`), lists and prunes usage, saves and reads the status, and sets, reads and clears voice activity.
- **Router hook:** [CommandRouter](file:///Z:/Projects/ririko-v2-2026/packages/discord/src/router/router.ts) has a new `onCommandRun(ctx)` option.
  - It runs when a command passes the middleware pipeline, just before `execute`.
  - An error in the hook is logged and does not stop the command.
- **[CommandUsageRecorder](file:///Z:/Projects/ririko-v2-2026/packages/services/src/activity/command-usage-recorder.ts):**
  - `record` only updates memory. Commands outside a guild are skipped.
  - `flush` writes the buffer every 60 seconds and on shutdown. When a write fails, the counts go back into the buffer.
  - Rows older than 90 days are deleted once per UTC day.
- **[BotStatusReporter](file:///Z:/Projects/ririko-v2-2026/packages/services/src/activity/bot-status-reporter.ts):**
  - Writes the status row every 30 seconds, starting on gateway READY. `BOT_STATUS_STALE_MS` (90 s) marks the bot offline.
  - Writes a guild's voice activity only when its channels change, and removes the row when voice empties.
  - The first write after startup clears `guild_voice_activity`, because rows from an earlier run may be stale.
- **Bot wiring:** [services.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/services.ts) and [main.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/main.ts). Both engines start on READY. On shutdown the reporter stops and the recorder flushes. `@ririko/services/activity` is a new package export.
- **[Overview page](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/overview/page.tsx)**, now first in the sidebar and the page `/dashboard/{guildId}` redirects to:
  - Stat tiles: members, online now, active voice channels, and bot latency.
  - A 30-day usage chart ([usage-chart.tsx](file:///Z:/Projects/ririko-v2-2026/apps/web/src/components/usage-chart.tsx)). It is SVG with a tooltip on hover and keyboard focus, and has a "Show as a table" view.
  - Most used commands, voice channels in use, and Ririko's status (online or offline, running since, version).
  - The data comes from [guild-overview.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/guilds/guild-overview.ts). `GuildResourceDirectory` gained `memberCounts` (`with_counts`, cached 60 s) and `channelNames`.

### TASK-1132: Case log inspector and audit log viewer
- **Repositories:**
  - `ModerationRepository.listCases` accepts `createdFrom`, `createdBefore` and a `beforeCaseNumber` cursor. `total` ignores the cursor.
  - New `listCaseTypes` and `listWarnings` (active and inactive).
  - `AuditLogRepository.listByGuild` pages newest first with a `(created_at, id)` cursor.
- **[Case Log](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/cases/page.tsx)** (`/cases`):
  - A GET filter form: member ID, moderator ID, action (the types this guild has used) and a UTC date range. Invalid values show errors at their fields.
  - 25 cases per page with "Older cases" and "Newest cases" links. Clicking a member filters the log by that member.
- **[Case page](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/cases/%5BcaseNumber%5D/page.tsx)** (`/cases/{number}`): the case with its metadata, the member's warnings (and whether each still counts toward escalation), staff notes, and other cases.
- **[Audit Log](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/audit-log/page.tsx)**:
  - Each entry shows the actor, the source (Dashboard or CLI), and a before/after table per field.
  - Channel and role IDs are shown as `#name` and `@name`. Lists are comma separated, and objects such as escalation steps are shown as JSON.
- **[UserDirectory](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/guilds/user-directory.ts):** names and avatars from `GET /users/{id}`, cached for 10 minutes, including misses. IDs that are not snowflakes (`AUTOMOD`, `cli:<user>`) are shown as they are.
- **Nav:** Case Log and Audit Log entries. A nav item now also stays highlighted on its sub-pages.
- **Docs:** [dashboard.md](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md) §4 and §5, and [database.md](file:///Z:/Projects/ririko-v2-2026/docs/database.md) §2.15.

## 2. Current State & Verification
- `pnpm build` (`tsc -b`), `pnpm -r typecheck` and `pnpm build:web` pass. The new routes are listed in the build output.
- ESLint shows no errors on the touched areas.
- Prettier is clean on every new file and on every touched file that was clean on `develop/2.0.0`. `apps/bot/src/main.ts`, `apps/bot/src/services.ts`, `packages/database/src/schema/types/index.ts` and `moderation.repository.ts` already failed Prettier on `develop/2.0.0` and were not reformatted.
- **Full `vitest run`:** 211 files, 1873 tests pass.
- **New tests:**
  - Repository tests on in-memory SQLite: usage upsert, pruning, status upsert, voice rows, the case cursor and filters, case types, all warnings, and audit paging with equal timestamps.
  - Router hook: order, no call when a middleware stops the command, and a failing hook.
  - Recorder and reporter.
  - Member counts, channel names and the user directory.
  - Overview, case log and audit log loaders, and chart ticks.
- **`drizzle-kit push` on a backup of `data/ririko.sqlite`:** the only statements were three `CREATE TABLE`s (`bot_status`, `command_usage_daily`, `guild_voice_activity`).
- **Browser check** of the usage chart on a temporary preview route on the running dev server (deleted before committing): the bars, axis, hover and keyboard-focus tooltip, and first and last axis labels. The check found and fixed a clipped last label.
- **Not verified:**
  - The real pages while signed in with Discord.
  - A running bot writing the three tables against a real gateway.
  - The pages against Postgres. The queries are dual-dialect, but only SQLite ran.

## 3. Roadblocks, Gotchas & Decisions Made
- **Run `pnpm db:push` before using the Overview page or starting the bot on an existing database.** Without the three tables, Overview fails, and the bot logs a failed status or usage write every interval. The push only creates tables, so existing data is not changed.
- **Voice activity needed a new table.** Discord REST has no endpoint that lists a guild's voice states, and the dashboard has no channel to the bot process. The bot publishes what it sees on the status interval. When the bot is offline, the page shows voice activity as unknown instead of old data.
- **Counting:** a command counts when it passes the middleware pipeline, including when `execute` later throws. Commands stopped by a middleware and DM commands do not count. A crash loses at most one minute of counts. Days are UTC. The chart says so; per-guild time zones are not applied.
- **The audit viewer does not show IP addresses or user agents.** Every manager of a guild can open the page, and those values identify the actor's network and device. They stay in `audit_logs` for owner-level review.
- **Production CSP blocks server-rendered `style` attributes** (`style-src` has only a nonce). The chart and the top-command bars use SVG attributes and Tailwind classes. The chart tooltip sets `left` only after hydration through the CSSOM, which the CSP allows. `GuildIcon`'s fallback already uses a `style` attribute and is affected in production; it was not changed here.
- **User names cost REST calls.** A cold case-log page can make up to 50 `GET /users/{id}` calls; `@discordjs/rest` queues them under the rate limit. Results, including misses, are cached for 10 minutes per process.
- **Case-number cursor:** `createCase` computes `MAX + 1` without a unique index, so two concurrent cases can share a number. The cursor then skips the duplicate at a page boundary. This is a pre-existing gap, not new.

## 4. Actionable Next Steps for Next Session / Continuing Agent
1. Review the branch and open a PR to `develop/2.0.0` when the user asks.
2. After merge, run `pnpm db:push` on each existing database, then restart the bot so the heartbeat and counters start.
3. Sign in to the dashboard and check Overview, Case Log (filters and paging) and Audit Log against real data.
4. EPIC-012 (`TASK-1221`): the `/health` and `/ready` probes can read `bot_status` through `BotActivityRepository.getBotStatus(BOT_STATUS_ID)` and `BOT_STATUS_STALE_MS`.
5. Next in the EPIC-011 order: STORY-115.
