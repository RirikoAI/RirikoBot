# Handover Note: [STORY-042] Leveling 2.0, Karma & High-Performance Materialized Leaderboards

- **Ticket Type & Points**: Story | 5 pts (Fibonacci: 2 + 3)
- **Author / Agent**: lead-architect / economy
- **Status**: DONE
- **Timestamp**: 2026-09-16T04:00:00+08:00
- **Parent Epic**: [`EPIC-004: Centralized Transactional Economy & Banking Engine`](file:///Z:/Projects/ririko-v2-2026/docs/kanban/BOARD.md)

---

## 1. Executive Summary & Architectural Scope
`STORY-042` completes the Leveling, Karma, and Leaderboard Subsystem for **Ririko AI 2.0.0**, fulfilling Section 33 of `BLUEPRINT.md` and Section 6 of `docs/economy.md`.

Legacy 1.4.0 systems suffered from $O(N)$ full table scans across user tables whenever any member opened `/profile` or `/leaderboard`, creating severe database bottlenecks. `STORY-042` rearchitects this with:
1. **Mathematical Leveling Progression**:
   - Exact incremental requirement: $\Delta\text{XP}(L) = 5L^2 + 50L + 100$.
   - Closed-form cubic cumulative summation: $\text{TotalXP}(L) = \frac{5(L-1)L(2L-1)}{6} + 25(L-1)L + 100L$.
   - Monotonic binary search for $O(1)$ bidirectional XP-to-Level resolution.
   - Synchronized bank capacity scaling on level up ($10,000 + \text{Level} \times 2,500$).
   - Dual notification filtering honoring user opt-in (`users.notifyLevelUp`) and server broadcast opt-in (`guildSettings.karmaNotificationsEnabled`).
   - Legacy Karma profile management.
2. **Materialized Leaderboard Snapshot Engine**:
   - Background sweep worker (`materializeAll`) computing dense server ranks and cross-server global ranks into `leaderboard_snapshots`.
   - $O(1)$ point lookups on composite index `[userId, guildId]` for profile cards and balance checks.
   - Snapshot TTL validation (10 minutes) with dynamic fallback calculation when snapshots are missing or stale.
   - Paginated Dual Leaderboards (`/leaderboard server` and `/leaderboard global`) with automated on-demand materialization.

---

## 2. Child Tasks Breakdown
| Task ID | Title | Points | Status | Verification Note |
|---|---|---|---|---|
| [`TASK-0421`](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0421.md) | Leveling Progression Formula ($5L^2 + 50L + 100$), Level-Up Events & Karma Controls | 2 | DONE | 12 tests in `leveling.service.test.ts` |
| [`TASK-0422`](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0422.md) | Materialized Leaderboard Snapshot Engine, Cron Calculation & $O(1)$ Dense Rank Queries | 3 | DONE | 12 tests in `leaderboard.service.test.ts` + 14 tests in `repositories.test.ts` |

---

## 3. Verification & Quality Gates
- **`pnpm test`**: Passed (26 test files, 235 tests passing).
- **`pnpm typecheck`**: Passed cleanly across all workspace packages.
- **`pnpm lint`**: Clean pass (0 errors, 0 warnings).
- **`pnpm build`**: Successful compilation (`tsc -b`).

---

## 4. Next Actionable Steps
- Submit PR for `STORY-042` targeting `develop/2.0.0` and merge via squash.
- Prepare next epic/story: `STORY-043` (Item Catalog, Usable Consumables & Anti-Abuse Daily Potion Ceilings).
