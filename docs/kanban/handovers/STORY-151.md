# Handover Note: [STORY-151] DB-Driven Season Curves & Floor Boss Definitions (dungeon_bosses table)

- **Ticket Type & Points**: Story | 8 pts
- **Parent**: `EPIC-015`
- **Author / Agent**: Claude Code (Opus 5)
- **Status**: DONE
- **Timestamp**: 2026-09-19T14:20:00Z

## 1. Summary of Work Accomplished
- **Schema:** new `dungeon_bosses` table in both dialects ([sqlite/tcg.ts](file:///Z:/Projects/ririko-v2-2026/packages/database/src/schema/sqlite/tcg.ts), [pg/tcg.ts](file:///Z:/Projects/ririko-v2-2026/packages/database/src/schema/pg/tcg.ts)), with `DungeonBoss` / `NewDungeonBoss` types. It is documented in [database.md](file:///Z:/Projects/ririko-v2-2026/docs/database.md).
- **Repositories** ([dungeon.repository.ts](file:///Z:/Projects/ririko-v2-2026/packages/database/src/repositories/dungeon.repository.ts)):
  - `DungeonBossRepository`: `findById`, `listForSeason`, and an idempotent `upsert` (insert or replace by id).
  - `DungeonFloorRepository.upsertBySeasonAndFloor` keeps the existing row id.
- **SQLite DDL:**
  - `SQLITE_SCHEMA_DDL` is regenerated. It was stale: it lacked `user_cards.battles_won` / `is_favorite`.
  - New `pnpm -F @ririko/database db:generate-ddl` ([generate-sqlite-ddl.mjs](file:///Z:/Projects/ririko-v2-2026/packages/database/scripts/generate-sqlite-ddl.mjs)) regenerates it.
  - New parity test [ddl.test.ts](file:///Z:/Projects/ririko-v2-2026/packages/database/src/schema/sqlite/ddl.test.ts) fails CI when the DDL misses any table or column. The ALTER TABLE workarounds in the TCG tests were removed.
- **Validation** ([boss-definition.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/dungeon/boss-definition.ts)): zod schemas for:
  - `BossDefinition`: absolute stats or statMultipliers, crit, skill `{name, mpCost, powerMult}`, enrage, wardLayers `{element, hpPercent}`, maxTurns.
  - The floor lineup `[{ bossId, overrides? }]`.
  - The season curve: baseStats, growth parameters, boss multipliers, enrage, `affixStartFloor`.
  - Invalid stored JSON is logged and ignored, so one bad row cannot break a climb.
- **Runner** ([dungeon-runner.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/dungeon/dungeon-runner.ts)):
  - Season floors build the scaling engine from the season row (`scaling_model` + `scaling_params`), read the floor row (energy cost, lineup) and the boss row.
  - Precedence: floor overrides > boss definition > season curve > code defaults.
  - Seasonal affixes are off below `affixStartFloor`.
  - Returns `bossProfile` (name, anime, title, flavor text, image path, signature drop) for STORY-155/156.
  - Tutorial enemy building is extracted to `buildTutorialEnemy` (same behavior).
  - `runFloor` now drives `DungeonBattleSession` auto-battle instead of a second, duplicated combat engine (`simulateDungeonCombat`, ~200 lines removed). It was only used by one test.
- **Session** ([dungeon-battle-session.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/dungeon/dungeon-battle-session.ts)):
  - Enrage is configurable (`startTurn`, `perTurn`, `trueDamage`; default is the old turn 10 / +100% / true damage).
  - **Bosses now cast their skill:** they gain +20 MP per basic attack, then hit for `powerMult` × damage (default 1.5×) once they can pay the cost. Tutorial bosses never cast.
  - Generated bosses start at 0 MP with a 60 MP skill.
  - `bossProfile` is exposed on the session.

## 2. Current State & Verification
- New [db-driven-bosses.test.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/__tests__/db-driven-bosses.test.ts) (6 tests, real SQLite): schema validation and merging, boss skill casting, configurable enrage, a full season+floor+boss setup (curve, multipliers, overrides, ward, enrage, affix gating, profile), fallback to generated bosses, idempotent upserts.
- DDL parity test passes; it fails on the old DDL (verified).
- `pnpm typecheck` clean. eslint 0 errors.
- `pnpm test`: 1141/1148. The 7 failures are the live-network music extractor tests (SoundCloud 403 and timeouts), which were already failing before this change.

## 3. Roadblocks, Gotchas & Decisions Made
- PostgreSQL gets new tables through `pnpm db:push` (drizzle-kit push). There are no migration files in this repo. SQLite dev databases created before this change need `db:push` or `db:reset` to get `dungeon_bosses`, because the DDL only bootstraps empty databases.
- `dungeon_floors.id` is a UUID in PG, so floor rows use random ids and are addressed by `(season_id, floor_number)`.
- Enabling boss skills makes every season floor slightly harder. The balance simulator (STORY-152) measures this, and STORY-159 tunes it.
- The seeded S1 row uses `EXPONENTIAL` with empty params, which gives the same numbers as before. Real S1 tuning ships with STORY-154/159.

## 4. Actionable Next Steps
- STORY-152: balance simulator over `DungeonRunner.prepareFloorSetup` + `DungeonBattleSession`.
- STORY-153: the boss builder writes `dungeon_bosses` and `dungeon_floors` through `upsert` / `upsertBySeasonAndFloor`.
