# Handover Notes: STORY-181 Copy a 2.0 SQLite Database Into PostgreSQL (ririko db:copy)

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-07T13:43:25Z · Claude Code (Opus 5.5)

**Why**
- The maintainer wants the local 2.0 SQLite data (users, economy, guild settings, the Waifu TCG catalog and owned cards) on staging. Staging and production use Postgres. `ririko migrate` only handles 1.4.0 databases, and only into SQLite.

**Approach**
- TASK-1811 builds the engine; TASK-1812 adds the CLI and the docs.
- The coordinator runs it live afterwards: stop bot and web, drop and recreate the staging schema, run `db:copy` from the maintainer's PC through an SSH port-forward to the Postgres container, copy the image folders into the volumes, then start the stack.

**Out of scope**
- 1.4.0 legacy migration into Postgres. Copying Postgres back to SQLite.

---

## REVIEW · 2026-10-07T14:30:00Z · Claude Code (Opus 5.5) · OPEN

- TASK-1811 and TASK-1812 are DONE.
- The story stays open (TODO) until CircleCI's `test-postgres` job passes on the PR. That job is the first real run of the PostgreSQL integration suite, which the first acceptance item requires.
- A smoke run of the engine against a copy of the maintainer's real database through `FakePostgres` copied all 93 tables, with equal row counts and matching coin totals.
- After the merge, the coordinator runs the live staging move (handoff steps).

---

## REVIEW · 2026-10-07T15:30:00Z · Claude Code (Opus 5.5) · DONE

- PR #686 merged without CircleCI results: its jobs failed on infrastructure and then stayed queued. To prove the first acceptance item, the coordinator ran the PostgreSQL integration suite itself.
  - It ran against the staging database through an SSH port-forward, in its own random schemas.
  - 8 of 8 passed. The timeouts were raised to cover the tunnel latency.
- The live staging move stopped at the dry run, which refused and committed nothing.
  - Cause: the maintainer's SQLite holds slug and prefixed ids in columns that are uuid in PostgreSQL.
  - BUG-0038 changes those columns to text. The move is rerun after it merges.
- Staging state:
  - It runs again on an empty database.
  - The image volumes already hold the local images: 263 tcg, 26 boss and 407 card files.
  - The pre-wipe dump is in `/opt/ririko/backups/predeploy/`.

---

## REVIEW · 2026-10-08T00:30:00Z · Claude Code (Opus 5.5) · DONE (live move)

- The staging data move ran on v2.0.0-rc.2, which includes BUG-0038:
  1. The watchdog was paused.
  2. A dump was taken: `/opt/ririko/backups/predeploy/20261008T001239Z-before-db-copy.dump`.
  3. Bot and web were stopped, and the schema was dropped and recreated.
  4. A port-forward was opened, followed by a dry run and then `--yes`.
- 14 old `xp_events.source` values of the form `adventure:<session uuid>` (46 characters) did not fit pg `varchar(32)`. With the maintainer's approval, they were set to `adventure` (today's format) in a scratch copy of the SQLite file, and the copy ran from that copy. The original file is unchanged.
- Result: 93 tables and 6073 rows committed, every count equal, wallet 85074 and bank 110000 on both sides.
- Bot and web started healthy on 2.0.0-rc.2, and the bot logged in. 16 users, 374 cards, 18 owned cards and 1933 transactions are in Postgres. The 407 card images are visible in both containers. The watchdog is active again.
