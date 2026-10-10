# Handover Notes: [STORY-185] Versioned Forward-Only Schema Migrations With One-Time Baseline Adoption

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-09T18:41:41Z · claude-opus-5-5 (coordinator)

**Approach**
- Implement ADR-015 decisions 1–8 and 10. Read the ADR first; it is the contract for every task here.
- Order:
  - TASK-1851: authoring and embedding. Nothing runs migrations yet.
  - TASK-1852: the runner, tested with injected migrations.
  - TASK-1853: adopting existing databases.
  - TASK-1854: wiring into the bot, CLI, `db:copy` and dashboard. This is the first task that changes runtime behaviour.
  - TASK-1855: the CI gates. It needs only 1851 and 1852, and may run before 1853 when that helps.
- One writer of the schema: the bot (or the CLI). The dashboard only reads the migration status.

**Decisions made while grooming**
- **Own runner, not Drizzle's migrator.** Drizzle decides what to run by timestamp, so a migration merged from an older branch is skipped without error. It also has no lock and uses a fixed `drizzle` schema. Our runner is small; the ADR has the details.
- **Embedded migrations.** The images copy only `dist` (`Dockerfile:82-89`), and the dashboard is a Next.js bundle. A TypeScript module, generated the way `ddl.ts` is today, avoids any runtime file reads.
- **Tracking table name `ririko_schema_migrations`**, in the connection's current schema, because the deploy uses `search_path`.

**Pitfalls**
- `autoMigrate` is used by many tests (`packages/database/src/repositories/*.test.ts`, `migration.test.ts`, `upgrade.test.ts`, and a services test). TASK-1854 must keep them passing without weakening them.
- The 1.4.0 legacy upgrade (`runLegacyUpgrade`) is a data import, not a schema migration. It runs after `migrateDatabase` and does not change.

**Out of scope**
- Down migrations, a migrations UI on the dashboard, and changing any existing table.
