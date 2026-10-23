# Handover Notes: STORY-203 Scrum-Kanban-Template 0.8.0: Every Board Change Through Scripts

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-23T15:52:42Z · claude-opus-5-5 (coordinator)

**Where:** earnestangel/Scrum-Kanban-Template (default branch `master`, version 0.7.0, tests run with `npm test` on Windows and Linux in `.github/workflows/template-tests.yml`). The template has no board of its own, so its work is tracked here. A separate session in the template checkout implements TASK-2031 to TASK-2033 on a feature branch and opens a PR; the maintainer merges it and tags 0.8.0. The coordinator here reviews that PR against each task's acceptance and closes the tasks.

**What exists in 0.7.0:** `ticket.mjs` claim, handover, note (GROOMING, FLAG), review, recover and show; `board-lib.mjs` `nowIso()` (UTC) and `formatHeader`; `worker_model` on claim; `tiers.json` model patterns; a pre-commit board check; the installer `bin/scrum-kanban.mjs` with `migrateBoard` and a merging settings.json upgrade.

**Gaps this story fills:** creating and grooming tickets by script, editing and deleting grooming notes, `created_at`, `updated_at`, `last_actor` and `claims` on every ticket, the web board sort and filters, and enforcement that nobody edits the board by hand.

**Time stamps:** stored as ISO 8601 UTC so they sort and compare. The maintainer asked for automated local time: the script reads the local machine clock (no agent passes a time), and the views show local time.

**Out of scope:** anything Ririko-specific (release scripts, Ririko rules).
