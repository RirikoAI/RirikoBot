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
