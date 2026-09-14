# RIR-110 — completed review-evidence story and publication checkpoint

Coordinator, 2026-09-14. RIR-110 was estimated **13 points** in GR-003 before starting and remained the sole active ticket. A-002 and A-003 returned their bounded Git-guard assignments; both returns were reviewed, persisted and accepted. This handoff supersedes `003-session.md`. No second story or bug was started.

## Branch and decision context

Topic: `feat/RIR-110-review-evidence`. Integration target: `develop/2.0.0-astra` at `801103c0e4c70eca6a380d7d1122b11234695bb1`. Immediate stack target: `chore/RIR-001-work-governance`, frozen at **`c1018829abf42fd2f8aad22948de343e51dc1e95`**. The topic inherited that commit; this completion handoff is committed with the RIR-110 delivery. Obtain its exact resulting HEAD with `git log -1 --format="%H %s" feat/RIR-110-review-evidence` rather than embedding a circular self-hash.

D-001 records the actual user reply: **“Yes—defer this PR and allow one stacked improvement story.”** That authorizes the local stack only. BATCH-001 remains closed/deferred, and BATCH-002 stops at its PR checkpoint. No publication approval, push, PR, merge, reset or history rewrite occurred during this story. Parent commits remain reachable unchanged.

## Acceptance and findings

- Preserved the complete user attachment verbatim as `BLUEPRINT.md`: 54,943 bytes, SHA-256 `5261a43d6522deccc8a9fe686f700a76867b0aa4a0f3eadb7a22cfb8eb6424c2`. Normalized content hash `0c605080aa91782d32545680369f4dc8005bb21c546819df8336c64b3a5da86c` tolerates CRLF/LF only. Explicit later user work-control instructions take precedence over older broad autonomy in the original request.
- Mapped all **91 numbered sections** and **35 exact final acceptance criteria** to honest status, existing backlog scopes, code/test/design references and concrete gaps. The ledger does not claim full platform completion. CI and local commands check integrity, coverage, references, stale rendering and unsupported document-only implementation claims; a file link alone cannot prove passing tests or live behavior.
- Pinned the branch comparison in `docs/branch-comparison.md`. Remote Astra has the actual gateway/command/settings/database/CLI foundation and tests; remote Gemini `1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33` has a console greeting plus substantial planning. The final fetch caught its newer seven-file documentation update with equipment, stamina, seasonal dungeon and achievement detail; these additions are credited in the report. Gemini's full blueprint retention was the strongest improvement to adopt in this story. Its missing JSON stories, inverse dependency gaps and conflicting stream/reaction/TCG plans need correction before implementation. Both branches still lack major product modules. The older c07c2d6 snapshot in the initial handoff is historical; Astra's integration ref remained unchanged on the final fetch.
- Added explicit stack validation and target resolution, exact scope diffs, moved-parent/inherited-scope checks and separate parent/child approval checks. A missing remote parent permits review planning but prevents child publication. Declaring the stack atomically with a new batch resolves the setup ordering issue found in final review; a real-command regression proves the complete start path without manual board editing.
- Updated standing guidance, the workflow guide and completed-handoff visibility. No application behavior, schema, provider, dependency or legacy source changes were included.

Changed areas: `BLUEPRINT.md`; `docs/requirements.json`, generated Markdown, comparison, testing and workflow guidance; root AGENTS/GEMINI/README; `tools/workboard` model/store/render/Git/CLI and tests; CI requirements check; board and versioned handoffs/review. Specialist files were owned exclusively during assignments, then reviewed by the coordinator.

## Verification

Using installed Node 24.13.1, TypeScript 6.0.3 and Vitest 4.1.10 entry points to avoid the system pnpm major-version mismatch:

| Check | Actual result |
|---|---|
| `node node_modules/vitest/vitest.mjs run --project unit` | **113 passed**, 10 files; 70.67 seconds. Includes 29 model, 29 real Git/store and 7 requirements tests |
| `node node_modules/vitest/vitest.mjs run --project integration --project e2e` | **13 passed**, 7 PostgreSQL tests explicitly skipped because TEST_POSTGRES_URL was absent |
| `node node_modules/eslint/bin/eslint.js apps packages tests tools` | Passed |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.check.json` | Passed |
| `node node_modules/typescript/bin/tsc -b` | Passed |
| `node tools/workboard/cli.ts check` and `requirements-check` | Passed; canonical state/render and all 91/35 mappings verified |
| Original attachment comparison | Byte-for-byte equal; exact SHA-256 verified |
| `git diff --check`; audited legacy Git status | Passed; legacy clean at pinned source commit |

**126 tests passed in the current verification; 7 skipped.** Historical PostgreSQL success in `docs/testing.md` was not rerun or counted here. No live Discord/provider, Docker execution, dashboard or production data migration was validated. Git tests use disposable repositories/worktrees, not network pushes. The new atomic-start test initially exposed a missing ready transition in its fixture; the fixture now follows create → groom → ready → batch → start, and the full suite passes.

## Publication boundary and recovery

Prepared review: `.workboard/reviews/BATCH-002.md`. The coordinator finishes the done/checkpoint transitions and local scope commit, then confirms a clean checkout and runs:

```sh
node tools/workboard/cli.ts check
node tools/workboard/cli.ts requirements-check
node tools/workboard/cli.ts pr-plan
node tools/workboard/cli.ts pr-plan --batch BATCH-001
```

Expected child plan: BATCH-002, topic `feat/RIR-110-review-evidence`, immediate target `chore/RIR-001-work-governance` at the frozen parent SHA, mode `story-pr`, parent initially unpublished. Expected parent plan: BATCH-001, its preserved head, integration target, mode `parent-branch-push-only`, **no parent PR creation arguments**. Re-read status, shared board, actual HEAD and exact fetched refs at resume; a changed ref requires review, not silent re-anchoring. Do not start another ticket while the delivery decision is pending.

The preserved parent's older PR checker rejects closed BATCH-001. **RIR-005 records that observed defect and remains unestimated, ungroomed, unstarted backlog.** Do not rewrite the parent, bypass its check or claim it is ready for its own PR. A concrete option requiring new user approval is to push only the preserved parent branch, keep its PR deferred, then publish the child's separate PR against that parent. Bind each publication approval to its own exact ref/head/base/target. Parent integration requires a separate reviewed resolution; no merge is authorized. Inspect existing PRs before creation and verify the resulting repository/head/base/URL.

Retrospective: validate the real lifecycle commands as well as isolated Git guards. Preserve the complete requirements early, but groom future implementation into individual stories before execution; broad documents, source-file counts and passing foundation tests cannot substitute for product acceptance.
