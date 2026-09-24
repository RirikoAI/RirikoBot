# Scrum Kanban & Sub-Agent Knowledge Transfer Protocol

## 1. System Overview & Standing Rules
This document defines the official **Scrum Kanban Governance & Handover Protocol** for Ririko AI 2.0.0.
These rules are **standing operating procedures** binding for all engineering sessions, the primary coordinator agent, and all invoked sub-agents.

---

## 2. Ticket Hierarchy & Taxonomy

Every unit of work is classified into one of five ticket types:

```text
Epic (EPIC-XXX)
  └── Story (STORY-XXX)
        └── Task (TASK-XXX)
  
Chore (CHORE-XXX)
Bug (BUG-XXX)
```

1. **Epic (`EPIC-XXX`)**: Major architectural milestone or subsystem (e.g. `EPIC-001: Monorepo Foundation & Workspace Setup`).
2. **Story (`STORY-XXX`)**: Deliverable feature or vertical capability under an Epic that delivers tangible value.
3. **Task (`TASK-XXX`)**: Concrete technical step required to complete a Story.
4. **Chore (`CHORE-XXX`)**: Tooling, maintenance, dependency management, or refactoring without direct feature behavior changes.
5. **Bug (`BUG-XXX`)**: Defects, broken invariants, test failures, or regressions.

---

## 3. Estimation & Grooming Rules

1. **Fibonacci Sequence**: All work items must be estimated in story points using the standard Fibonacci sequence:
   $$\mathbf{1,\; 2,\; 3,\; 5,\; 8,\; 13,\; 21}$$
   - **1–2 pts**: Trivial change, configuration tweak, small documentation update, single isolated utility test.
   - **3–5 pts**: Standard service method, single Discord command with options, schema migration with repository functions.
   - **8 pts**: Complex cross-cutting subsystem component (e.g. audio queue manager, atomic P2P trade transaction).
   - **13+ pts**: Too large! Must be broken down into smaller Stories or Tasks before entering `TODO`.
2. **Pre-Start Estimation Invariant**: No ticket may transition from `BACKLOG` to `TODO` or `IN_PROGRESS` without an approved Fibonacci estimate.
3. **Grooming in Batches**: Tickets are groomed and estimated in logical clusters by parent Epic or Story.

---

## 4. Ticket Relationships & Dependencies

Every ticket explicitly defines its relational graph:
- **`parent`**: The parent Story or Epic ID.
- **`children`**: List of sub-tasks belonging to this ticket.
- **`requires`**: Prerequisites that **must be in `DONE` status** before this ticket can enter `IN_PROGRESS`.
- **`blocks`**: Dependent tickets that cannot start until this ticket is `DONE`.

---

## 5. Board Statuses & The Strict WIP Limit

The Kanban board consists of 7 discrete lifecycle states:
1. `BACKLOG`: Unscheduled or unrefined backlog item.
2. `TODO`: Groomed, estimated, prerequisites met, ready to be picked up.
3. `IN_PROGRESS`: Actively undergoing development.
4. `PAUSED`: Work was started and paused. Handover notes explain the current state for resumption.
5. `REVIEW`: Code complete, undergoing automated quality gates (`lint`, `typecheck`, `test`), peer review, and verification.
6. `DONE`: All acceptance criteria verified, tests passing, merged or staged for release.
7. `ABANDONED`: Decided not to pursue. Effort spent is documented; the ticket is permanently closed and will not be revisited.

---

### ⚠️ THE SACRED WORK-IN-PROGRESS (WIP) INVARIANT ⚠️
> **There must be EXACTLY ZERO or ONE ticket in `IN_PROGRESS` status on the entire board at any given time.**
> **Concurrent `IN_PROGRESS` tickets are strictly forbidden across all agents and subagents.**

### 🚨 The Interruption & Task-Switching Protocol:
If an agent, subagent, or user decides to begin a new ticket while an existing ticket is currently `IN_PROGRESS`:
1. **STOP IMMEDIATELY**.
2. **DO NOT start the new task.**
3. **ASK THE USER** via explicit prompt or conversation message to determine the disposition of the active ticket:
   - **Option A: `PAUSED`** — The active ticket is placed on hold. A complete Handover Note is recorded in `docs/kanban/handovers/<ticket-id>.md`. It will be resumed in a future session or after the urgent task finishes.
   - **Option B: `ABANDONED`** — The active ticket is permanently retired with a recorded reason documenting why effort was halted.
4. Only after the active ticket is formally transitioned to `PAUSED` or `ABANDONED` may the new ticket enter `IN_PROGRESS`.

---

## 6. Sub-Agent & Cross-Session Knowledge Transfer Protocol

To ensure seamless handovers between subagents and across new AI sessions:

1. **Canonical State Files**:
   - `docs/kanban/board.json`: Canonical machine-readable JSON database of all tickets, states, estimates, and dependencies.
   - `docs/kanban/BOARD.md`: Automatically or manually synced human-readable Markdown Kanban board.
2. **Handover Note Specification**:
   Whenever a ticket is moved to `PAUSED`, `REVIEW`, or `DONE`, the executing agent/subagent MUST author or update `docs/kanban/handovers/<TICKET-ID>.md` containing:
   ```markdown
   # Handover Note: [TICKET-ID] <Title>
   
   - **Ticket Type & Points**: Task | 3 pts
   - **Author / Agent**: [Specialist Agent Name]
   - **Status**: PAUSED | REVIEW | DONE
   - **Timestamp**: YYYY-MM-DDTHH:mm:ssZ
   
   ## 1. Summary of Work Accomplished
   - Detailed list of files created or modified with file:// links.
   - Core functions or contracts implemented.
   
   ## 2. Current State & Verification
   - Test results (`pnpm test`, `typecheck`).
   - Any passing or failing test cases.
   - Exact git branch and commit hash.
   
   ## 3. Roadblocks, Gotchas & Decisions Made
   - Non-obvious architectural choices or trade-offs.
   - Discovered edge cases or external API constraints.
   
   ## 4. Actionable Next Steps for Next Session / Continuing Agent
   - Step-by-step instructions on what needs to be executed next.
   ```

---

## 7. Git Operations & Pull Request (PR) Governance

To prevent lost work, uncontrolled runaway commits, and git accidents:

### 7.1. Branching Strategy
- **Base Integration Branch**: `develop/2.0.0`
- **Feature Branches**:
  - Epics / Stories: `feat/<TICKET-ID>-<slug>` (e.g. `feat/EPIC-001-monorepo-foundation`)
  - Bugs: `fix/<TICKET-ID>-<slug>` (e.g. `fix/BUG-004-volume-clamping`)
  - Chores: `chore/<TICKET-ID>-<slug>` (e.g. `chore/CHORE-002-pnpm-catalog`)
- **Target Branch**: PRs are **ALWAYS** opened against `develop/2.0.0`. Never open PRs directly against `main` or `master` during the redevelopment phase.

### 7.2. Anti-Runaway Session Boundary
- Sessions must **NEVER** silently complete multiple epics without user checkpoints.
- Group commits and PR creations by **Epic** or **Story**.
- Once an entire Epic or Story has reached `REVIEW` / `DONE`:
  - **STOP AND ASK THE USER**:
    > *"Epic [EPIC-XXX: Title] is complete with all tests passing. Would you like me to commit, push the branch, and create a Pull Request to `develop/2.0.0` before we proceed to the next Epic?"*
  - Wait for explicit user confirmation before initiating the next Epic.

---

## 8. Board Layout & Ticket ID Rules

These rules keep `BOARD.md` and `board.json` free of duplicates. They were adopted on 2026-09-24 after a cleanup removed 104 duplicated rows and an ID collision.

### 8.1. Each Ticket Is Listed Once
- Every ticket has exactly **one row** in `BOARD.md`: in its epic section at the bottom of the board (`### 📋 Groomed Stories & Tasks for EPIC-XXX`). Tickets without an epic (standalone chores and bugs) keep their row in the lifecycle section.
- The `## 🎯 To Do` section is an **index**, not a table. It lists one line per groomed epic or standalone story and points to that epic section.
- The `## ✅ Done` section holds only tickets that have no epic-section row. When a ticket in an epic section reaches `DONE`, set its Status cell to `✅ Done · [TICKET-ID.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TICKET-ID.md)` instead of adding a second row.
- When a grooming changes an epic, update or replace its existing section. Do not add a second section for the same epic.

### 8.2. Ticket IDs Are Unique
- Before assigning a new ID, search `board.json` for it. IDs are never reused, including IDs of `ABANDONED` tickets.
- `board.json` holds one record per ID. When a ticket is regroomed, edit its existing record instead of appending a new one.
- Handover notes are named after the ticket ID, so a reused ID overwrites another ticket's handover note. Example: BUG-0018 (guild default volume) had its note overwritten by the Replicate timeout fix; the fix was renumbered to BUG-0019 and the original note was restored from git history.
- Task records use the `parent` field (not `story`) to point to their story.

### 8.3. Verifying the Board
Before committing board changes, check that no ID appears twice:
```bash
node -e "const b=require('./docs/kanban/board.json');const a=[...b.epics,...b.stories,...b.tasks,...b.chores,...b.bugs].map(t=>t.id);console.log(a.filter((x,i)=>a.indexOf(x)!==i))"
grep -oE '^\| `[A-Z]+-[0-9]+`' docs/kanban/BOARD.md | sort | uniq -d
```
The first command must print `[]` and the second must print nothing. Also check that each story's task points add up to the story estimate.
