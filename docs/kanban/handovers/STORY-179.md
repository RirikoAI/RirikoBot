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
