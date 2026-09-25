# Handover Note: CHORE-1101 Cross-Process Guild Config Change Feed

- **Ticket Type & Points**: Chore | 2 pts
- **Epic**: `EPIC-011` (prerequisite of `TASK-1111`)
- **Author / Agent**: Claude Code (Opus 5.5)
- **Status**: DONE
- **Timestamp**: 2026-09-25
- **Branch**: `feat/STORY-111-guild-config` (shipped with STORY-111)

## 1. Summary of Work Accomplished
- New dual-dialect table `guild_config_versions` (primary key `guild_id` + `module`, `version`, indexed `updated_at`):
  - Schemas: [sqlite](file:///Z:/Projects/ririko-v2-2026/packages/database/src/schema/sqlite/guild-config.ts), [pg](file:///Z:/Projects/ririko-v2-2026/packages/database/src/schema/pg/guild-config.ts).
  - The SQLite DDL is regenerated (80 tables).
- [GuildConfigVersionRepository](file:///Z:/Projects/ririko-v2-2026/packages/database/src/repositories/guild-config-version.repository.ts):
  - `bump(guildId, module, now, tx?)` is an upsert that increments the version; call it inside the settings transaction.
  - `listChangedSince(since)` returns rows changed after that time.
- New `guild:configChanged` event (`guildId`, `module`, `version`) in the core `CoreEvents` map.
- [GuildConfigWatcher](file:///Z:/Projects/ririko-v2-2026/packages/services/src/guild/guild-config-watcher.ts):
  - Polls every 5 seconds and looks 60 seconds back from the newest row it has seen.
  - Emits an event only when a row's version differs from the last version seen. This catches two writes in the same millisecond, writes committed out of timestamp order, and small clock differences between writer processes.
- Bot wiring:
  - In [services.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/services.ts), `guild:configChanged` evicts `GuildSettingsService`'s cache for the guild on any module change (one cheap reload).
  - In [main.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/main.ts), the watcher starts on gateway READY and stops on shutdown.

## 2. Current State & Verification
- New tests:
  - `guild-config-version.repository.test.ts` (3): versioning, ordering, rollback with the surrounding transaction.
  - `guild-config-watcher.test.ts` (4): emits once, same-millisecond write, out-of-order commit, pre-start changes ignored.
  - `apps/bot/src/guild-config-sync.test.ts` (1): simulates a dashboard write followed by a watcher tick; the bot's cached prefix then updates.
- `tsc -b` and the DDL parity test pass.

## 3. Roadblocks, Gotchas & Decisions Made
- Nothing writes to the feed yet. `GuildConfigService` (TASK-1111) is the first writer.
- Any later module whose bot-side service caches settings must subscribe to `guild:configChanged` in `apps/bot/src/services.ts` when its dashboard page ships. Examples: `DropManager` (TASK-1121) and the anti-raid config (TASK-1141).
- A writer whose clock runs more than the 60-second overlap ahead would move the watermark forward and hide other writers' changes until their own clocks catch up. Run NTP on hosts that share a database.
- Existing databases need `pnpm db:push` to create the table (SQLite auto-migration only runs on an empty file).

## 4. Actionable Next Steps for Next Session / Continuing Agent
1. TASK-1111: `GuildConfigService.update` must call `bump(guildId, module, now, tx)` inside the same `withTransaction` as the settings write and the audit entry.
