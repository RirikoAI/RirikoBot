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
