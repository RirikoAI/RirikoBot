# Handover Notes: STORY-125 Raise Test Coverage Toward 80%

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-02T05:25:08Z · Claude Code (Opus 5.5)

**Approach**
- The coverage report of 2026-10-02 (`coverage/coverage-summary.json`) shows:

  | Metric | Coverage |
  |---|---|
  | Lines | 70.27% |
  | Statements | 68.94% |
  | Branches | 58.82% |
  | Functions | 70.44% |

- Reaching 80% lines needs about 2,800 more covered lines. That makes this story 13 points, split into 4 tasks.
- The maintainer decided on 2026-10-02 that this story runs last in EPIC-012, after STORY-124 and STORY-127.
- Each task follows the same steps:
  1. Start from a fresh `pnpm test:coverage`.
  2. Write behaviour tests for the least-covered files first.
  3. Raise the thresholds in `vitest.config.ts` to the new measured floor, rounded down.

**Uncovered lines by area**

| Area | Lines covered | Uncovered lines |
|---|---|---|
| `apps/bot/src/commands` | 64.6% | 1,969 |
| `packages/database/src/repositories` | 48.3% | 1,895 |
| `apps/web/src/app` | 12.8% | 1,128 |
| `apps/cli/src/commands` | 46.3% | 411 |
| `apps/web/src/components` | 0% | 263 |
| bot listeners | 58.7% | not measured |

**Pitfalls**
- Never add coverage excludes to reach the target.
- Never lower a threshold (AGENTS.md rule 5.8).
- Randomness in tests needs deterministic seeds.

**Out of scope**
- Playwright e2e coverage, which is not measured by v8.

---

## FLAG · 2026-10-03T08:29:00Z · from TASK-1253 · ticket-worker (Sonnet 5.5)

**Finding**: `apps/web` has no DOM test environment: `jsdom`, `happy-dom` and `@testing-library/react` are not dependencies of `apps/web` or the root (`jsdom` is in the lockfile only through `packages/music-private`), and `vitest.config.ts` uses `environment: 'node'`.
**Impact on this ticket**: none; the 70% target was reached with server rendering. Interaction logic in client components (`passkey-manager.tsx` 15.9%, `session-list.tsx` 41.2%, `passkey-check-button.tsx` 35.7%, and the add/remove row handlers in the field editors) cannot be exercised without one. Adding `jsdom` and `@testing-library/react` as devDependencies would be a new test framework, so I left it for the maintainer to approve.

---

## REVIEW · 2026-10-03T19:50:00Z · Claude Code (Opus 5.5) · DONE

- All four tasks DONE (TASK-1252, TASK-1251, TASK-1253, TASK-1254), each executed by a Sonnet 5.5 ticket worker and reviewed here. BUG-0032 (flaky rarity test) fixed along the way; BUG-0033 filed to BACKLOG.
- Final `pnpm test:coverage`: lines 80.55%, statements 79.21%, functions 81.8%, branches 68.93% (from 70.65 / 69.3 / 71.69 / 59.11). `vitest.config.ts` thresholds raised from 65/54/69/67 to 79/68/81/80 (statements/branches/functions/lines). No coverage excludes added; the only config addition is `apps/**/*.test.tsx` in `test.include`.
- Acceptance: total lines at least 80% met; every threshold raised to the new floor; tests are behaviour tests. TASK-1251 closed at 70% for repositories (maintainer-approved deviation: SQLite-only ceiling).
- Source fixes found by the coverage work: Postgres AI conversation/message ids (`ai.repository.ts`), legacy giveaway prefix aliases (`giveaway.command.ts`).
- Open for the maintainer: the TASK-1253 FLAG above (DOM test environment for `apps/web`), and the threshold numbers quoted in `AGENTS.md` rule 5.8 and `docs/testing.md`.

---

## REVIEW · 2026-10-03T20:00:00Z · Claude Code (Opus 5.5) · Maintainer decisions

- STORY-125 set to DONE. `render-board.mjs` now accepts a 13+ point story outside BACKLOG when it has child tasks (it is tracked through them).
- TASK-1253 FLAG (DOM test environment) filed as `CHORE-0003` in BACKLOG; `HANDOVERS.md` row removed.
- Threshold numbers in `AGENTS.md` rule 5.8 and `docs/testing.md` updated to 80/81/79/68 (lines/functions/statements/branches).
