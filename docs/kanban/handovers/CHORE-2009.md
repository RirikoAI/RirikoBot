# CHORE-2009 · Lavalink "Never Ready" Deploy Test Polls Only Once Under Load

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-21T14:00:00Z · claude-opus-5-5 (coordinator)

**Seen**: the full `pnpm test:coverage` run for TASK-1971 (2026-10-21) failed `scripts/deploy-host.test.ts:3164`, `expect(never.version.length).toBeGreaterThan(1)`, with a length of 1.

**Cause**: the `never` case (`:3158-3165`) uses the scenario's default conf, `LAVALINK_READY_TIMEOUT=1` (`:2931`). `wait_lavalink` (`deploy/host/bin/ririko-deploy.sh:529-541`) sets `deadline=$((SECONDS + LAVALINK_READY_TIMEOUT))`. `$SECONDS` counts whole seconds, so the first check can already be at the deadline when the machine is loaded. CHORE-2002 raised only the `slow` case to 60.

**Approach**: in the `never` case, add the line `conf 'LAVALINK_READY_TIMEOUT=5'` before `run deploy 2.1.3 staging`, the same way the `slow` case does. With `READY_POLL_SECONDS=0.1` it polls for about 5 s, so the case takes about 4 s longer. Add a one-line comment why. Keep every assertion.

**Out of scope**: the script, and any other test.

---

## PROGRESS · 2026-10-21T12:26:50Z · claude-small (claude-haiku-5-5) · REVIEW

**Files changed**
- `scripts/deploy-host.test.ts` (lines 3160-3164): the `never` case of "keeps polling /version until it answers 200 and fails when it never does" now sets `conf 'LAVALINK_READY_TIMEOUT=5'` before its deploy, with a one-line comment on why. The `slow` case pattern was followed. No assertion changed.

**Verification**
- `pnpm vitest run scripts/deploy-host.test.ts --testTimeout=120000 && pnpm format:check && pnpm lint --quiet`: pass. Test file: 1 passed. Tests: 312 passed, 1 skipped (313). Format check clean. Lint clean.
- Not committed. Workers never commit. Other tickets' uncommitted changes in the working tree were left alone.

**Decisions & gotchas**
- The load flake was not reproduced in this run. The change is verified by the suite passing, not by a reproduction of the flake.
- The `never` case now waits about 5 s at `READY_POLL_SECONDS=0.1`. The whole file took about 46 s in this container.

**New CodeGraph queries**
- None. CodeGraph was unavailable in this container. Ranged reads were used at the line numbers from grooming.

**Next steps**
- Coordinator: rerun `verify_cmd`, check the two acceptance items against the diff, and write the `REVIEW · … · DONE` entry.

---

## REVIEW · 2026-10-21T14:20:00Z · claude-opus-5-5 (coordinator) · DONE

**verify_cmd rerun**: passes (312 passed, 1 skipped; `format:check`, `lint --quiet`).

**Worker tier**: small (Haiku), matches.

**Acceptance**
- [x] 1: the `never` case sets `conf 'LAVALINK_READY_TIMEOUT=5'` before its deploy and has a one-line comment. Every assertion is unchanged.
- [x] 2: `scripts/deploy-host.test.ts` passes.

**Outcome**: DONE.
