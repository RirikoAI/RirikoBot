# RIR-001 — acceptance and PR checkpoint

Coordinator: root. Ticket: RIR-001, chore, **8 points estimated before implementation**, groomed in GR-001. Delivery: BATCH-001, this chore only. Topic: `chore/RIR-001-work-governance`; verified remote `origin`, `https://github.com/RirikoAI/RirikoBot.git`; base: `develop/2.0.0-astra`. The separate `develop/2.0.0` branch is not this batch's target.

HEAD before the grouped local commit and fetched base both equal `801103c0e4c70eca6a380d7d1122b11234695bb1`. The final local commit uses subject `[RIR-001] Establish work board and agent governance`; resolve its actual SHA with `git log -1 --format="%H %s"` rather than trusting a guessed self-reference. This handoff and the completed board are included in that commit. No push, PR, merge, release or deployment has been authorized or performed.

## Result and acceptance

- The tracked JSON/Markdown board contains 20 records with epic/story/task/chore/bug categories, acceptance, priorities, estimates or explicit ungroomed state, parent/child and requires/derived-blocks relationships. Two grooming groups establish the first slices; later systems stay backlog. Historical foundation work is documented separately without fabricated points.
- Runtime parsing and transitions reject missing grooming, invalid Fibonacci values, oversized execution leaves, cycles, occupied-slot starts and mixed batches. Blocked/review retain WIP. Pause/abandon require an actual matching user decision; abandonment is terminal. New root maintenance items need a relationship too.
- One epic/story or independent maintenance scope per batch. Completion reaches a mandatory PR checkpoint. No subsequent story/epic is authorized by a long session. Switch and delivery decisions are single-use and cannot be invented by workers.
- AGENTS.md, GEMINI.md and all 18 specialist definitions link the standing rules. Assignments require bounded paths and return/accept acknowledgement. Session handoff updates retain the current slot. A-001 was returned, reviewed and accepted; the worker is finished.
- Node 24 CLI, common-Git-directory canonical snapshot/lock, optimistic revisions, atomic projection and explicit recovery protect sessions/worktrees in this clone. Installed local hooks guard branch, origin/push URL, scope, staged board, commit ID and exact approved publication HEAD/base. CI checks PR repository/head/base and file scope. Hook line endings are pinned to LF.
- README/development/roadmap, the full usage guide, templates and prepared review describe actual behavior and the user checkpoints. The local governance CLI has no Discord slash/prefix equivalents; no bot commands changed.

## Evidence

- `node node_modules/vitest/vitest.mjs run --project unit`: **87 passed**, 9 files; 28 model tests and 11 real Git/storage tests (39 governance tests).
- `node node_modules/vitest/vitest.mjs run --project integration --project e2e`: **13 passed**, 7 PostgreSQL cases skipped because no test server URL was set. No claim of current PostgreSQL execution.
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.check.json`: passed.
- `node node_modules/typescript/bin/tsc -b`: passed.
- `node node_modules/eslint/bin/eslint.js apps packages tests tools`: passed after preserving the caught lock-error cause.
- `node tools/workboard/cli.ts check`: validates current projection, evidence and WIP. Final lifecycle transitions also run full model validation.
- `git fetch --no-tags origin refs/heads/develop/2.0.0-astra:refs/remotes/origin/develop/2.0.0-astra`: completed; target unchanged at the SHA above.
- `.audit/RirikoBot` remained clean; `.local/` was not modified. No application source, schema or production credentials changed.

Dependencies required restoring from the existing frozen lockfile with pnpm 10.34.5; the system pnpm shim tries a different major version. Direct Node entry points are reproducible here. The lockfile did not change. Nested node_modules are now ignored. Three previously tracked pino launchers are untouched; **RIR-004** records their cleanup in backlog, ungroomed and not started.

## Workspace, scope and limits

Changed scope: `.workboard/`, `tools/workboard/`, `.githooks/`, `.gemini/agents/`, root guidance/README, workflow documentation, `.github/` and toolchain script/test inclusion. All final changes are intended for the single grouped local commit. Review `git status --short` before resuming: expected clean after commit; investigate any discrepancy without reset, clean, automatic stash or force operations.

The local hooks are installed using `core.hooksPath=.githooks`; all worktrees in this clone share `.git/ririko-workboard/`. Fresh clones need installation. Separate clones/machines do not share a distributed lock and must coordinate through the published record and user. Hooks are bypassable; CI cannot authenticate conversational consent, and no GitHub required-check/branch-protection settings were configured. The CLI uses explicit head/base checks but remote publication and real CI execution have not occurred. `gh` was not found on PATH; publication needs an available authenticated API/connector or CLI.

Retrospective: separate the portable board from the local canonical lock, and test worktree conflicts with real Git repositories. Guard the closing metadata commit as well as feature commits so a completed batch can be preserved without reopening implementation. Retain broad roadmap estimates as ungroomed until concrete source/risk review.

## Resume — stop for the user

1. Read AGENTS.md, `.workboard/PROTOCOL.md`, state/board and this handoff. Verify branch/HEAD/status and `node tools/workboard/cli.ts check`.
2. RIR-001 is complete; BATCH-001 is at **checkpoint**. No ticket is executing, and no other ticket may start while the batch checkpoint remains unresolved. All worker assignments are accepted.
3. Ask whether the user wants this chore published as a PR into `develop/2.0.0-astra`. **No approval or defer decision exists yet.** Do not create an approval file or infer a reply from elapsed time.
4. If approved, refresh the explicit target and review `board pr-plan`, the commit/diff and `.workboard/reviews/BATCH-001.md`; bind approval to the actual current HEAD/base. Find any existing PR before creating one. Push one normal explicit topic ref, create with explicit repo/head/base/body, then verify the returned PR identity and URL. Do not auto-merge.
5. If the user defers, record the actual delivery decision, preserve the closing metadata commit and handoff, and agree the next scope/branch. Work depending on this unpublished tooling requires an explicit merge/stacking decision. Never start RIR-211, RIR-003 or RIR-004 automatically.
