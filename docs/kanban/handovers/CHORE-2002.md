# CHORE-2002 · Make the Test Suite Pass on Windows

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-10T20:59:20Z · claude-opus-5-5 (coordinator)

**Evidence from the EPIC-019 reviews**
- `deploy-host.test.ts` at `--testTimeout=120000` has 1 failure ("deploys the first release of staging", from the sha256sum `*`) and 12 timeouts at 5 s.
- The `factory.test.ts` WAL test takes about 6 s on Z:. Creating the file database takes 509 ms on Z: against 45 ms on C:.
- The `db-migrate.test.ts` adoption test times out under coverage load.

**Rule**: raise timeouts only per file or per test, where a real shell or file database runs. Never remove assertions.

---

## GROOMING · 2026-10-19T16:25:00Z · claude-opus-5-5 (coordinator) · a load flake seen on Linux

A baseline run on 2026-10-19 (Linux container, another vitest run in parallel) of `pnpm vitest run scripts/deploy-host.test.ts --testTimeout=120000` failed one test: `ririko-deploy on a Lavalink host > keeps polling /version until it answers 200 and fails when it never does` (`scripts/deploy-host.test.ts:3071`). Run alone, it passes. Its `slow` case sets `LAVALINK_READY_TIMEOUT=10`, and the script's loop (`deploy/host/bin/ririko-deploy.sh:529-541`) measures wall time with `$SECONDS`. Under load, four fake checks can take longer than 10 s, so the deploy gives up before the fourth check answers 200.

**Add to this chore**: in the `slow` case, raise `LAVALINK_READY_TIMEOUT` to 60. The case ends as soon as the fourth check answers 200, so it does not get slower. Keep every assertion, and keep the `never` case as it is. Note the change in the PROGRESS entry under acceptance item 2.

---

## PROGRESS · 2026-10-19T17:30:00Z · claude-medium (claude-sonnet-5-5) · REVIEW

**Files changed**
- `scripts/deploy-host.test.ts`: `vi.setConfig({ testTimeout: 30_000 })` for the whole file (every test starts bash). `shaLine` now accepts `<hash>  <file>` and `<hash> *<file>`. New test "compares the sha256 lines of a sha256sum that prints "<hash> *<file>" (Git Bash)": a fake `sha256sum` on PATH wraps the real one and rewrites the output to the star form; it deploys 2.1.3 and 2.1.4 with identical content, asserts the recorded state lines have the star form and match `shaLine`, and that the second deploy says `unchanged` and does not touch Docker. In the Lavalink polling case the `slow` scenario uses `LAVALINK_READY_TIMEOUT=60` (item from the 2026-10-19 GROOMING entry); the `never` case and all assertions are unchanged.
- `apps/cli/src/commands/db-migrate.test.ts`, `apps/cli/src/commands/db-copy.test.ts`, `packages/database/src/copy/copy-database.flow.test.ts`: the describe blocks that use real file databases get `{ timeout: 30_000 }` (a `FILE_DATABASE_TIMEOUT_MS` constant).
- `packages/database/src/client/factory.test.ts`: the `SQLite Client` describe gets `{ timeout: 30_000 }` (covers the WAL test).
- `vitest.config.ts` is unchanged: the default 5 s timeout stays for every other file.
- `docs/kanban/board.json`, `BOARD.md`: ticket status.

**Verification**
- `pnpm test:coverage && pnpm format:check && pnpm lint --quiet` on Linux: pass. 443 files passed, 5189 tests passed, 509 skipped. Coverage 81.52% statements, 71.69% branches, 84.72% functions, 82.72% lines (all above the thresholds).
- Acceptance 3 (Windows run) is the coordinator's and the maintainer's to check; it was not run here.
- No commit or push.

**Decisions & gotchas**
- Acceptance 1: the fix is in the test, not the script. The script only compares sha256 lines that its own `sha256sum` printed, so both forms are consistent on one host. The `*` form is covered on Linux by the fake `sha256sum`, so CI proves both forms.
- Acceptance 2: a file-level `vi.setConfig` for deploy-host (all its tests spawn bash), and describe-level timeouts for the file-database suites. Raising the timeout on `db-migrate.test.ts` also covers the adoption test. `copy-database.integration.test.ts` and `copy-database.test.ts` were not changed: the first uses `describeDialects` and the second does not create files.
- `scripts/deploy-host.test.ts` already had uncommitted edits from before this ticket (a `deploy_key_state` describe from other work). They were left alone.

**New CodeGraph queries**
- None (CodeGraph was unavailable in this container).

**Next steps**
- Coordinator: run `pnpm test:coverage` on the Windows machine for acceptance 3, then review.

---

## REVIEW · 2026-10-19T16:55:00Z · claude-opus-5-5 (coordinator) · waiting for the Windows check

**verify_cmd rerun** (Linux container): `pnpm test:coverage` passes every threshold (443 files, 5189 tests passed, 509 skipped). `format:check` and `lint --quiet` pass.

**Worker tier**: medium (Sonnet), matches.

**Acceptance**
- [x] 1: `shaLine` accepts `<hash>  <file>` and `<hash> *<file>`. A new test puts a `sha256sum` that prints the star form on PATH. It proves the star form is recorded and compares equal ("unchanged", no Docker call). No assertion was removed. The script is unchanged: it compares only lines that its own `sha256sum` printed.
- [x] 2: `deploy-host.test.ts` runs with 30 s per test (`vi.setConfig`). The file-database suites (`db-migrate`, `db-copy`, `copy-database.flow`, `factory` SQLite Client) run with `{ timeout: 30_000 }`. The `vitest.config.ts` default is unchanged. The Lavalink `slow` case uses `LAVALINK_READY_TIMEOUT=60`. The worker changed `db-copy.test.ts` and `copy-database.flow.test.ts` without adding them to `context.files`. The coordinator added them.
- [ ] 3: still open. CI passes in this container's equivalent run. The run on the maintainer's Windows machine has not happened yet.

**Outcome**: stays in REVIEW until the maintainer runs `pnpm test:coverage` on the Windows machine. If it passes there: DONE. If it fails: REWORK with the failing test names.
