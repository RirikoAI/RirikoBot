# Scrum Kanban & Sub-Agent Knowledge Transfer Protocol

## 1. System Overview & Standing Rules
This document defines the **Scrum Kanban Governance & Handover Protocol** for this project.
These rules are standing operating procedures for all engineering sessions, the coordinator agent, and all sub-agents.

The protocol is **provider-agnostic**. Claude Code, Gemini CLI, Codex, opencode, and any other agent that reads `AGENTS.md` follow the same steps. Nothing in the core flow needs worktrees or a specific model family. Each provider runs the worker on the ticket's tier with the mechanism it has (section 6.3.1). Provider-specific extras, such as Claude Code hooks, enforce the rules where the provider allows it.

### 1.1. Roles
| Role | Tier | Job |
|---|---|---|
| **Coordinator** | `large` (main session) | Grooms tickets, writes grooming handovers, dispatches the worker, reviews results, talks to the user. Never executes a ticket itself (section 6.3.1). |
| **Worker** | `ticket.model` | Executes one groomed ticket with the Worker Procedure (section 6.5). Does not groom, re-scope, or start other tickets. |

The saving comes from doing the expensive exploration **once**, during grooming, and handing the result to the worker. The worker can run on a cheaper tier. A worker that has to rediscover the code wastes that saving. Sections 3 and 6 exist to prevent this.

### 1.2. Model Tiers
Tickets name a tier, not a model. Each agent maps the tier to the models its provider offers. Model names change often, so the tier is the contract. The examples below are a guide.

| Tier | Use for | Claude | Gemini | OpenAI / Codex |
|---|---|---|---|---|
| `small` | 1–2 pt mechanical work | Haiku | Flash / Flash-Lite | mini models |
| `medium` | Default | Sonnet | Pro or Flash | standard models |
| `large` | Design-heavy or high-risk work, coordination | Opus | Pro | top reasoning models |

The worker runs on the ticket's tier, not on the coordinator's model. A `large` coordinator that executes a `small` ticket spends the most expensive tokens on the cheapest work, and fills its own context with code it does not need for review. Section 6.3.1 lists how each provider runs a worker on the right tier.

### 1.3. Agent Invariants
These are hard lines. `AGENTS.md` repeats them, so every provider loads them.

**Every agent MUST NOT:**
- Start a ticket that is not a groomed `TODO` (section 3.1) with every `requires` ticket `DONE`.
- Let a second ticket be `IN_PROGRESS` (section 5.1).
- Read code, edit files, or run commands for a ticket before claiming it on the board (section 6.1).
- Edit `BOARD.md` by hand, or delete handover entries.
- Weaken, skip, or delete tests to make `verify_cmd` pass.
- Search code before running the ticket's `context.codegraph_queries`, when `.codegraph/` exists (section 7).
- Commit, push, or open PRs without the user's confirmation. Workers never do.
- Execute a ticket on a model tier other than the ticket's `model`, unless the user approved it for that ticket (section 6.3.1).

**The coordinator MUST NOT:**
- Execute a ticket itself. It dispatches a worker on the ticket's tier (section 6.3.1).
- Edit files outside `docs/kanban/` and `coordinator_paths` (section 6.1) while a ticket is `IN_PROGRESS`. That ticket's worker owns the checkout.

**The coordinator MUST:**
- Keep `board.json` authoritative and `BOARD.md` rendered.
- Groom a ticket before it enters `TODO`.
- Reconcile orphaned claims at session start (section 5.3).
- Resolve or escalate every `BLOCKED` ticket.
- Check the Definition of Done (section 3.3) before it sets `DONE`.
- Stop and ask the user when an Epic or Story completes (section 8.2).

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

1. **Epic (`EPIC-XXX`)**: Major architectural milestone or subsystem.
2. **Story (`STORY-XXX`)**: Deliverable feature or vertical capability under an Epic.
3. **Task (`TASK-XXX`)**: Concrete technical step required to complete a Story.
4. **Chore (`CHORE-XXX`)**: Tooling, maintenance, dependency management, or refactoring without behavior changes.
5. **Bug (`BUG-XXX`)**: Defects, broken invariants, test failures, or regressions.

---

## 3. Estimation & Grooming Rules

1. **Fibonacci Sequence**: Estimate all work items in story points: **1, 2, 3, 5, 8, 13, 21**.
   - **1–2 pts**: Configuration tweak, small documentation update, single isolated test.
   - **3–5 pts**: One service method or endpoint, a schema migration with its repository functions.
   - **8 pts**: Cross-cutting component that touches several modules.
   - **13+ pts**: Too large for one unit of work. Split it before `TODO`. A Story split into Tasks may total 13+ points: the limit applies to each Task, Chore, Bug, and to a Story that has no Tasks.
2. **Pre-Start Estimation Invariant**: No ticket leaves `BACKLOG` without an approved Fibonacci estimate.
3. **Grooming in Batches**: Groom tickets in clusters by parent Epic or Story.

### 3.1. Definition of Groomed
A ticket may enter `TODO` only when its `board.json` record has all of these fields and its own note has a dated `## GROOMING ·` entry. `scripts/kanban/render-board.mjs` rejects the board otherwise.

| Field | Content |
|---|---|
| `points` | Fibonacci estimate. |
| `model` | Worker tier (section 1.2): `medium` by default, `small` for 1–2 pt mechanical work, `large` only for design-heavy or high-risk work. |
| `context.files` | Files the worker will read or change. |
| `context.symbols` | Functions, classes, or methods involved. (`files` or `symbols` required.) |
| `context.entry_points` | Where the flow starts (route, command, handler). Optional. |
| `context.codegraph_queries` | Ready-made `codegraph_explore` queries that return the relevant source. Required when the repository has a CodeGraph index. |
| `acceptance` | Observable results that prove the ticket is done. |
| `verify_cmd` | Command the worker runs to self-check (tests, typecheck, lint). |
| `handovers` | Handover note IDs the worker must read (see section 6). Must include the ticket's own ID. |

The coordinator gets `context` from the CodeGraph calls it makes during grooming. It records the queries that worked so the worker can repeat them instead of searching again.

### 3.2. Ready for Review
The worker sets `REVIEW` only when all of these are true:
- `verify_cmd` passes. The `PROGRESS` entry summarizes the output.
- Every `acceptance` item is met. The `PROGRESS` entry says how.
- Changes stay inside `context.files`, or each extra file is added to `context.files` and explained.
- Every `FLAG` entry that targets **this** ticket is addressed in the `PROGRESS` entry.
- A `## PROGRESS · <date> · <worker> · REVIEW` entry is written and `BOARD.md` is rendered.

If any item cannot be met, the ticket is `BLOCKED` (section 5), not `REVIEW`. `render-board.mjs` rejects a `REVIEW` ticket without the `PROGRESS · … · REVIEW` entry.

### 3.3. Definition of Done
The coordinator sets `DONE` only when all of these are true:
- It re-ran `verify_cmd` itself, and the command passes.
- It checked each `acceptance` item against the diff.
- It appended a `## REVIEW · <date> · <coordinator> · DONE` entry (section 6.2).
- It removed this ticket's rows from `HANDOVERS.md`.
- `BOARD.md` is rendered.

If review fails, the coordinator appends a `REVIEW · … · REWORK` entry that lists the issues, and sets the ticket back to `TODO`. `render-board.mjs` warns about a `DONE` ticket without a `REVIEW · … · DONE` entry, and about `HANDOVERS.md` rows that target closed tickets.

---

## 4. Ticket Relationships & Dependencies

Every ticket defines its relational graph:
- **`parent`**: The parent Story or Epic ID. Tasks use `parent`, not `story`.
- **`children`**: Sub-tickets belonging to this ticket.
- **`requires`**: Prerequisites that **must be `DONE`** before this ticket enters `IN_PROGRESS`.
- **`blocks`**: Dependent tickets that cannot start until this ticket is `DONE`.

---

## 5. Board Statuses & WIP Limits

The board has 8 lifecycle states:
1. `BACKLOG`: Not yet groomed.
2. `TODO`: Groomed (section 3.1), estimated, ready to pick up once `requires` are `DONE`.
3. `IN_PROGRESS`: A worker is executing it. `assignee` and `claimed_at` are set.
4. `PAUSED`: On hold by choice (section 5.2) or recovered from an orphaned claim (section 5.3). It can resume at any time. The handover note explains the current state.
5. `BLOCKED`: The worker cannot go on until something outside the ticket changes (see below).
6. `REVIEW`: Ready for Review (section 3.2). The coordinator reviews it.
7. `DONE`: Definition of Done met (section 3.3).
8. `ABANDONED`: Permanently closed. Effort spent and the reason are recorded.

**When a ticket is `BLOCKED`.** A worker sets `BLOCKED` instead of guessing or pushing on when:
- a dependency (service, library, credential, another ticket's output) is missing or broken;
- `verify_cmd` fails for a reason outside `context.files`;
- the acceptance criteria are unclear or conflict with each other or with the code;
- the ticket is wrong or too large (for example, 13+ points of work) and needs regrooming.

The worker appends a `PROGRESS · … · BLOCKED` entry with the unblock condition, sets `status: BLOCKED` and a one-line `blocked_reason`, clears `assignee` and `claimed_at`, renders the board, and stops. A `BLOCKED` ticket no longer counts against the WIP limit, so the board keeps moving.

The coordinator owns every `BLOCKED` ticket. It resolves the cause or asks the user. Then it clears `blocked_reason` and moves the ticket to `TODO` (regroomed if needed) or `ABANDONED`.

### 5.1. WIP Invariant
- **At most `wip_limit` (1) ticket is `IN_PROGRESS` on the whole board**, whichever agent holds it. `assignee` names that agent (for example `claude`, `gemini`, `codex`).
- All work happens in the main checkout. There are no parallel workers and no worktrees.
- WIP 1 is not about speed. Serial work in one checkout is the one model that every AI provider supports: no subagents, no worktree isolation, and no file-locking between agents. It also lets different providers take turns on the same board.
- `render-board.mjs` enforces the limit and requires `assignee` and `claimed_at` on the active ticket.

### 5.2. Interruption & Task-Switching Protocol
If a worker, the coordinator, or the user wants to start a new ticket while another ticket is `IN_PROGRESS`:
1. **Stop.** Do not start the new ticket.
2. **Ask the user** what happens to the active ticket:
   - **`PAUSED`**: Put on hold. Write a `PROGRESS` handover note (section 6).
   - **`ABANDONED`**: Permanently retired with a recorded reason.
3. Only after that transition may the new ticket enter `IN_PROGRESS`.

### 5.3. Session Start & Recovery
A worker can die while it holds the only `IN_PROGRESS` slot: a crash, a closed terminal, a context reset, or a subagent that never returns. Under WIP 1 this stops the whole board. So at the start of every session, before it claims anything, the coordinator:
1. Runs `node scripts/kanban/render-board.mjs --check`. Its output names the active ticket, its `assignee` and `claimed_at`, and the count of `BLOCKED` tickets. It warns when a claim is more than 24 hours old.
2. If a ticket is `IN_PROGRESS` and this session did not claim it, **asks the user** whether that agent is still running. It does not decide from the timestamp alone.
3. If the claim is orphaned:
   - Runs `git status` and `git diff --stat` to see what the dead worker left.
   - Appends a `## PROGRESS · <date> · <coordinator> · PAUSED` entry that starts with "Recovered from orphaned claim by `<assignee>`". It lists the uncommitted edits under **Files changed**.
   - Sets `status: PAUSED` and clears `assignee` and `claimed_at`. Renders the board.
   - Never discards or reverts the dead worker's edits. The next worker resumes from them and the `PROGRESS` entry.
4. Reviews `BLOCKED` tickets (section 5) before it starts new work.

---

## 6. Handover Notes & Knowledge Transfer

### 6.1. Canonical State Files
- `docs/kanban/board.json`: The only source of truth for tickets, states, estimates, dependencies, and context.
- `coordinator_paths` in `board.json`: path globs the coordinator may edit while a ticket is `IN_PROGRESS`, in addition to `docs/kanban/`. Example: `["CHANGELOG.md", "docs/adr/**", "notes/"]`. `**` spans directories, `*` and `?` stay inside one directory, and a trailing `/` covers a whole directory. Default `[]`. Add a path only with the user's agreement, and never a path that tickets change. The Claude Code hook reads this list; other providers follow it as a rule.
- `docs/kanban/BOARD.md`: **Generated** from `board.json`. Never edit it by hand. Run `node scripts/kanban/render-board.mjs` after every `board.json` change.
- `scripts/kanban/board-server.mjs`: Read-only web view of `board.json` and the handover notes, for humans. It never changes the board; agents edit `board.json` directly.
- **Board first, work second.** Every agent and subagent claims its ticket (`status: IN_PROGRESS`, `assignee` and `claimed_at` set) and regenerates `BOARD.md` **before** it reads code, edits files, or runs commands for that ticket. `BOARD.md` must show what agents are working on while the work happens, not after it finishes. Every later status change (`PAUSED`, `BLOCKED`, `REVIEW`, `DONE`, `ABANDONED`) is rendered the moment it happens.
- `docs/kanban/handovers/<ID>.md`: One note file per ticket, epic, or story. Template: `docs/kanban/handovers/_TEMPLATE.md`.

### 6.2. Note Entry Types
A note file is a log. Agents **append** dated entries; they never delete earlier entries. There are four entry types:

| Entry | Written by | When | Content |
|---|---|---|---|
| `GROOMING` | Coordinator | When the ticket enters `TODO` | Approach, relevant code found, pitfalls, what is out of scope. |
| `PROGRESS` | Worker (coordinator on recovery) | On `PAUSED`, `BLOCKED`, `REVIEW`, `ABANDONED` | Files changed, verification results, decisions, next steps. `BLOCKED` adds the unblock condition. |
| `REVIEW` | Coordinator | When it reviews a `REVIEW` ticket | `verify_cmd` rerun result, acceptance checklist, and the outcome `DONE` or `REWORK` with issues. |
| `FLAG` | Any agent | Any time it finds something that affects **another** ticket | What was found, where (file:line), and why it matters to that ticket. |

`FLAG` entries go into the **target** ticket's note file, not the author's. Example: while working on TASK-042, a worker finds that `UserRepo.save` has no transaction and TASK-050 will depend on it. The worker appends a `FLAG` entry to `handovers/TASK-050.md` (creating it from the template if needed) and adds a line to `HANDOVERS.md`. TASK-050 already lists its own note in `handovers`, so no `board.json` change is needed. If a finding applies to a whole story or epic, append it to that story's or epic's note file instead, and add that ID to the `handovers` field of every affected unstarted ticket.

### 6.3. Required Reading Before Work
Before starting a ticket, a worker reads, in this order:
1. `handovers/<EPIC-ID>.md` (if it exists)
2. `handovers/<STORY-ID>.md` (if it exists)
3. Every note listed in the ticket's `handovers` field (its own note, with `GROOMING` and any `FLAG` entries).
4. The last `PROGRESS` entry of every ticket in `requires`.

### 6.3.1. Running the Worker
The coordinator never runs the Worker Procedure (section 6.5) itself. It starts a separate worker on the model that the ticket's `model` tier maps to (section 1.2), one at a time, in the main checkout. This holds for every tier, `large` included: the worker gets a fresh context, and the coordinator keeps its context for grooming and review.

**Worker prompt.** Every provider uses the same prompt, so workers behave the same:

```text
Ticket: <TICKET-ID>. Worker name: <provider>-<tier>.
You are the worker. Follow the Worker Procedure in docs/kanban/protocol.md section 6.5 and the Agent Invariants in section 1.3.
```

The worker name (for example `claude-small`, `gemini-medium`, `codex-large`) goes into `assignee` and the `PROGRESS` entry header, so the review can check the tier.

**How to start the worker**, in order of preference:

| Provider | Mechanism |
|---|---|
| Claude Code | Agent tool, `subagent_type: "ticket-worker"`, `model` mapped from the tier (`small`→`haiku`, `medium`→`sonnet`, `large`→`opus`). Never `isolation: "worktree"`. **Required.** A `PreToolUse` hook (`scripts/hooks/worker-delegation.mjs`) denies a dispatch with the wrong `model`, and denies coordinator edits outside `docs/kanban/` and `coordinator_paths` while a ticket is `IN_PROGRESS`. |
| Provider with subagents that take a model (for example opencode agents with `mode: "subagent"`) | Dispatch a subagent on the tier's model with the worker prompt. |
| Provider with a headless CLI (for example `gemini -m <model> -p "<prompt>"`, `codex exec -m <model> "<prompt>"`, `opencode run -m <provider/model> "<prompt>"`) | Run the CLI in the repository root on the tier's model with the worker prompt. The user decides which approval or sandbox flags the worker gets; ask before the first run. |
| Any other provider | **Hand off.** Stop. Tell the user the tier's model and the worker prompt, and ask them to run it in a new session on that model. Resume at review when they report back. |

**Inline execution** on the coordinator's model is allowed only when the user approves it for that ticket, after being told the tier mismatch. Record the approval in the `PROGRESS` entry. In Claude Code the user also sets `KANBAN_DELEGATE=off` for that session.

### 6.3.2. Review
At `REVIEW` the coordinator reads the worker's `PROGRESS` entry and `git diff` of `context.files`, reruns `verify_cmd`, and checks each `acceptance` item. It checks that the `PROGRESS` entry header names a worker on the ticket's tier. A mismatch without recorded user approval goes into the `REVIEW` entry under **Worker tier**. It does not re-explore the code. It records the result in a `REVIEW` entry: `DONE` when the Definition of Done (section 3.3) is met, otherwise `REWORK` and the ticket goes back to `TODO`.

### 6.4. Handover Index
`docs/kanban/handovers/HANDOVERS.md` lists every `FLAG` entry that is still open, one line each: target ID, source ID, one-line summary. The coordinator removes a line when the target ticket is `DONE` or `ABANDONED`.

### 6.5. Worker Procedure
Any agent that executes a ticket follows these steps, whatever its provider. The coordinator already explored the code during grooming and wrote down what it found. The worker uses that work and does not repeat it.

1. **Load the ticket.** Read its record in `board.json`. If `context`, `acceptance`, or `model` is missing, stop and report "ticket is not groomed". Do not groom it.
2. **Check prerequisites.** Every ID in `requires` must be `DONE`. If not, stop and report which ones are not.
3. **Read handovers** in the order of section 6.3. Skip files that do not exist. Follow `FLAG` entries: they are warnings from other agents about this ticket.
4. **Claim the ticket.** In `board.json`, set `status` to `IN_PROGRESS`, `assignee` to the worker name, and `claimed_at` to the current time in ISO 8601 UTC (for example `2026-09-30T14:05:00Z`). Run `node scripts/kanban/render-board.mjs`. If it fails with a WIP error, undo the change and stop.
5. **Load the code with CodeGraph first** (section 7). Run **all** queries in `context.codegraph_queries` before any other code search, with the `codegraph_explore` MCP tool, or with `codegraph explore "<query>"` in the shell when MCP is not available. Treat the returned source as already read. Before an edit, read only the line range you change. If there is no `.codegraph/` directory, start from `context.files`.
6. **Implement.** Change only what the acceptance criteria need. Stay inside `context.files` where possible. If you must change a file that is not listed, add it to `context.files` and say why in the `PROGRESS` entry.
7. **Verify.** Run `verify_cmd`. Check every item in `acceptance`. Fix failures inside the ticket's scope. Do not weaken or skip tests. If a failure is outside the ticket's scope, the ticket is `BLOCKED` (step 9).
8. **Flag other tickets.** If you find something that affects a different ticket, story, or epic, append a `FLAG` entry to that note file (section 6.2) and add one line to `HANDOVERS.md`. Do not work on the other ticket.
9. **Hand over.** Append a `PROGRESS` entry to `handovers/<TICKET-ID>.md` using `_TEMPLATE.md`. Include any new CodeGraph queries that helped. Then set `status`:
   - `REVIEW` when every Ready for Review item (section 3.2) is true;
   - `BLOCKED` when a blocker from section 5 stops you. Set `blocked_reason` and write the unblock condition;
   - `PAUSED` when you must stop for another reason and the work can resume as is.

   Clear `assignee` and `claimed_at`. Run `render-board.mjs`.
10. **Report** to the coordinator or the user in 10 lines or fewer: status, files changed, `verify_cmd` result, flags raised, open questions.

The Agent Invariants (section 1.3) apply throughout. In addition: work on one ticket only, and never groom or re-estimate another ticket. If the ticket is wrong or too large, set it to `BLOCKED` and stop.

---

## 7. Code Exploration: CodeGraph First

Agents use CodeGraph before Grep, Glob, or reading whole files, when the repository has a `.codegraph/` index.

1. **Start from the ticket.** Run **all** of the ticket's `context.codegraph_queries` before any other code search. They were checked during grooming. This rule applies on every provider. The Claude Code hook in step 3 is only a safety net.
2. **Then explore.** Call `codegraph_explore` with `projectPath` set to the repository root, naming the symbols or files from `context`.
3. **Grep, Glob, and shell search are a fallback.** Use them only for non-code text (config values, string literals, log messages) or when CodeGraph returns nothing. In Claude Code, a `PreToolUse` hook denies the first code search per agent (Grep, Glob, whole-file Read of source, `grep`/`rg`/`find`/`cat`/`Select-String`/`Get-Content` in Bash or PowerShell) until CodeGraph is used.
4. **Ranged Read before Edit.** Edit needs a prior Read. Read only the lines you change, using the line numbers CodeGraph returned.
5. **Freshness.** A daemon file watcher re-indexes saved files within about 1 second while a session is open (it stops after 5 idle minutes). `SessionStart` and git hooks run `codegraph sync -q` to cover pulls, branch switches, and offline edits. If results look stale, run `codegraph sync` and retry.
6. **Record new queries.** If a worker needed a query that grooming did not provide, add it to the `PROGRESS` entry so later tickets can reuse it.

If there is no `.codegraph/` directory, use the built-in tools. Indexing is the user's decision.

---

## 8. Git Operations & Pull Request (PR) Governance

### 8.1. Branching Strategy
- **Base Integration Branch**: `develop/2.0.0`
- **Feature Branches**:
  - Epics / Stories: `feature/<TICKET-ID>-<slug>` (e.g. `feature/EPIC-001-monorepo-foundation`)
  - Bugs: `fix/<TICKET-ID>-<slug>` (e.g. `fix/BUG-004-null-session`)
  - Chores: `chore/<TICKET-ID>-<slug>` (e.g. `chore/CHORE-002-upgrade-deps`)
- **Target Branch**: PRs **always** target `develop/2.0.0`. Never open PRs against any other branch.

### 8.2. Anti-Runaway Session Boundary
- Sessions must **never** silently complete multiple epics without user checkpoints.
- Group commits and PRs by **Epic** or **Story**.
- When an Epic or Story reaches `REVIEW` / `DONE`, **stop and ask the user**:
  > *"Epic [EPIC-XXX: Title] is complete with all tests passing. Would you like me to commit, push the branch, and create a Pull Request to `develop/2.0.0` before we proceed to the next Epic?"*
- Wait for explicit confirmation before starting the next Epic.
- Workers never commit, push, or open PRs. The coordinator does this after user confirmation.

---

## 9. Board Rules & Ticket IDs

### 9.1. Ticket IDs Are Unique
- Before assigning a new ID, search `board.json` for it. IDs are never reused, including IDs of `ABANDONED` tickets.
- `board.json` holds one record per ID. When a ticket is regroomed, edit its record instead of appending a new one.
- Handover notes are named after the ticket ID, so a reused ID would overwrite another ticket's note.

### 9.2. Verifying the Board
Before committing board changes, run:
```bash
node scripts/kanban/render-board.mjs          # validate and regenerate BOARD.md
node scripts/kanban/render-board.mjs --check  # validate only; fails if BOARD.md is stale
```
The script checks: duplicate IDs, unknown references, Fibonacci points, the Definition of Groomed (3.1, including `codegraph_queries`, `verify_cmd`, and the `GROOMING` entry), missing handover files, prerequisites, model tiers (1.2), the WIP limit and `claimed_at` (5.1, 5.3), `BLOCKED` reasons and entries (5), the Ready for Review entry (3.2), and story points against the sum of task points. It warns about stale claims, `DONE` tickets without a `REVIEW · … · DONE` entry (3.3), and `HANDOVERS.md` rows that target closed tickets.
