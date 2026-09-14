# Testing strategy, evidence and release gates

## What exists and what a result means

The current foundation has Vitest projects named unit, integration and e2e. It has no Playwright browser suite, economy/TCG/moderation/provider implementation tests or configured code-coverage threshold. TypeScript compilation and document arithmetic cannot establish those features. Read [requirements](requirements.md), [roadmap](implementation-roadmap.md) and each domain's acceptance contract before claiming completion.

This guide compares the full Gemini testing proposal at 1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33 with the actual repository. Its requested domain breadth is retained as future release gates below. The directories, database lifecycle, fallback behavior and browser suite are described as they exist, rather than treating a proposed testing pyramid as executed evidence.

| Layer | Actual discovery and isolation | What it proves / does not prove |
|---|---|---|
| Unit project | apps, packages and tools ending .test.ts; excludes integration/e2e, node_modules and dist | Selected application contracts, errors, dispatch and governance. Includes real temporary Git/worktrees, generator filesystem and localhost HTTP tests, so the project name does not imply purely in-memory work |
| Integration project | packages and tests ending .integration.test.ts; 15-second test timeout | Real SQLite and opt-in PostgreSQL repository/migration behavior; not full legacy import or production concurrency |
| E2E project | tests/**/*.e2e.test.ts; 30-second timeout | One actual CLI subprocess scenario using a disposable SQLite file across processes; no browser/OAuth E2E |
| Typecheck/lint/build | Strict check includes tests/tools; production project references emit application/package code | Static constraints and compilation, not runtime functionality, account access or performance |
| Workboard/requirements checks | Validate canonical/rendered state, durable handoffs, source coverage and referenced evidence | Workflow/ledger consistency; cannot authenticate a person's consent or prove a documented feature works |

The source of discovery is [vitest.config.ts](../vitest.config.ts); [package scripts](../package.json) select projects. No pass-with-no-tests switch is enabled. A filtered run must report its selected/excluded cases rather than claiming the whole suite passed. A skipped PostgreSQL case is not a passing PostgreSQL test.

## Reproducible commands and environment

Use Node within the repository's declared >=24.13.1 <25 range and pinned pnpm 10.34.5. Local evidence here used Node 24.13.1, TypeScript 6.0.3 and Vitest 4.1.10 on Windows; CI selects Node 24.19.0. Preserve the frozen lockfile. The desktop's fallback pnpm is a different major version: do not let its automatic reinstall prompt silently change the workspace.

Normal milestone checks from the repository root:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm board check
pnpm board requirements-check
```

Equivalent installed entry points used for this epic, without installing/changing dependencies:

```sh
node node_modules/eslint/bin/eslint.js apps packages tests tools
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.check.json
node node_modules/vitest/vitest.mjs run --project unit --maxWorkers=1
node node_modules/vitest/vitest.mjs run --project integration --project e2e --maxWorkers=1
node node_modules/typescript/bin/tsc -b
node tools/workboard/cli.ts check
node tools/workboard/cli.ts requirements-check
```

The one-worker unit run bounds concurrent temporary Git processes on this Windows host. It does not disable test cases. A prior unbounded sandboxed run stalled and was interrupted; only the subsequently completed bounded run is counted. Do not hide failures with repeated retries, omit files or weaken timeouts solely to produce a green result. Build is the normal project-reference build; an incremental success is not a clean-room dependency-install test.

For PostgreSQL, set TEST_POSTGRES_URL only to an explicitly disposable database whose role may create/drop the test schemas. Tests do not create a Docker server automatically. With the variable absent, seven cases skip. For a deliberately SQLite-only PowerShell run, clear it in that command process before invocation:

```powershell
$env:TEST_POSTGRES_URL = $null
node node_modules/vitest/vitest.mjs run --project integration --project e2e --maxWorkers=1
```

Do not print connection URLs or whole environment dumps into evidence. A developer who opts into PostgreSQL must record server/driver version, isolation and cleanup without credentials. Never point these tests at production or a shared application database merely because schemas are randomized.

## Current and historical verification

Results are snapshots of particular code and environments, not cumulative distinct test totals across all sessions. A newer suite includes many earlier cases. The original blueprint and source manifests remain immutable evidence; documentation-only changes do not create new runtime coverage.

| Checkpoint | Observed result | Scope and limitation |
|---|---|---|
| Original foundation, 2026-09-14 | 48 unit, 12 SQLite, 1 CLI E2E, and separately 7 PostgreSQL passed; 68 distinct cases across those runs | Historical source checkpoint; not a fresh run of today's expanded governance suite |
| RIR-001 governance | 87 unit and 13 combined SQLite/CLI cases passed; 7 PostgreSQL skipped | Historical 100-pass run; real temporary Git tests added, no network publication |
| RIR-110 review evidence | 113 unit across ten files, 13 combined SQLite/CLI passed; 7 PostgreSQL skipped | Historical 126-pass run; 65 governance/requirements cases then existed |
| RIR-808 prerequisite / RIR-801 | Full bounded unit run: 119 passed across ten files, 87.62 seconds | Fresh run after the approved stacking repair; no runtime source changed in subsequent documentation leaves |
| RIR-806 SQLite / CLI | 13 passed, 7 PostgreSQL skipped; two files passed and one skipped; 25.57 seconds | Fresh bounded integration + E2E run, TEST_POSTGRES_URL deliberately unset; 12 SQLite plus one CLI case, no external database |
| RIR-806 static gates | ESLint, strict no-emit typecheck and project-reference build passed | Fresh checks of the current epic; no claim of container/native-provider execution |

The historical real PostgreSQL run used an isolated PostgreSQL 18.6 server on loopback and per-test schemas, then stopped it and removed temporary sensitive inputs. Its native binary checksum/provenance and original validation context are preserved in earlier work evidence; it is not silently promoted to a new test run. The RIR-806 row records the current local integration result separately. [RIR-110 handoff](../.workboard/handoffs/RIR-110/003-completion.md), [documentation handoffs](../.workboard/handoffs/RIR-800/002-corpus-plan.md).

### Current unit inventory

The RIR-800 static AST inventory covered 119 cases. The later RIR-005 executed report now verifies 135 cases across ten files, including 16 added integration-governance regressions. Counts below follow that completed report; the earlier inventory is not presented as a new AST audit.

| Area | Cases | Evidence boundary |
|---|---:|---|
| Workboard model | 37 | Estimates/grooming, one active slot, dependencies, terminal states, consent transitions, assignments and fresh stack decisions |
| Workboard Git/store | 43 | Real local repositories/worktrees, locking/recovery, branch/base/scope and publication guards; no actual remote push or PR |
| Requirement ledger | 7 | Blueprint integrity, exact coverage, references and unsupported completion claims |
| Discord dispatcher | 16 | Aliases, parsing, validation, middleware, help and transport isolation through controlled adapters |
| Core | 10 | Configuration, permissions, settings cache, safe errors and selected redaction paths |
| Migration unit | 3 | Fixed migration/schema model checks, not production row import |
| CLI unit | 2 | Argument/diagnostic handling through injected context |
| Generator | 11 | Traversal, symlink/junction boundaries, existing-file preservation and generated syntax |
| Gateway | 3 | Mocked Discord Client ingress and actor/channel behavior, not live gateway login |
| Health | 3 | Actual loopback HTTP with injected database/gateway state and failure cases |
| Total | 135 | 87 governance/requirements plus 48 foundation cases |

No line/branch coverage percentage is measured here. Optional peer metadata in a lockfile does not mean a coverage provider is installed. A future risk-based coverage gate needs a configured tool, honest baseline and meaningful uncovered-branch review; do not invent a percentage to make the project look complete.

## Database, subprocess and lifecycle fixtures

SQLite has 12 integration cases: five shared repository-contract cases and seven SQLite-specific cases. Most use temporary files to test real persistence/reopen behavior; one uses :memory:. PostgreSQL has seven cases: the same five shared cases plus two PostgreSQL-specific cases. Each PostgreSQL test creates its own ririko_test_<random-id> schema and scoped search_path, then drops that schema during cleanup. This differs from a blanket statement that all suites truncate tables between tests.

The shared repository cases exercise read/write persistence, optimistic conflicts, restrictive policy round trips and atomic settings/audit behavior. Concurrent operations currently use Promise.allSettled on one DatabaseConnection. That is useful contention evidence but not a two-connection or two-process proof for future money/card transactions. Add independent connections and controlled barriers when the implementation's invariants require them. Tests must verify both resulting data and absence of partial effects.

SQLite-specific boundaries include fresh/no-create inspection, explicit migration, reopen persistence, legacy namespace refusal, history/checksum tampering and rollback. PostgreSQL exercises its actual driver/schema context. Current migration validation checks managed names/history and known SQL checksum; it does not fingerprint every live column/index/constraint. An integration pass cannot certify arbitrary manually altered database structure or a representative legacy dataset.

The CLI E2E creates a disposable directory/database, runs migrate:status without creating a file, migrates explicitly, writes and reads prefix across separate Node processes, checks health/doctor/command metadata, repeats migration safely and rejects disabling essential core. Credentials are offline placeholders, and subprocess windows are hidden. It neither logs into Discord nor tests a browser. Temporary directories are owned by the fixture and cleaned after each test; cleanup must never target user paths supplied by an untrusted case.

Health tests distinguish /health/live and /health/ready. A deadline can bound the HTTP response but does not cancel the underlying database query; an outstanding probe makes a concurrent probe unavailable. Synchronous SQLite work can block the event loop and delay the timeout itself. Gateway readiness is an injected state in these tests. Shutdown sets not-ready and waits for observed work, but the application has no global drain deadline. A passing health test therefore does not prove bounded process termination under all faults. [Deployment](deployment.md) records operational consequences.

## CI definition versus CI outcome

[CI](../.github/workflows/ci.yml) defines an Ubuntu 24.04 job with a 20-minute timeout and cancellation of older runs for the same workflow/ref. It uses SHA-pinned checkout/setup-node actions, Node 24.19.0, pnpm 10.34.5 and a PostgreSQL 18.6-bookworm service with TEST_POSTGRES_URL. Container tags are versioned tags, not digest-pinned artifacts.

Board and blueprint checks precede dependency installation. Pull requests additionally run guard-pr against declared scope/target. Frozen installation precedes lint, typecheck, unit, both-dialect integration, CLI E2E and build. Later steps validate Compose configuration, build the runtime image and run narrowly defined smoke checks for a non-root process, unavailable TypeScript dev dependency, SQLite migration and doctor under a read-only container with writable temporary space.

These are configured CI steps, not proof that this local unpublished branch ran them on GitHub. The container smoke uses dummy Discord credentials; it does not start the bot gateway, full Compose deployment, dashboard, music engine or providers. Inspect the actual completed run for the exact PR HEAD before reporting CI success. RIR-005 subsequently supplies an explicit new integration-repair checkpoint while preserving the frozen closed-batch checker. CI now checks out the actual event head, compares its committed board and validates resolved target ancestry; synthetic merge checkouts are rejected. The completed documentation PR #561 had successful CI run34885316146; that historical success does not certify the new unpublished repair.

## Future domain acceptance matrix

Every new command/service needs strict typed implementation, meaningful tests and documented slash/prefix behavior. Tests target observable behavior, transactional boundaries and denied effects, rather than mirroring private helper implementation. The following coverage is **required future work**, not present in the 135-case suite:

| Domain | Deterministic service cases | Real boundary / release evidence |
|---|---|---|
| Commands/help/modules | Nested options, manifest parity, requester-bound components, stale sessions, full effective policy | Controlled Discord fixtures plus authorized registration/invocation; per-command compatibility evidence |
| Economy/XP/bank | Integer/fee/curve boundaries, reward replay, cross-guild caps, daily timing, hold/escrow/refund | Both-driver two-connection overspend/stock/settlement races; reconciled opening data and restore |
| TCG RNG/combat | Every weighted interval, complete element chart, exact damage/rounding, seeded replay, status/cooldown loops | Verified source/asset provenance, renderer fixtures, bounded simulations and human balance review |
| Inventory/trade/market | Reservation promotion, offer-edit confirmation invalidation, potion/reset races, multi-asset claim | Concurrent buy/cancel/expiry and ownership/payment/fee rollback, restart recovery |
| Dungeons/quests/guilds | Tutorial grant once, four scaling curves, period/season boundaries, final boss HP and reward identity | Frozen-run content version, independent worker completion races and treasury authorization |
| Moderation/roles/AutoMod | Hierarchy/action gates, warning threshold/expiry races, lock snapshots, bounded rules | Discord submitted/unknown/partial action recovery; softban second-step failure and role revocation |
| Streams/free games | Ingestion/session/target dedup, unknown not offline, mention/template safety | Each authorized platform's access/events/reconnect/quota; no fake successful empty feed |
| Giveaways/auto voice | Draw/reroll identities, eligibility cutoff, room owner/expiry, managed-channel cleanup | Restart/late worker and partial Discord create/send/delete recovery |
| AI/tools | Scope/generation reset, bounded summaries/streams, schema/authority, tool idempotency | Provider/model conformance and separately authorized account/cost/retention probes |
| Images/assets/jobs | Quota reservations, cancellation, unsupported capabilities, SSRF/decode limits, leases/fences | Actual native fixtures, safe backend cancellation, staged-object/DB crash and unknown paid outcome |
| Web/OAuth/vault | State/session/CSRF/DTO isolation, displayed revision, tamper/AAD/rotation/restore | HTTP and Playwright multi-user/guild tests; real OAuth and secure key recovery separately |
| Operations | Safe errors, finite queues, backpressure, retention cursors, drain/restart | Reproducible image/Compose startup, representative load, resource plateau and measured restore |

Fallback fixtures must obey approved data destinations, remaining budget and safe submission knowledge. A simulated 429 does not authorize cloud fallback with private prompts or retrying a possibly completed paid request. A provider mock proves application branching, not vendor availability or terms. Likewise one database receipt cannot prove exactly-once Discord delivery.

## Determinism, failure injection and evidence handoff

Inject clocks and randomness at service boundaries. Check exact RNG interval edges and fixed-seed structured outputs, including rejected moves consuming no draw. Production entropy must not use predictable test seeds. Separate deterministic invariant tests from offline distribution/balance studies; report study seeds, sample sizes and uncertainty. Do not make a CI test pass only when an unseeded rare event happens often enough.

Use controlled barriers for races rather than arbitrary sleeps. For each durable operation inject failure before acceptance commit, after claim, after external submission, after receipt commit and before presentation. Assert the actual persistent state, next allowed action, resource cleanup and absence of duplicate effects. A timeout assertion alone does not establish cancellation. Test more than one worker/connection when the design depends on cross-process exclusion.

Record exact command, HEAD/source changes, runtime/driver versions, passed/failed/skipped counts, selected projects, duration when useful and unresolved gates. A retry after a failure keeps the failed attempt in the record and explains the cause. Keep diagnostics sanitized and bounded. Persist specialist findings and coordinator acceptance under the active ticket's handoffs; do not rely on chat memory or sum overlapping historical test totals.

No live Discord registration/login, external AI/image/stream request, audio playback, browser OAuth, production migration or local Docker image execution has been performed in this epic. The earlier Docker daemon was unavailable; this task has not reclassified that as a successful container run. Static audit replay verified legacy schema DDL, including the RIR-802 independent 85-statement SQLite replay, but did not run TypeORM or import representative production rows. Those remain release gates. Documentation links and arithmetic checks are useful evidence for documentation correctness, with that limited scope stated explicitly.

## RIR-005 integration repair verification

On 2026-09-14, `node node_modules/vitest/vitest.mjs run --project unit --maxWorkers=1` completed **135 passed / zero failed**, ten files,193.58seconds. JSON/default reporters recorded the same result. The targeted precursor selected13 real-Git cases (30 existing cases deselected), all passed in62.52seconds; do not add those to135 as new tests. Fresh ESLint, strict typecheck and project-reference build passed. Node24.13.1, Vitest4.1.10 and the existing lockfile were unchanged.

The real-Git fixture file uses a bounded30-second test timeout because repeated Windows Git process creation exceeded the prior five-second default. Historical traversal was reduced to one NUL-delimited Git command per range. This does not change service timeouts or skip cases. Earlier red runs identified fixture shared-state/merge setup mistakes and integration/upstream ownership regressions; only the corrected complete run counts as acceptance.

New tests exercise source order/identity/consent, immutable source ownership, identical-tree squash parent identity, transitive omissions, administrative-only baseline and transient edits, mandatory retained ancestry at atomic checkpoint, failed mutation preservation, source-owned versus repair-owned merge changes, actual-head/committed-board validation and already-integrated ordinary stacks. Existing approval, scope, non-fast-forward, shared-lock and worktree cases remain enabled.

The real local repair preserved both original and squash ancestors through two inspected standard merges with zero content delta. Source/repair guards pass against that graph. Local CLI guard-pr and clean publication-plan results are recorded in the [RIR-005 completion handoff](../.workboard/handoffs/RIR-005/004-completion.md). No remote repair CI or integration merge is inferred from this rehearsal. Database runtime was unchanged, so the earlier13 SQLite/CLI cases and seven skipped PostgreSQL cases remain historical rather than being claimed freshly rerun here.
