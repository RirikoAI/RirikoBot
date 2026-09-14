# RIR-001 / A-001 — workflow-engine return

Agent: workflow-engine. Coordinator persisted this actual specialist return on 2026-09-14. Scope: pure model and its regression tests. Branch: `chore/RIR-001-work-governance`; target `develop/2.0.0-astra`; inherited HEAD/base `801103c0e4c70eca6a380d7d1122b11234695bb1`. No Git publication or state transitions performed by the worker.

Read-first context: `.workboard/PROTOCOL.md`, `state.json`, current bootstrap handoff, shared `tools/workboard/types.ts`. Initial Markdown board/handoff were still being bootstrapped when the assignment began; coordinator supplied the completed paths before return.

Owned files: `tools/workboard/model.ts`, `tools/workboard/model.test.ts`.

Implemented strict runtime parsing, cross-record validation and pure atomic transitions. Checks cover fixed Fibonacci grooming, dependency/parent cycles, one occupied slot including blocked/review, parent containers with executable leaf stories, scoped delivery checkpoints, non-overlapping worker assignments, coordinator-only decisions and return/accept sequencing. Abandonment is permanent; used or stale switch decisions cannot be recycled. The coordinator-requested `handoff` action persists session knowledge while retaining the same active slot, including unfinished assignments.

Decisions: parent containers do not execute; executable leaves must be <=13 points; estimates freeze after starting; exact declared `deliveryScope` controls batching; a checkpoint requires resolving active work first. Cross-scope work uses a user-authorized disposition with no immediate destination, then the separate PR/defer checkpoint. No implicit epic-wide acceptance of story batches.

Evidence reported by the worker:

- `node node_modules/vitest/vitest.mjs run --project unit tools/workboard/model.test.ts`: **27 tests passed**.
- `node node_modules/eslint/bin/eslint.js tools/workboard/model.ts tools/workboard/model.test.ts`: passed, no diagnostics.
- Repository bootstrap board validates.

The system pnpm shim attempted an implicit install and failed with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`; direct local Node entry points passed. Coordinator repaired dependencies using pinned pnpm 10.34.5 with the existing frozen lockfile.

Integration boundaries: storage must serialize writes and verify actual handoff files; coordinator must verify real user consent and Git state. Pure validation does not authenticate an approval or prove that a test/PR occurred. No secrets or credentials were accessed by this assignment.

Next: coordinator reviews/accepts A-001, runs integrated typecheck and workflow/storage/Git tests, persists final acceptance evidence and asks the user at the delivery checkpoint. The worker is finished and has no pending files, sub-agents or independent tickets.
