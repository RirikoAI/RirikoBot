# Handover Note: [STORY-023] Legacy 1.4.0 SQLite Migration Engine & CLI

- **Story**: `STORY-023: Legacy 1.4.0 SQLite Migration Engine & CLI`
- **Story Points**: 3 pts (Fibonacci)
- **Epic**: [`EPIC-002: Dual-Dialect Drizzle ORM & Data Access Layer`](file:///z:/Projects/ririko-v2-2026/docs/kanban/BOARD.md) (21 pts, Phase 2)
- **Author / Agent**: lead-architect / database / migration
- **Status**: DONE
- **Timestamp**: 2026-09-15T08:56:00+08:00
- **Base Branch**: `develop/2.0.0`
- **Feature Branch**: `feat/STORY-023-legacy-migration`

---

## 1. Executive Summary & Deliverables
`STORY-023` completes the zero-data-loss migration capability for Ririko AI 2.0.0, enabling safe, idempotent upgrades from legacy 1.4.0 SQLite deployments to 2.0.0 SQLite or PostgreSQL databases.

### Key Deliverables:
1. **`LegacySqliteInspector` ([`packages/database/src/migration/inspector.ts`](file:///z:/Projects/ririko-v2-2026/packages/database/src/migration/inspector.ts))**:
   - Zero-mutation guarantee: connects exclusively via `better-sqlite3` with `{ readonly: true, fileMustExist: true }`.
   - Comprehensive audit covering all 17 legacy tables, row counts, anomaly checks, and total currency balance calculations.
2. **`LegacyTransformer` ([`packages/database/src/migration/transformer.ts`](file:///z:/Projects/ririko-v2-2026/packages/database/src/migration/transformer.ts))**:
   - Transforms all 17 legacy entities into normalized 2.0.0 Drizzle schemas.
   - Preserves financial conservation (`1800n === 1800n`) and creates initial double-entry ledger records with type `MIGRATION_V1`.
   - Maps user karma to `xp_accounts` with `guildId: 'global'`.
   - Safely skips deprecated plaintext configuration secrets (Twitch client secrets, Replicate tokens) per Section 85 of `BLUEPRINT.md`.
3. **`MigrationEngine` ([`packages/database/src/migration/engine.ts`](file:///z:/Projects/ririko-v2-2026/packages/database/src/migration/engine.ts))**:
   - Supports dry-run analysis (`--dry-run`) returning table counts and coin totals without modifying target state.
   - Performs live chunked batch inserts (`batchSize: 500`) inside ACID transactions (`withTransaction`) for both SQLite and PostgreSQL.
   - Built-in verification routine (`verify()`) validating target coin conservation and user count integrity.
4. **CLI Subcommands ([`apps/cli/src/commands/migrate.ts`](file:///z:/Projects/ririko-v2-2026/apps/cli/src/commands/migrate.ts))**:
   - `ririko migrate:legacy <sqlite-file> [--dry-run] [--batch-size <n>]`
   - `ririko migrate:verify <sqlite-file>`
5. **Comprehensive Automated Test Suite ([`packages/database/src/migration/migration.test.ts`](file:///z:/Projects/ririko-v2-2026/packages/database/src/migration/migration.test.ts))**:
   - Validates readonly inspector, transformer math, dry-run safety, live atomic migration, and integrity verification.

---

## 2. Quality Gates & Verification
- **Build**: `pnpm run build` (Clean compile across all workspaces)
- **Typecheck**: `pnpm -r run typecheck` (0 errors across 5 workspace projects)
- **Lint**: `pnpm run lint` (0 warnings, 0 errors)
- **Format**: `pnpm run format:check` (Prettier clean)
- **Test**: `pnpm test` (**54 / 54 tests passing** across 11 test suites)

---

## 3. Epic Completion & Next Phase
With `STORY-023` completed, **`EPIC-002: Dual-Dialect Drizzle ORM & Data Access Layer` (21 pts, Phase 2)** is now **100% DONE**!
- `STORY-021`: 40+ Dual-Dialect Drizzle Schemas & Migration Pipeline (13 pts) — MERGED (#565)
- `STORY-022`: Dialect-Agnostic Repositories & ACID Transaction Abstractions (5 pts) — MERGED (#566)
- `STORY-023`: Legacy 1.4.0 SQLite Migration Engine & CLI (3 pts) — READY FOR MERGE

Next on Roadmap:
- **`EPIC-003: Discord.js 14 Gateway & O(1) Command Router`** (21 pts, Phase 3).
