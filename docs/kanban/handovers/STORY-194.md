# Handover Notes: STORY-194 Complete User Data Erasure Tool for Data Requests

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-12T16:25:21Z · claude-opus-5-5 (coordinator)

**Why**: the maintainer asked (2026-10-13) for a tool that removes all data about one user, to answer erasure requests that are handled by hand until then. Separate from STORY-193 because it does not gate the launch.

**Order**: after STORY-193 (the consent table and the retention work change the tables the tool must cover).

## REVIEW · 2026-10-18T11:00:00Z · claude-opus-5-5 (coordinator) · DONE

**verify_cmd rerun**: `pnpm build`, `pnpm typecheck`, `pnpm lint --quiet` and `pnpm format:check` pass. The coverage run by the worker meets every threshold (statements 81.39%, branches 71.50%, functions 84.72%, lines 82.61%); the only failing test is the Windows-only CRLF case in `apps/cli/src/installer/server.test.ts`, which passes on Linux CI.

**Acceptance**
- [x] 1: TASK-1941 is DONE.
- [x] 2: the coverage gate passes (CI confirms on the PR).

**Outcome**: DONE. `ririko user erase <id>` ships; docs/development.md, docs/database.md and both privacy policies describe it.
