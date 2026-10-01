# Handover Notes: CHORE-0002 Link Stories, Tasks and Chores to Their Epics

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-01T14:09:36Z · Claude Code (Opus 5.5)

**Approach**
1. In `board.json`, rename each story's `epic` field to `parent` in place.
2. Add EPIC-016 "Interactive Branching Adventure RPG" (DONE, 21 pts) as the parent of STORY-170, which had no epic.
3. Set each epic's `children` to its stories, in board order.
4. Move TASK-1431/1432/1433 and TASK-1321/1322 from `bugs` to `tasks`.
5. Give every chore a `parent`, using its handover note or `requires`.
6. Switch `scripts/build-status-site.ts` and its test from `epic` to `parent`.

**Relevant code**
- `scripts/kanban/board-web/index.html` `epicOf()`: walks `parent` up to an epic. Stories without `parent` show as "No epic".
- `scripts/kanban/render-board.mjs`: the Parent column uses `parent`; the Epics table uses each epic's `children`.
- `scripts/build-status-site.ts` `buildStatusModel`: groups stories by `s.epic` today.

**Pitfalls**
- `render-board.mjs` rejects references to unknown tickets in `children`, `requires` and `blocks`.
- CHORE-0603's handover says "Parent: None". It aligns the command prefix, so it goes under EPIC-003.

**Out of scope**
- Changing epic statuses or story estimates.
- Explicit `children` on stories: tasks link to stories through `parent`.

---

## PROGRESS · 2026-10-01T14:11:16Z · Claude Code (Opus 5.5) · REVIEW

**Files changed**
- `docs/kanban/board.json`:
  - All 91 stories: `epic` renamed to `parent`, in place.
  - New EPIC-016 "Interactive Branching Adventure RPG" (DONE, 21 pts), the parent of STORY-170.
  - Every epic has `children` listing its stories.
  - TASK-1431/1432/1433 (STORY-143) and TASK-1321/1322 (STORY-132) moved from `bugs` to `tasks`.
  - Chore parents:
    - CHORE-0301, CHORE-0603: EPIC-003
    - CHORE-0601: EPIC-006
    - CHORE-1101: EPIC-011
    - CHORE-1401: EPIC-014
    - CHORE-0602: EPIC-015
    - CHORE-1321: STORY-132
    - CHORE-1701/1702/1703: STORY-170
    - CHORE-0001, CHORE-0002: EPIC-000
  - CHORE-0001 closed as DONE (PR #672 merged).
- `scripts/build-status-site.ts`, `scripts/build-status-site.test.ts`: group stories by `parent`; the `epic` field is gone.
- `docs/kanban/BOARD.md`: regenerated.

**Verification**
- `node scripts/kanban/render-board.mjs --check`: board OK, warnings only.
- `pnpm vitest run scripts/build-status-site.test.ts`: 5 passed. ESLint and Prettier clean on both files.
- Link check script: no `epic` field left, every ticket reaches an epic through `parent`, epic `children` match, no task in `bugs`.
- `pnpm site:build`: 17 epic progress rows.
- Web board (`board-server.mjs`): 17 epic chips with progress. The "No epic" filter shows no tickets.

**Decisions & gotchas**
- CHORE-0603's handover says "Parent: None". It aligns the command prefix, so it went under EPIC-003.
- EPIC-016 is 21 pts because epic points must be Fibonacci; its tasks total 67.
- Epic progress on the web board counts every child ticket, so it differs from the status site, which counts story points only.

**Next steps**
- The user decides on commit, push and a PR to `develop/2.0.0`.

---

## REVIEW · 2026-10-01T14:20:42Z · Claude Code (Opus 5.5) · DONE

**verify_cmd rerun**
- `node scripts/kanban/render-board.mjs --check`: board OK, 344 tickets, warnings only.
- `pnpm vitest run scripts/build-status-site.test.ts`: 5 passed.

**Acceptance**
- [x] Every story has `parent` set to its epic and no ticket keeps the legacy `epic` field.
- [x] Every story, task, chore and bug reaches an epic through its `parent` chain.
- [x] Each epic's `children` lists exactly the stories whose `parent` is that epic.
- [x] Tasks no longer sit in the `bugs` array.
- [x] STORY-170 belongs to the new EPIC-016.
- [x] scripts/build-status-site.ts reads `parent`, and its test passes.

The user reviewed the change and approved it on 2026-10-01.
