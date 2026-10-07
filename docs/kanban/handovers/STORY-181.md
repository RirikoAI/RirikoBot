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
