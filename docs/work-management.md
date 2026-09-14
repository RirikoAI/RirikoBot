# Scrum/Kanban working guide

Read [the standing protocol](../.workboard/PROTOCOL.md), [live board](../.workboard/BOARD.md), [data](../.workboard/state.json) and the active handoff at every session start. The protocol is mandatory for all agents and takes priority over earlier instructions to progress automatically through the platform roadmap. The repository is the shared record; no hosted project or external account is required.

## Intake and group grooming

Use epics for broad outcomes, stories for independently reviewable user behavior, tasks for bounded implementation, chores for maintenance, bugs for observed defects, and spikes for time-bounded investigations with a decision as output. Describe defects with reproduction, expected/actual behavior and evidence. Record newly discovered work in backlog; do not silently enlarge the current ticket. IDs use `RIR-NNN` and are never reused or deleted.

Every story/task has a parent. Root epics organize descendants; independent chores/bugs/spikes can be their own delivery scope. `requires` means a prerequisite must be **done** before execution; `blocks` and `children` are computed. Parentage alone is not an execution dependency. The tool rejects cycles, invalid relationships and mixed delivery scopes.

Groom related records together before readiness. Review the corresponding legacy inventory, architecture, acceptance and risks, assign Fibonacci points, record each rationale and the group's participants. Use **1, 2, 3, 5, 8, 13, 21, 34, 55, 89**; executable leaves above 13 must be split. Ungroomed backlog can have a null estimate. Points stay fixed after starting; discoveries become new tickets. Parent points express planning size and are not added to leaf estimates.

The board began with 20 records covering the existing roadmap and an observed dependency-tracking cleanup. `GR-001` grooms foundation operations and the setup chore; `GR-002` grooms the first compatibility slice; `GR-003` adds the user-approved RIR-110 review-evidence story and refines deferred cleanup. Later domains remain ungroomed until source and implementation risks can be assessed. Pre-board completed work has a factual [baseline handoff](../.workboard/context/baseline.md), without invented retrospective estimates or velocity.

## Cadence, readiness and completion

At session start, read the current handoff and run `pnpm board check`; review blockers and the one open batch. Replenish/groom backlog at story/epic boundaries, never as an excuse to start another card. A short review at each batch checkpoint demonstrates acceptance, tests and remaining risks. Record one useful retrospective observation in the final handoff, such as an estimate assumption to improve. This uses Scrum's grooming/review habits with a continuous Kanban flow; a calendar sprint is optional and does not grant permission to cross delivery boundaries.

Ready means grouped estimate, explicit acceptance, dependency links, allowed paths and declared delivery scope. Starting also needs satisfied requirements, an open batch containing the ticket, and an empty global execution slot. `blocked` and `review` retain that slot. Parent containers remain ready/backlog and close only after children are resolved. A leaf story can execute if it has no subtasks; an epic never occupies the slot.

Done means the acceptance criteria are met, appropriate checks passed or their material limitations are recorded, worker returns are accepted, and a durable handoff identifies evidence and recovery steps. Executable work moves through `in-progress` → `review` → `done`. Completion closes execution, while the **batch checkpoint remains a stop** until the user decides about a PR. Paused work is resumable; abandoned work is terminal and remains visible as spent effort.

## Commands and durable changes

Use Node 24 and the pinned pnpm version. These are local developer commands; Discord slash/prefix equivalents are **not applicable**. `node tools/workboard/cli.ts ...` is equivalent if the system pnpm shim has a different version. No new runtime package dependencies are needed.

```sh
pnpm board install-hooks
pnpm board check
pnpm board show
pnpm board show RIR-001
pnpm board help
pnpm board requirements-check
pnpm board requirements-show BP-18
```

Board mutations consume one JSON command from a file and require the revision you just read. Unknown fields and malformed commands are rejected. A mutation increments revision, appends an event and regenerates the board. Do not edit state or history by hand. Keep meaningful command inputs in a ticket handoff directory if they help recovery; the full command is already included in history.

```sh
pnpm board apply .workboard/handoffs/RIR-001/checkpoint.json --expected 1 --actor coordinator
```

For an ongoing session handoff, that JSON file could contain:

```json
{
  "action": "handoff",
  "ticket": "RIR-001",
  "handoff": ".workboard/handoffs/RIR-001/002-session.md",
  "reason": "Persist test findings and next steps before ending the session"
}
```

Write the Markdown file first. This command records knowledge without changing status or releasing the execution slot. [The template](../.workboard/templates/handoff.md) covers branch/base/HEAD, context, decisions, owned files, exact tests, unfinished work, worker state and next commands.

| Action in command JSON | Required payload beyond `action` | Effect |
|---|---|---|
| `create` | `ticket` matching [template](../.workboard/templates/ticket.json) | Add a backlog record; never start implicitly |
| `groom` | `grooming` group; `estimates` of `{id,points,rationale}` | Estimate every listed group member together |
| `move` | `ticket,status,reason,handoff`; `validation` for review/done | Follow allowed lifecycle transitions |
| `batch` | `batch` with ID, scope, topic, verified base/SHA, tickets, open status and null PR URL; optional explicit approved `stack` | Declare one delivery scope after the previous checkpoint is resolved; include the stack atomically when branching from an unpublished parent |
| `stack` | `batch,parentBatch,parentHead,decision` | Record one actual user-approved dependency on a closed parent scope, with its frozen local commit; never infer permission from overlapping file paths |
| `start` | `ticket,owner` | Claim the single slot after all readiness checks |
| `handoff` | `ticket,handoff,reason`; optional `validation` | Persist active-session knowledge without switching work |
| `assign` | `assignment` with ID, ticket, agent, bounded scope, paths, assigned status, null handoff | Delegate within the same ticket; overlapping write ownership is refused |
| `return` | `assignment,handoff` | Worker or coordinator persists the actual return |
| `accept` | `assignment` | Coordinator acknowledges reviewed evidence |
| `decision` | `decision` with ID, kind, actual reply/reference, timestamp and matching switch or batch fields | Record a real user reply; the CLI does not grant consent |
| `switch` | `from,to,decision,owner,handoff` | Atomically pause/abandon and optionally start a ready ticket in the same batch |
| `checkpoint` | `batch` | Stop at the PR boundary after completing/disposing active work |
| `close-batch` | `batch,decision`; `prUrl` only for `pr-created` | Close after the user defers or the approved PR has actually been verified |

The exact TypeScript contracts are in [types.ts](../tools/workboard/types.ts). The engine parses runtime JSON independently of compile-time types.

## User decisions and scope switching

When another task would replace active work, stop and ask the user to pause or abandon the active ticket. After their reply, persist a handoff and settle workers; record a `switch` decision containing `fromTicket`, `toTicket` (or null), `disposition`, and `batchId: null`. Apply the matching `switch` using that decision ID. Decisions are single-use and cannot be reused after an intervening switch. Never fabricate the reply or treat silence as consent.

A cross-scope switch must first dispose the old ticket with `to: null`, checkpoint its batch and ask about a PR. Record `defer-pr` only after an actual user deferral, or `pr-created` only after approved publication and verified PR URL. Both delivery decisions have null switch fields and the exact batch ID. Preserve a local commit before closing/defer; a different batch requires its own branch from the verified target. If the next work needs unpublished changes, ask about merging/stacking rather than silently carrying them into a second epic.

## Publication and branch safety

The current declared base is `develop/2.0.0-astra` in `RirikoAI/RirikoBot`. The similarly named `develop/2.0.0` is a different branch. New topic names include the batch scope ID: `feat/RIR-210-general-commands`, `fix/RIR-231-memes`, `chore/RIR-001-work-governance`. Commit subjects begin with `[RIR-210]`, etc. Stage explicit files only after reviewing status and diff.

Hooks reject commits on an unexpected/protected branch, mismatched origin or push URL, files outside scope, stale staged board data and wrong commit IDs. Push guards require a clean committed checkpoint, settled workers, exactly one matching non-deletion topic ref, fast-forward history and an approval tied to the current HEAD and target SHA. Tag/multi-branch pushes and mismatched PR targets are rejected. CI checks the board, handoffs, PR head/base/repository and changed file scope; required checks/branch protection still need GitHub administrator configuration and are not claimed as installed.

At the checkpoint:

1. Finish the acceptance/handoff and prepare `.workboard/reviews/BATCH-ID.md`. Review the full diff, run relevant checks, mark the ticket done and batch checkpoint, then make a local commit with explicit staging.
2. Fetch the exact target branch, verify ancestry and run `pnpm board pr-plan`. Inspect existing PRs and prepare the concrete head/base/diff for the user. Ask whether they want this scope published. Stop here until they answer.
3. Only after approval, use `pnpm board approve-publish --reference "actual user reply and conversation reference" --head EXACT_SHA --base EXACT_SHA --target EXACT_BRANCH`. This fetches/rechecks the integration and immediate target and records the local approval; it does not push. Re-review and ask again if HEAD/base/target changed. A custom publish URL is rejected.
4. Push the explicit topic ref shown by `pr-plan`. Create the PR with explicit repository, head, base and the prepared body file; never rely on default branches. `gh` is optional and must actually be available/authenticated before using the printed arguments. A connector/API may perform the equivalent operation. Verify existing/resulting PR identity and URL before recording closure. Never auto-merge.

The setup request authorizes local governance work, not a push or PR. Local hooks are bypassable and local CLI actor/reference strings cannot prove a conversational reply; every agent must still obey the standing user rules.

### A user-approved stack

For fresh consent after a parent batch is already closed, record a `decision` with `kind: "stack"`, that closed parent's `batchId`, and the actual user reply. This records permission for one new dependent scope without claiming the existing parent PR was deferred, closed or merged. Older combined `defer-pr`/stack decisions remain readable. A stack decision cannot close a delivery batch or authorize a push; exact publication approval is separate. Preserve a local administrative receipt on its own branch and retain the original PR branch at its exact published commit before resolving a new stack.

RIR-110 is an explicitly approved example: the user deferred RIR-001 publication and permitted one separate story branch on top of it. The integration anchor remains `develop/2.0.0-astra`, while the immediate story PR target is the exact preserved `chore/RIR-001-work-governance` parent until that commit is integrated. The story's changed-file check uses the parent commit, so inherited governance changes remain in their own scope. An unapproved inherited batch is rejected even when both scopes happen to own the same paths.

For a new approved stack, preserve/close the parent with its actual user decision, record and groom the new story, then create its separate topic from the unchanged parent HEAD. Include `stack: {parentBatch, parentHead, decision}` in the new `batch` command so the declaration and Git verification happen atomically before `start`. Opening a batch without that contract correctly rejects inherited unpublished work. The separate `stack` command supports declaring the same approved contract once on an already open batch; it cannot replace an existing anchor or bypass the decision checks.

`pr-plan` reports the immediate target and whether it exists at the recorded SHA on the fetched remote. A missing remote parent blocks publication, not local review. At the child checkpoint, `pr-plan --batch BATCH-001` can prepare the deferred immediate parent's **separate branch push** from the child checkout; `approve-publish --batch BATCH-001 ...` binds a distinct real user approval to that parent ref. This does not reopen execution or switch worktrees. It cannot select unrelated closed batches. Publish only the exact parent ref shown, keep its PR deferred, then refresh the child plan and obtain its separate approval. Never treat a parent's approval as approval for the child.

The frozen RIR-001 parent has an older PR checker which rejects its now-closed batch. RIR-005 records that unresolved parent-PR integration issue. Selecting that parent prints branch-push arguments only, not an unsafe claim that its own PR is ready. The parent branch may serve as the immediate target of this child's PR, whose new source contains the current checker. Do not rewrite the parent or merge the child into it merely to obscure the old issue; resolving parent integration is separate reviewed work.

The resolver refuses a moved parent, guessed local integration anchor, changed approval target or wrong-base PR. Once the exact parent commit is an ancestor of the fetched integration target, the child can target integration after incorporating any new base changes. Squash/rewrite histories and changed stack anchors need a fresh reviewed resolution; do not force-push or silently replace recorded ancestry.

### Blueprint evidence

[BLUEPRINT.md](../BLUEPRINT.md) preserves the original request. [requirements.json](requirements.json) maps every numbered section and exact final acceptance criterion to status, backlog scopes and file references; [requirements.md](requirements.md) is generated. Update the manifest when implementation changes, then run `pnpm board requirements-render` and `pnpm board requirements-check`. The checker rejects omitted/duplicated requirements, changed source text, nonexistent scope IDs, broken/unsafe evidence paths and code-completion claims backed only by prose. It cannot infer passing tests or live behavior from a path; record exact verification in the ticket handoff.

## Multiple sessions, worktrees and recovery

Hook installation initializes a canonical local copy and an exclusive mutation lock under the **Git common directory** (`ririko-workboard/`). All worktrees of that clone share it. The tracked JSON is the portable, versioned projection. A stale revision, differing projection or occupied lock stops mutations instead of overwriting another session. Separate clones/machines have independent Git directories: coordinate through the published board and the user before work, because there is no distributed server lock.

The shared copy is written before tracked JSON/Markdown. After an interrupted projection, inspect the common-directory lock and its recorded PID/root/time. Never automatically remove a lock held by a live process. Once the owner is confirmed stopped, an operator may remove only that verified lock file. Run `pnpm board sync` on the recorded topic to recover the canonical projection; the tool backs up the previous JSON in the Git directory first. Preserve conflicting files and investigate unexpected differences. `render` only rebuilds Markdown and does not overwrite JSON.

After a PR is merged or deferred and the batch closure has been recorded, preserve the closing handoff with a local metadata commit on that batch's topic. A closed batch permits only `.workboard/` administrative changes; the hook rejects additional feature code. Then bring the canonical board into the next explicitly selected topic before declaring the new batch. A stale branch's history must never replace the common-directory board. Install hooks on every fresh clone; `install-hooks` refuses to overwrite an existing custom hook path.

## State-machine reference and worked contracts

The authoritative behavior is [model.ts](../tools/workboard/model.ts), persisted by [store.ts](../tools/workboard/store.ts) and exposed through [cli.ts](../tools/workboard/cli.ts). The command JSON is runtime-validated; a TypeScript cast cannot bypass required fields, lifecycle rules or graph validation. Examples below illustrate the schema. IDs, revisions, timestamps, paths and decision references must be taken from the actual board and conversation before applying anything. They are not authorization to start example work.

### Status versus action

| Current status | Permitted route | Slot and evidence |
|---|---|---|
| `backlog` | `move` to `ready` after grooming | No execution slot; handoff path/reason still required by move |
| `ready` | `start`; or `move` back to `backlog` | Start checks estimate, dependencies, batch and empty slot |
| `ready` parent | `move` to `done` only after descendants resolved | Containers never execute; validation and handoff required |
| `in-progress` | `move` to `blocked` or `review` | Slot retained; all assignments accepted before moving |
| `blocked` | `move` to `in-progress` or `review` | Same ticket retains ownership; a blocker does not free capacity |
| `review` | `move` to `in-progress`, `blocked` or `done` | Revision work stays on this ticket; done needs fresh validation |
| Any occupied state | Actual decision plus `switch` to paused/abandoned | Persist handoff and settle workers; optional same-batch destination starts atomically |
| `paused` | `start` after prerequisites/slot/batch checks | No automatic resume; estimate remains fixed |
| `done`, `abandoned` | No reopen transition | History remains; genuinely new work needs a new record |

`move` cannot pause or abandon, and cannot replace `start`. A direct ready-to-done transition is only for a parent container, never an executable leaf. Review/done require nonempty validation evidence. Every move calls the unsettled-assignment guard, including moving a blocked ticket back to execution. If review finds more work after old assignments were accepted, create a new bounded assignment rather than overwriting the accepted return.

The tool's `checkpoint` action rejects occupied slots and unsettled workers; it is not proof that every acceptance criterion is satisfied. The coordinator must verify the selected batch outcome or an explicitly approved disposition first. Do not use a checkpoint with unfinished work to imply completion.

### Ticket, grooming and batch data

The [ticket template](../.workboard/templates/ticket.json) contains every field. Important distinctions:

- `parent` organizes the tree; `requires` controls execution order. A child does not implicitly require its parent to be done.
- `deliveryScope` names the one story/epic or standalone maintenance scope; every included ticket must agree with the batch. Do not use a broad ancestor to absorb unrelated work.
- `paths` are repository-relative file/directory ownership, not a permission to modify everything that seems related. Assignments narrow those paths further. Legacy paths stay prohibited.
- `estimate` is a permitted Fibonacci number or null in backlog. `groomedIn` identifies a real group containing that ticket; `estimateRationale` explains uncertainty, integration and testing effort.
- `validation` contains actual evidence, not planned tests. `handoff` points to an existing nonempty Markdown file under the ticket's handoff directory. New records have null owner/handoff and no claimed validation.

A grooming command must estimate **every** ticket listed in its group exactly once. For example, this illustrates one five-point executable ticket already created under an existing epic:

```json
{
  "action": "groom",
  "grooming": {
    "id": "GR-EXAMPLE",
    "scope": "RIR-900",
    "at": "2026-09-14T12:00:00.000Z",
    "participants": ["coordinator", "domain-reviewer"],
    "tickets": ["RIR-901"],
    "rationale": "One contract, persistence failure cases and both-dialect verification"
  },
  "estimates": [
    { "id": "RIR-901", "points": 5, "rationale": "Bounded service change with concurrency tests" }
  ]
}
```

This example must be adapted to actual IDs, participants and current time. A valid group is not permission to execute. Readiness/start still require actual acceptance, scope, dependency completion and a declared open batch. Estimates cannot be changed once execution starts, even if a discovery makes the original estimate inaccurate. Report the discovery and groom follow-up work separately.

A `batch` declaration includes `id`, `scope`, `branch`, `baseBranch`, full `baseSha`, `status: "open"`, explicit `tickets`, and `prUrl: null`. The branch exists before declaration and matches actual Git state. Verify the integration SHA from the fetched remote, not from a local branch with unrelated commits. One batch cannot be opened while another is open/checkpoint or any ticket occupies the slot. A local commit preserves progress during a batch; it does not close the batch or authorize starting another scope.

### Exact decision fields and authority

Every `Decision` has `id`, `kind`, `reference`, `at`, `fromTicket`, `toTicket`, `disposition`, and `batchId`. Fields not relevant to the decision are explicitly null, not omitted.

| Kind | Required non-null fields beyond identity/reference/time | Preconditions and meaning |
|---|---|---|
| `switch` | `fromTicket`, `disposition`; `toTicket` optional destination | From is occupied; destination ready/paused; disposition paused/abandoned; `batchId` null |
| `defer-pr` | `batchId` | Parent/current batch is at checkpoint; actual user defers publication; all switch fields null |
| `pr-created` | `batchId` | Batch is at checkpoint; approved PR actually created and verified before recording closure; all switch fields null |
| `stack` | `batchId` of the closed parent | Fresh actual user consent for one next dependent scope; all switch fields null; does not close/defer/merge the parent PR |

`reference` records the real reply and enough conversation context to identify what was approved. Do not use a fabricated “approved” string because it passes validation. The local actor field is an audit label, not authentication. Only `coordinator` can change work control; a matching assigned worker may technically submit `return`, but the standing coordination protocol keeps board writes with the coordinator unless explicitly delegated.

`switch`/`close-batch` consume their matching decision; a switch decision becomes stale after an intervening switch. Stack consent is linked by the new batch's `stack.decision` and authorizes one new stack scope only. An older combined `defer-pr`/stack reply can remain valid; fresh consent after closure uses `kind: "stack"`. A stack decision cannot serve as `close-batch` approval. A `pr-created` record cannot substitute for local exact-head publication approval before the push.

### Same-batch interruption example

Suppose RIR-901 is in progress and RIR-902 is a ready sibling. The user asks to work on RIR-902 first. The coordinator must stop dependent work and ask whether to pause or abandon RIR-901. Once the actual reply arrives:

1. Stop assigning work and settle every RIR-901 worker. Persist the interruption handoff with files, tests and restart instructions. Keep unfinished changes on the same reviewed batch branch.
2. Record a `switch` decision naming RIR-901, RIR-902 and the user's chosen disposition. Do not infer abandonment because it appears more convenient.
3. Apply the exact matching command: `{ "action": "switch", "from": "RIR-901", "to": "RIR-902", "decision": "D-ACTUAL", "owner": "coordinator", "handoff": ".workboard/handoffs/RIR-901/002-interruption.md" }`.
4. If RIR-902 requires RIR-901, the command fails: pausing is not dependency completion. The pure transition is atomic, so the failed destination start does not leave RIR-901 silently paused. Reconcile the plan with the user; do not delete the dependency to bypass it.

For a different delivery scope, use `to: null`, reach the old batch's checkpoint, preserve the commit and obtain its PR/defer decision first. Opening another worktree does not remove these steps. A request merely to inspect status or answer a question about the active work does not create a new execution ticket.

## Assignment and knowledge-transfer contracts

An assignment captures `id`, current `ticket`, named `agent`, bounded `scope`, owned `paths`, `status: "assigned"` and `handoff: null`. It can be granted only while the ticket is `in-progress`. The coordinator owns composition: split independent investigations or disjoint document/source files, not multiple tickets. Directory and child-file ownership can overlap even with different path strings; the model rejects live overlapping assignments.

The handshake should identify the current board revision, branch/base/HEAD, acceptance to address, source inputs, output expected, owned files and prohibited actions. Workers acknowledge those boundaries before editing. They cannot declare another ticket, spawn a separate scope, authorize user decisions or publish Git changes. Read-only workers return handoff text for the coordinator to persist.

A return is evidence, not automatic acceptance. The coordinator reviews the actual diff/result, persists a nonempty ticket handoff, records `return`, then `accept`. Returned-but-unaccepted assignments still block transitions. A failed test belongs in the return with reproduction and scope implications; do not suppress it to settle the assignment.

| Handoff section | Minimum useful information |
|---|---|
| Identity | Ticket/assignment, agent, timestamp, branch, integration target, immediate parent and HEAD |
| Context | Requirement IDs, exact compared source revisions, files/contracts inspected |
| Changes | Owned file paths and behavior/design changes; staged/unstaged/untracked state |
| Decisions | Chosen option, alternative rejected, reason and actual authorization reference when needed |
| Verification | Exact command, environment, result/counts and excluded/skipped/live limitations |
| Recovery | Next commands, expected output, unresolved decisions, worker status and risk to existing work |
| Acceptance | Which criteria are satisfied and which remain open; no inflated completion claims |

If a worker disappears, preserve its existing changes and assignment. Confirm whether it is still running before another worker takes ownership. There is no cancel-assignment action: obtain/reconstruct an honest coordinator return from observed files and available evidence, mark unknown/unverified work explicitly, then accept only after review. Do not fabricate a successful worker report or reuse the assignment ID. A new follow-up assignment can then take the same paths after the old one is accepted.

## Optimistic concurrency and failure recovery

There are two concurrency controls: the exclusive Git-common-directory mutation lock prevents simultaneous writers, and `--expected REV` prevents a writer from applying a decision against an outdated board. Both are needed: a session may read revision 61, another completes a mutation to 62, and the first may acquire the lock later with stale intent. The first must reread 62 and reconsider its action rather than incrementing the number blindly.

The storage order is canonical shared JSON, tracked `.workboard/state.json`, then generated `.workboard/BOARD.md`. A crash can leave the canonical state newer than the projection. `sync` checks the active topic, validates shared state/handoffs, backs up the current tracked JSON in the Git common directory and restores the projection. It does not merge arbitrary feature changes or decide which independent clone is authoritative.

| Failure | Evidence to inspect | Safe next step |
|---|---|---|
| Stale expected revision | Current revision, intervening history, active handoff | Reread/replan the same authorized mutation; do not auto-retry user decisions |
| Shared/tracked mismatch | Common-dir state, tracked diff, branch, handoff | Preserve conflicting files and use `sync` only after identifying the canonical owner |
| Lock already exists | Exact lock path, PID, root and timestamp; actual process status | Wait for a live owner. Remove only a confirmed stale lock after operator verification; never use a generic recursive cleanup |
| Wrong active topic | `git branch --show-current`, `git worktree list`, shared batch branch | Read the owning handoff; do not transplant dirty files or stale board state across scopes |
| Handoff missing/escaping path | Referenced path, symlink/real path, file contents | Restore the actual artifact inside the ticket directory; never replace it with empty placeholder text |
| Assignment blocks transition | Assignment statuses and return evidence | Persist/review/accept the real return before retrying |
| Commit owns extra files | Staged diff, allowed paths and source of each change | Preserve unrelated edits outside this commit; ask about scope when needed; do not widen paths just to pass |
| Approval stale | Exact head/base/target and newly fetched refs | Prepare the changed review and obtain fresh user approval |
| Parent branch moved/squashed | Frozen parent SHA versus local/remote refs and ancestry | Stop publication and obtain a reviewed resolution; no force or silent re-anchor |
| Earlier closed parent PR checker fails | Parent source version and RIR-005 | Keep the issue visible and execute only separately approved repair work |
| Different clones each show free slot | Published board/branch and other coordinator activity | Coordinate explicitly with the user; local Git locks are not distributed locks |

Read-only diagnostic commands:

```sh
git status --short --branch
git diff --stat
git diff --cached --stat
git worktree list
git rev-parse --git-common-dir
git config --get core.hooksPath
node tools/workboard/cli.ts check
node tools/workboard/cli.ts show
```

Do not use `sync` as a routine way to erase an inconvenient local state. Do not delete `.git/ririko-workboard` to reset work control. If a parser/schema defect prevents a legitimate authorized operation, preserve both state copies and the error, record the blocked condition and ask for the specific repair/migration needed. The RIR-808 one-time bootstrap was explicitly approved, backed up and validated; it is not a general manual-edit exception.

## Stack and publication verification checklist

The resolver preserves two distinct facts: `baseBranch/baseSha` identify the verified integration anchor, while `stack.parentBatch/parentHead` identify the exact earlier scope excluded from this PR's diff. A parent topic is the immediate target until its exact commit is integrated. Source branches, metadata receipts and published PR heads can have different SHAs; preserve each deliberately.

For the RIR-800 documentation example, the reviewed parent is PR #557's RIR-110 head `a04753a473c8a807892848052cc248cff3695805`. The later local publication receipt `de7504b4bb09b20db6bc625ff8ac86c1812de4bf` was preserved separately on `feat/RIR-110-publication-receipt` and its inheritance was explicitly approved. D-003 is fresh stack consent after the parent closed. It does not authorize documentation publication or change PR #557. This is historical context; always inspect live refs and `pr-plan` before a future push.

Before publication, answer all of these with evidence: which repository and fetch/push URL; which exact source branch/SHA; which immediate target/SHA; which integration anchor; which parent commits are excluded; which files belong to scope; which tests ran; which actual reply authorizes these exact actions? `pr-plan` uses cached refs, so fetch and recheck before approval. `approve-publish` refreshes the integration and immediate target again and refuses stale supplied SHAs.

The pre-push hook inspects Git's actual ref updates, not just a human-readable command. It rejects deletion, tags, multi-ref pushes, non-fast-forward publication, wrong topic and mismatched approval. CI verifies PR repository/head/base/scope but cannot authenticate a conversational reply. Local hooks are bypassable by a human; required GitHub checks/branch protections remain an administrator concern rather than an installed guarantee.

After an authorized push/PR, verify the remote source SHA, base branch, repository and resulting URL; record the actual publication decision and receipt. If the network result is uncertain, inspect the remote/PR first rather than creating a duplicate. Closure is administrative state, not merge. No published PR may be auto-merged by interpreting a local stack or publication approval as merge consent.
