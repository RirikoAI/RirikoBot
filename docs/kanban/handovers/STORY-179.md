# Handover Notes: STORY-179 Backups, Health Watchdog & Heartbeat Alerts

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-04T18:50:17Z · Claude Code (Opus 5.5)

**Approach**
- TASK-1791 (backup) and TASK-1792 (watchdog) are independent of each other. Both take the deploy lock that TASK-1781 defines, so TASK-1792 requires TASK-1781; TASK-1791 should reuse the same lock path from `ririko.conf.example`.

**Pitfalls**
- Compose prefixes volume names with the project name: the volumes are `ririko_postgres_data`, `ririko_ririko_data`, `ririko_card_images`, `ririko_boss_images`, `ririko_welcomer_backgrounds` and `ririko_lavalink_plugins`.
- Postgres is backed up by `pg_dump`, never by copying `postgres_data`. `lavalink_plugins` is a download cache and is not backed up.

---

## REVIEW · 2026-10-04T22:54:20Z · Claude Code (Opus 5.5) · DONE

- TASK-1791 (restic backups, lock held for the dump only) and TASK-1792 (watchdog) are DONE and reviewed. `pnpm vitest run scripts` passes with 197 tests.
- Live runs wait for the maintainer's bucket, access key and Healthchecks.io checks. TASK-1772 documents the setup (FLAGs from both tasks).
