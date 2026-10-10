# Handover Notes: [EPIC-019] Production Harness: Controlled, Automated and Safeguarded Releases

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-09T18:41:41Z · claude-opus-5-5 (coordinator)

**Maintainer direction (2026-10-10)**
- Staging is the only long-lived 2.0 database. It is the case study: several members have the staging bot in their servers for testing.
- There are no production servers yet. When the public bot reaches production, releases will be tightened further: migrations fully controlled, automated and safeguarded.
- **`pnpm db:push` never runs on a production server for the public Ririko bot**, and not on staging either.
- This epic is dedicated to the production harness. More stories will follow as the maintainer lists them.

**Approach**
- The decision record is [ADR-015](../../adr/ADR-015-versioned-schema-migrations.md): versioned, forward-only SQL migrations per dialect, embedded in code, applied by our own small runner. The runner uses a tracking table, a lock, checksums, a SQLite pre-migration backup and a downgrade guard. Existing databases are adopted once, and CI gates the whole flow.
- STORY-185 builds the migration system: TASK-1851, then 1852, then 1853, then 1854. TASK-1855 can run after 1852.
- STORY-186 makes the host deploy apply migrations as a gated step. It requires STORY-185.
- TASK-1333 (welcome text message) is the first feature that ships a migration. It requires STORY-185.
- Staging adoption is the end-to-end proof. After the maintainer merges STORY-185 and STORY-186, the coordinator deploys to staging over SSH, the same way as EPIC-017 host work. The adoption then also repairs the columns that only ever had a "needs `db:push`" note.

**Relevant code** (from CodeGraph during grooming)
- `apps/bot/src/main.ts:82-93`: the startup schema path today (`ensurePostgresSchema`, `ensureTextIdColumns`, `runLegacyUpgrade`, `ensureAdventureSchema`, `ensureCardSerialSchema`, `ensureGuildRegistrySchema`).
- `apps/web/src/lib/server/services.ts:313` `getDatabase`: the dashboard runs three of those upgrades today.
- `packages/database/src/client/sqlite.ts:43` `createSqliteClient`: runs `SQLITE_SCHEMA_DDL` on an empty file.
- `packages/database/src/copy/copy-database.ts:641`: `db:copy` prepares its target the same way.
- `deploy/host/bin/ririko-deploy.sh`: `predeploy_dump`, `apply_release` (pull, `up -d`, `wait_ready`), and a rollback to the previous release without a database restore (exit 4).
- The generated DDL already contains every table that the `ensure*` upgrades create, so the baseline equals today's DDL.

**Pitfalls**
- Never commit hostnames, IP addresses or provider details. Runbooks keep those in the private `docs/hosting.md`.
- The maintainer runs `next dev` on :3000 from this checkout. Startup schema changes affect it; say so in each PROGRESS entry.

**Out of scope (for now)**
- Production host setup itself (EPIC-017 built the tooling), release approval gates, monitoring and alerting. Add these as stories here when the maintainer asks.

---

## REVIEW · 2026-10-10T20:25:16Z · coordinator (claude-opus-5-5) · DONE

**Stories**: STORY-185 (PR #693, with BUG-0041 and BUG-0042) and STORY-186 (PR #696) are DONE. Related work: BUG-0043 (PR #694). The first real migration came from TASK-1333 (PR #697).

**Staging, the case study, 2026-10-11**
1. Manual pre-adoption dump on the host (`backups/before-adoption-*.dump`, mode 600, 93 tables).
2. **v2.0.0-rc.6** (tag on the #696 merge): the host's `ririko-deploy` was still the pre-STORY-186 copy, so the bot adopted the database at startup. `0000_baseline` was recorded with `adopted = true`, adding 0 tables, columns and indexes, with no notes. `status`: Pending `(none)`, Adopted `yes`.
3. The coordinator ran `bootstrap.sh --ref v2.0.0-rc.6` on staging (approved by the maintainer). It updated `ririko-deploy` to the gated version.
4. **v2.0.0-rc.7** (tag on the #697 merge), the gated path end to end:
   - pre-deploy dump, pull, then "migrating the database from the 2.0.0-rc.7 bot image ... the running release is not touched";
   - "✔ Applied 1 migration(s): 0001_welcomer_text_message", then "the database is migrated", start, ready in 6 s;
   - the bot logged "DB_AUTO_MIGRATE is false";
   - `status`: Latest `0001_welcomer_text_message`, Pending `(none)`; containers healthy; dashboard `/api/ready` 200.

**Outcome**: schema changes ship as reviewed migrations with CI gates, existing databases are adopted once, and host deploys apply migrations as a gated step with a dump and a rollback. Self-hosters keep migrate-on-start. `db:push` never ran on staging.

**Follow-ups**
- CHORE-1901 (groomed): the runbook must say to rerun `bootstrap.sh` before the first deploy with the runner, because a deploy never updates the host scripts.
- Production: run the same `bootstrap.sh` and check `status` before its first approval (`docs/release.md` 8.8).
