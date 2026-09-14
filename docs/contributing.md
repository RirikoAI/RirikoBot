# Contributing, review and release

Contributions preserve observable legacy behavior while replacing unsafe internals with tested contracts. The foundation is working; the version `2.0.0` in manifests does not mean the full platform is released. [The roadmap](implementation-roadmap.md), [legacy inventory](legacy-feature-inventory.md) and [requirement ledger](requirements.md) distinguish evidence from remaining work.

This repository's mandatory delivery rules are in [AGENTS.md](../AGENTS.md) and [the work protocol](../.workboard/PROTOCOL.md). They apply to people coordinating agents, every new session and every specialist assignment. One active ticket and one epic/story delivery batch are separate constraints. An explicitly selected epic may contain sequential tickets; finishing it requires the user's PR decision before another scope. An instruction to improve the whole platform never overrides that boundary.

## Before a change is ready to start

Read the relevant original [blueprint](../BLUEPRINT.md) sections and matching specialist instructions. Do not replace the original request with a competing branch's interpretation. Read actual source, callers, schema and relevant tests; for compatibility work, follow the pinned legacy source and exact slash options/prefix aliases rather than a remembered command name. Both `.audit/RirikoBot` and `.local/` are read-only.

A ready ticket records its parent, prerequisites, delivery scope, owned paths, acceptance criteria, grouped Fibonacci estimate and rationale. Executable work is at most 13 points. Link acceptance to requirement IDs; describe how it will be observed. For example, a prefix change should cover authorized update, unauthorized denial, invalid prefix, concurrent revision conflict, persistent audit and both transport entry points. “Add settings” is not sufficient acceptance.

| Contribution | Required design evidence before implementation |
|---|---|
| Command | Exact metadata, legacy aliases/options, permissions, shared service call, slash/prefix examples and failure behavior |
| Service | Framework-independent request/result and store contracts, authorization, transaction boundary, cancellation/retry policy where relevant |
| Database change | Both dialect schemas/constraints, forward migration, rollback-by-restore plan, repository contract review before consumers |
| Provider | Primary-source capability/access evidence, bounded request, secret handling, error mapping, timeout/fallback/ambiguous-completion policy |
| Dashboard | Authenticated actor source, guild authorization, shared schema/service, conflict and secret-redaction behavior |
| Documentation | Source baseline, implemented/proposed labels, runnable-command verification, local link integrity and consistency with requirements |
| Bug | Minimal reproduction, expected/actual behavior, observed impact and regression test at the failing boundary |

If investigation reveals work outside the ticket, record a backlog item with the evidence and continue only independent authorized work. Do not quietly add a schema redesign, dependency upgrade or second story to “clean things up.” If work must switch while the slot is occupied, the coordinator asks the user whether the current work is paused or abandoned and records their actual answer.

## Implementation discipline

Use explicit composition and small interfaces. Core contracts have no Discord.js, driver or web-framework dependency. Commands translate input/output and call services; services enforce rules; repositories commit persistent invariants; adapters translate provider behavior. Avoid implicit globals, dynamic module scanning and broad utility abstractions without a current consumer.

Only `pnpm ririko generate command NAME` is available. It creates a status command, test and README and still needs manual factory registration. See [development](development.md) for the tested path and manual service/provider/game/dashboard/migration walkthroughs. Do not cite unavailable generators as completed work.

Use strict TypeScript without `any` escape hatches. Treat JSON, environment, event payloads and database/provider results as untrusted runtime inputs even when static interfaces exist. Validate once at each trust boundary, then pass typed values. Keep secrets/raw private prompts out of error messages, logs, screenshots, fixtures and handoffs. Catch/await asynchronous boundary work and close owned resources on both success and failure.

State-changing operations need an explicit retry story. A database transaction can conserve balances or advance a revision; it cannot prove an external Discord/provider operation happened exactly once. Specify what happens if the process stops after an external success but before persistence. Do not conceal an unknown completion behind automatic retry.

Preserve applied migration checksums. Do not modify old migration SQL to make a new test database pass. Coordinate database contracts before dependent app changes and run repository behavior against both dialects. Legacy imports must preserve source identifiers/raw rows and expose anomalies. A representative restore rehearsal is a release gate, not an optional documentation exercise.

### Dependencies and architecture decisions

Pin direct dependencies and preserve the frozen lockfile. For an upgrade, record current/proposed version, official release/security notes, supported Node/native platforms, changed API, transitive/lockfile impact and checks. Do not upgrade a dependency merely because a documentation example uses a newer version. Build-script allowlist changes receive the same review as executable tooling.

An ADR is warranted when an alternative changes ownership, persistence, public behavior, provider strategy or operational cost. Include status, problem, constraints, alternatives, chosen contract, consequences, validation and revisit triggers. A proposed ADR does not certify working code. Amend an ADR when its assumptions change rather than leaving two contradictory “accepted” defaults.

## Verification scaled to the change

Run checks that test the changed behavior, then the repository's required gates. Do not add tests that merely repeat generated prose or assert implementation text. Unit tests should exercise a rule or failure; integration tests should prove a real boundary such as revision/audit atomicity; end-to-end tests should run the actual executable/transport path.

```sh
pnpm board check
pnpm board requirements-check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

[testing.md](testing.md) defines projects, fixtures and external prerequisites. Record separate passed/failed/skipped counts, environment and commit. PostgreSQL tests skipped for lack of a database are not PostgreSQL passes. Mocked Discord/provider tests are not live smoke tests. An existing historical passing result is not a fresh result for a changed commit. Do not replace a failing integration with a placeholder to obtain a green report.

For documentation-only changes, verify every local reference, runnable syntax and source assertion; preserve immutable manifest/source hashes and regenerate generated files. Code fixes discovered during documentation need a properly controlled ticket, as the approved RIR-808 prerequisite illustrates. Re-running expensive unrelated tests without a new change or concern does not add evidence.

### Evidence and requirement updates

[requirements.json](requirements.json) is the editable requirement manifest; [requirements.md](requirements.md) is generated. Update evidence and remaining gaps for the implemented slice, run `pnpm board requirements-render`, then `pnpm board requirements-check`. The checker validates original section/checklist coverage, source integrity, ticket references and safe existing evidence paths. It cannot infer that a test passed from a filename or certify a live feature from prose. Keep the original blueprint unchanged unless the user explicitly amends it.

## Review contract

Before moving to review, the coordinator receives, persists and accepts each specialist return. Assignments stay within the same active ticket and have disjoint file ownership. A reviewer needs the requirement, baseline, actual diff, test evidence and remaining uncertainty; chat history is not the review artifact.

A useful review description follows the concrete behavior:

> Changing a guild prefix now uses the shared settings service. Authorized slash and prefix calls persist one audited revision; a stale concurrent update fails without replacing the newer value. Validation: service denial/validation cases and both-dialect revision/audit integration results. Remaining limitation: live development-guild smoke not yet run.

This is an illustrative description, not a claim that a new change was made. Scale detail to risk. Describe why the reviewer should care about each implementation detail, and avoid listing every tool command chronologically.

| Review dimension | Reviewer question / evidence |
|---|---|
| User behavior | Do both entry points preserve names, options, permissions and error recovery? |
| Isolation | Can supplied IDs cross guild/user ownership? Is trusted identity derived at the edge? |
| State correctness | Are duplicate requests, revision conflicts and crash windows safe? |
| Resource lifecycle | Are promises awaited, timeouts bounded and connections/jobs cleaned up? |
| Compatibility | Is schema/data/API migration explicit and rollback feasible? |
| Tests | Does the test fail for the actual defect? Are external skips and unmeasured targets clear? |
| Scope | Does every changed path and commit belong to this batch? Are discovered extras still backlog? |
| Documentation | Do claims match current code? Are proposed defaults labeled and links valid? |

A reviewer can request revisions while the same ticket retains the slot. Return to `in-progress` through the board before further implementation. “Done” requires acceptance and handoff, not merely compilation. A code review may conclude with no actionable findings while still recording untested external behavior.

## Git and PR procedure

Actual integration is **`develop/2.0.0-astra`** in **`RirikoAI/RirikoBot`**, remote `origin`. Never substitute Gemini's `develop/2.0.0`. Immediate targets for approved stacks are resolved from exact ancestry by `pnpm board pr-plan`; the integration branch and immediate PR target may differ.

Use a scope-bearing topic (`feat/RIR-210-general-commands`, `fix/RIR-231-memes`, `chore/RIR-001-work-governance`) and a subject such as `[RIR-210] Preserve general command parity`. Conventional wording can follow the required scope marker. Stage explicit paths after reviewing staged/unstaged/untracked state. Never auto-stash, hard-reset, clean, force-push, rewrite published history or delete another worker's files.

1. Keep local checkpoints within the declared batch. Confirm origin/push URL, branch, base ancestry, scope paths and installed hooks. A clean local commit preserves work; it is not authorization to publish.
2. Finish all batch acceptance and handoffs, accept workers, mark leaves done, and reach the batch checkpoint. Prepare `.workboard/reviews/BATCH-ID.md` with behavior, verification, limitations and exact intended target.
3. Refresh target refs, inspect existing PRs and `pr-plan`, then ask the user whether to publish this concrete scope. Stop until they answer. A local-stack approval does not authorize a push/PR; an earlier scope's approval cannot be reused.
4. After actual approval, bind exact head/base/target using `approve-publish`, push the explicit topic ref and create/verify the PR with explicit repository/head/base/body. [Work management](work-management.md) contains the exact contracts. Never auto-merge.
5. Record the verified PR URL or actual user deferral and preserve its administrative receipt. Do not push a later receipt onto a published parent automatically: a stack may depend on its frozen SHA. Preserve receipts separately when required by the reviewed stack.

PR #557 belongs to RIR-110. Its existence does not grant permission to publish the RIR-800 documentation epic. The original deferred governance parent has the separately tracked RIR-005 PR-checker issue; keep its integration limitation visible instead of rewriting history to hide it.

## Release contract: planned, not activated

All current workspace versions are `2.0.0`; release remains pending the roadmap's feature, migration, security and operational gates. Use 2.0.x for compatible fixes, 2.1.x/2.2.x for compatible additions, and 3.x only for deliberate breaking interfaces with a documented migration path. Root is private; there is no active automatic artifact-publishing job or release credential configuration at this checkpoint.

A release ticket should produce the following reviewable evidence before requesting publication:

| Gate | Required artifact / reason to stop |
|---|---|
| Scope and parity | Exact included features, remaining exclusions, legacy compatibility evidence and completed requirement acceptance |
| Version/dependency coherence | Workspace versions updated together where applicable; reviewed lockfile and changelog/upgrade notes |
| Reproducibility | Clean frozen install, lint/type/build/tests, target-platform native dependency and container evidence |
| Data safety | Representative old-data import, reconciliation, backup integrity and timed restore rehearsal; unresolved loss/anomaly blocks rollout |
| Runtime | Development/live smoke, readiness, shutdown, resource limits and failure-path checks |
| Security/configuration | Secrets externalized, permissions checked, credential rotation/recovery documented and required deployment variables validated |
| Rollout | Exact source commit, intended artifact/tag destinations, migration order, health thresholds, rollback owner and recovery instructions |

Tagging, publishing packages/images, deployment and merging require authorization for those concrete external actions. Do not improvise `pnpm publish` for this private monorepo or fabricate a release command. After authorized publication, verify artifact digest/version/source, record the receipt and validate the deployed health/critical flows. A failed rollout follows the prepared rollback plan; restoring old binaries alone may not undo a schema change.

## End-of-session handoff

Use [the handoff template](../.workboard/templates/handoff.md). Record ticket/assignment, branch/base/HEAD, inspected sources, owned changes, decisions and reasons, exact checks, unstaged/staged/untracked inventory, worker state, risks and the next concrete commands. Link facts to files, not machine-specific `file://` URLs. Add one useful retrospective observation about scope/estimate assumptions. If the task is unfinished, retain the occupied slot; do not auto-pause to let a new session start something else.
