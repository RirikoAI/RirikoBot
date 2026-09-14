# ADR-014 — Integrating completed deliveries after squash merges

Status: accepted for the RIR-005 local reconciliation implementation; publication and integration-branch merge remain separate approvals. Date: 2026-09-14. Supersedes neither prior delivery receipts nor their original approvals.

## Problem and verified history

The frozen governance head c1018829 contains only a closed BATCH-001. Its original PR checker requires an open checkpoint, so publishing that exact frozen head as a new PR cannot pass that checker. PR #557 subsequently squash-merged the evidence story into the governance topic; PR #561 squash-merged documentation into the evidence topic. Neither action updated develop/2.0.0-astra. Reopening old tickets, altering their published heads or loosening all closed-batch checks would misrepresent the completed work.

The user explicitly selected RIR-005 to reconcile these histories, preserve commits and prepare the integration path. The repair was groomed at 13 points before starting. Its own delivery is BATCH-004; prior scopes remain closed. New feature work and Docker validation are outside this scope.

| Completed delivery | Retained original | Verified squash | Immediate squash parent |
|---|---|---|---|
| BATCH-001 / RIR-001 | c1018829abf42fd2f8aad22948de343e51dc1e95 | None required | Original integration anchor 801103c0e4c70eca6a380d7d1122b11234695bb1 |
| BATCH-002 / RIR-110 | a04753a473c8a807892848052cc248cff3695805 | 7f0fd9ae589ec140adc4ab7f01ec63299ac4a42b | c1018829abf42fd2f8aad22948de343e51dc1e95 |
| BATCH-003 / RIR-800 | e09daed09d5b625095923a622789413d8281327b | f33b0c5535a7a7df4d9278aebeec7a5b9440de43 | a04753a473c8a807892848052cc248cff3695805 |

Each squash has exactly the same full Git tree as its corresponding original. The two squash commits are not a linear chain: 7f0fd9a is not an ancestor of f33b0c5. The pre-repair baseline a27151bcf4ed3a72fdd3840011015acb17ae6048 retains the complete original chain plus administrative publication/closure receipts. Its delta after e09daed is exclusively .workboard paths. Separate receipt branches retain those local facts.

## Decision

Use one new estimated integration repair delivery, targeting the verified integration branch. Its optional `integration` record is mutually exclusive with `stack`:

```ts
interface Integration {
  decision: string;
  baseline: string;
  sources: Array<{ batch: string; head: string; merged?: string }>;
}
```

All SHAs are full immutable commit IDs. `baseline` is the preserved source/receipt boundary before repair work. `head` is an original completed delivery snapshot. `merged`, when supplied, is a verified one-parent, identical-tree squash receipt. The existing version-1 board accepts this additive optional field; old boards remain parseable by the new tool. Old tool versions cannot process new integration records and must not be used to mutate them.

Record a separate `integrate` decision naming the current open repair batch and the actual user request. Apply `{ action: 'integrate', batch, integration }` once through the locked board store. This replaces an initial stack declaration atomically after validation, allowing the implementation to bootstrap under the previously supported stack contract. It does not reopen source tickets, close batches or approve publication. Rejected mutations leave shared state and checkout projections unchanged. A changed resolution needs a newly reviewed scope rather than silently overwriting the declaration.

## Provenance and ownership checks

Sources must be distinct earlier closed deliveries in board order, with all included tickets done and worker returns accepted. The resolver reads each source board from its immutable Git commit. Repository identity, batch branch/scope/base/ticket membership, completion and assignment state must match the recorded delivery. Transitive unintegrated stack parents must appear explicitly with the exact preserved head. A missing source cannot be excused because the latest document tree looks complete.

Each original head must descend from its original immediate base and remain an ancestor of the repair baseline. A squash must have one parent equal to that immediate base and a full tree equal to the original source. Tree equality by itself is insufficient: a same-tree commit attached to an unrelated parent fails. These are verified Git facts and pinned review evidence, not a cryptographic proof that GitHub approved a PR.

The baseline must descend from the latest source head. Every additional commit between that head and baseline may change only .workboard paths; a transient runtime edit followed by its removal still fails. The baseline must remain an ancestor of the proposed repair head. All recorded squash receipts must be retained as ancestors before checkpoint/publication. Local merges must use ordinary reviewed conflict resolution, preserving the latest canonical board and unrelated changes.

Ownership has two distinct checks:

1. Every source's introduced history is checked against that source's own immutable ticket paths, not current expanded permissions. Source merge resolution is compared to its first parent.
2. Every repair commit after the baseline, and the final repair delta, must fit the repair ticket's paths. Already validated original/squash ancestry is excluded from this new-work audit. The merge commits themselves remain audited, preventing a merge-resolution edit from acquiring historical broad permissions.

NUL-delimited Git traversal preserves filename boundaries and audits transient changes without launching one subprocess per commit. The cumulative PR includes previously completed deliveries because this resolution explicitly authorizes their integration. That is different from executing multiple new scopes in one batch. Review both the cumulative integration diff and the baseline-to-repair diff.

Ordinary stacks continue to reject moved parent refs. Explicit integration records intentionally pin historical objects independently of later mutable source-topic tips; the user-reviewed original/squash mapping explains those movements. They do not tolerate arbitrary unrecorded trees or new repair content. Exact integration-target freshness and ancestry checks remain mandatory.

## CI and publication

CI checks out `github.event.pull_request.head.sha` for PRs and `github.sha` for pushes, retains full history and does not persist credentials. The PR guard validates the event SHA before using it, requires checkout HEAD to equal it, and compares the board with the board committed at that SHA. A synthetic merge checkout or checkout-only board change is refused. Resolve the actual target before checking the complete event; an ordinary stack whose exact parent is already integrated may legitimately target integration.

The checked PR must include the verified current target. Repository, head branch, target branch and exact base SHA must match. Existing clean-checkpoint, settled-assignment, path, one-ref fast-forward push and exact-head publication approval requirements remain. Integration consent cannot substitute for `approve-publish`. Neither local hooks nor head-controlled CI authenticate conversational approval or establish server branch protection.

The frozen closed-parent PR still fails its original checker. RIR-005 resolves the delivery route through this new validated repair checkpoint; it does not claim to retroactively fix the frozen historical commit or permit arbitrary closed-batch publication. After integration succeeds under a later merge decision, new feature work can branch from the verified integration head.

## Alternatives and consequences

Rebasing or overwriting published topics would discard the original ancestry and complicate existing receipts. Cherry-picking the whole stack could duplicate already squashed patches while losing commit ancestry. Automatically accepting tree-equivalent moving refs would hide unreviewed scope changes. Reopening closed batches would conflate completed acceptance with new work. None is used.

This design preserves more history and makes the eventual cumulative PR larger, but the record identifies each completed source and isolates new repair changes. Support is deliberately limited to original delivery snapshots and single-parent identical-tree squash receipts. A conflict-resolved squash with a different tree, or integration of a prior integration record, requires a new design/review; it is not guessed automatically.

## Required evidence

Real disposable Git repositories cover original chains, same-tree squashes, missing/incorrect source identity, transitive omissions, wrong squash parents, unretained receipts, administrative boundaries, source-only versus repair-only paths, transient changes, atomic rejection and actual-head CI validation. Existing ordinary-stack/publication tests remain regression gates. Source and repair records must survive the local rehearsal unchanged except for the active repair's canonical board updates. Exact execution results are recorded in the RIR-005 handoff and testing guide; this ADR itself is not proof of a passed run or remote integration.
