# CHORE-2003 · Dashboard /health SCHEMA_INCOMPATIBLE Label

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-10T20:59:20Z · claude-opus-5-5 (coordinator)

**From BUG-0042's review**: a downgrade-guard refusal reports `MIGRATION_PENDING` with an empty list. Add a `reason` to `SchemaNotReadyError` and map it in `webProbe`.

---

## PROGRESS · 2026-10-19T15:55:00Z · claude-small (claude-haiku-5-5) · REVIEW

**Files changed**
- `apps/web/src/lib/server/schema-guard.ts`: adds `SchemaNotReadyReason = 'pending' | 'incompatible'` and a `reason` constructor parameter on `SchemaNotReadyError` (third, default `'pending'`). The downgrade guard throws with `[]` and `'incompatible'`. The pending path passes `'pending'` explicitly.
- `apps/web/src/lib/server/health.ts`: `webProbe` keeps the caught error and maps its reason through `schemaDatabaseStatus`. `incompatible` gives `{ status: 'SCHEMA_INCOMPATIBLE' }` with no `pending` key. `pending` keeps `MIGRATION_PENDING` with the ids. Both are alive for `/health` (200) and not ready for `/ready` (503). The logging rules are unchanged.
- `apps/web/src/lib/server/schema-guard.test.ts`: asserts `reason` for the pending case and for the contract (downgrade-guard) case, and keeps the existing message assertions.
- `apps/web/src/lib/server/health.test.ts`: new case for the downgrade-guard reason. `/health` 200 with `database` equal to `{ status: 'SCHEMA_INCOMPATIBLE' }`; `/ready` 503 with `{"ready":false}`; the liveness poll does not log and readiness logs once.

No file outside `context.files` changed. `apps/web/src/app/api/health/route.test.ts` still constructs `SchemaNotReadyError` positionally and gets the default reason, so it did not need editing.

**Verification**
- `pnpm vitest run apps/web/src/lib/server apps/web/src/app/api/health`: 29 files, 237 tests pass.
- `pnpm format:check`: pass.
- `pnpm lint --quiet`: pass.
- `pnpm --filter ./apps/web run typecheck`: pass (not in `verify_cmd`; run because the constructor signature changed).
- No commit, no push, no branch (workers never commit).

**Acceptance**
- [x] `SchemaNotReadyError` carries a reason (`pending` or `incompatible`). `/health` reports `MIGRATION_PENDING` with the pending ids, and `SCHEMA_INCOMPATIBLE` for the downgrade-guard case. Both stay 200 for `/health` and 503 for `/ready` (`health.ts`, `health.test.ts`).
- [x] Tests cover both reasons (`schema-guard.test.ts` for the throw sites, `health.test.ts` for the probe outputs).

**Decisions & gotchas**
- The reason is a third constructor parameter with default `'pending'`, not a required one. A required reason would have forced an edit to `route.test.ts`, which is outside `context.files`. Both production throw sites pass the reason explicitly.
- The `SCHEMA_INCOMPATIBLE` body carries no migration ids. The acceptance asks for the label only, and the public body must not carry error text (the comment in `health.ts`).
- CodeGraph was unavailable in this container, as the coordinator noted: `.codegraph/` holds only a `.gitignore` with no index, `codegraph` is not on PATH, and the `codegraph` MCP server failed to connect. Work started from `context.files` with ranged Reads. A repo-wide Grep for `SchemaNotReadyError|MIGRATION_PENDING|SCHEMA_INCOMPATIBLE` found the consumers listed above.
- The uncommitted edits already in the checkout (`board.json` BUG-0040 status, `lrclib` files, `docs/music.md`, `BUG-0045.md`) are not from this ticket and were not touched.

**New CodeGraph queries**
- None. CodeGraph was unavailable.

**Next steps**
- Coordinator: review the diff, rerun `verify_cmd`, check the acceptance items, and write the REVIEW entry.
- Docs still describe only `MIGRATION_PENDING`: `docs/deployment.md` (around line 380) and `docs/database.md` (line 30). Both are outside `context.files`. A sentence on `SCHEMA_INCOMPATIBLE` would help operators. Not changed here; the coordinator can add it to this ticket or to a docs ticket.

---

## REVIEW · 2026-10-19T16:10:00Z · claude-opus-5-5 (coordinator) · REWORK

**verify_cmd rerun**: passes (28 files, 234 tests in `apps/web/src/lib/server`, `format:check`, `lint --quiet`). Full `pnpm build` and `pnpm typecheck` also pass.

**Worker tier**: small (Haiku), matches.

**Acceptance**
- [x] 1: `SchemaNotReadyError.reason` (`pending` | `incompatible`). `assertSchemaCurrent` passes `incompatible` for the downgrade guard. `webProbe` reports `SCHEMA_INCOMPATIBLE` (no ids) or `MIGRATION_PENDING` with ids, 200 on `/health` and 503 on `/ready`.
- [x] 2: tests cover both reasons.

**Issue**: the worker found that the user docs still describe only `MIGRATION_PENDING`. Operators read `/health` from those pages, so the new status must be there too. A third acceptance item is added, and `docs/deployment.md` and `docs/database.md` are added to `context.files`:
- `docs/deployment.md` line 380: after the pending-migrations sentence, add one short paragraph: when a newer release recorded contract migrations this dashboard does not know, `/health` stays `200` with `database: { status: "SCHEMA_INCOMPATIBLE" }`, `/ready` answers `503`, and the fix is to deploy the matching release or restore the pre-deploy dump.
- `docs/database.md` line 30: add one bullet after the `MIGRATION_PENDING` bullet that says the same in one sentence.
- Keep the style of these pages: simple English, short sentences. No code change.

**Outcome**: REWORK. Back to TODO.

---

## PROGRESS · 2026-10-19T15:57:01Z · claude-small (claude-haiku-5-5) · REVIEW

**Rework pass.** The code part from the first pass is unchanged and was accepted in the REVIEW · REWORK entry above. This pass does the docs item only.

**Files changed**
- `docs/deployment.md` (section 6, after the pending-migrations paragraph, around line 382): one paragraph. A newer release with contract migrations this dashboard does not know gives `/health` `200` with `database: { status: "SCHEMA_INCOMPATIBLE" }`. `/ready` answers `503`. The fix is to deploy the matching release or restore the pre-deploy dump.
- `docs/database.md` (the dashboard bullets, line 31): one bullet after the `MIGRATION_PENDING` bullet, in one sentence, with the same status, codes and fix.

Both files are in `context.files`. No other file changed in this pass.

**Verification**
- `verify_cmd` (`pnpm vitest run apps/web/src/lib/server && pnpm format:check && pnpm lint --quiet`): pass. 28 files, 234 tests. Prettier and ESLint clean.
- No commit, no push, no branch (workers never commit).

**Acceptance**
- [x] 1: `SchemaNotReadyError.reason` (`pending` | `incompatible`). `/health` reports `MIGRATION_PENDING` with ids or `SCHEMA_INCOMPATIBLE`; both 200 on `/health`, 503 on `/ready` (`health.ts`, `health.test.ts`). Code from the first pass, re-verified by the test run.
- [x] 2: tests cover both reasons (`schema-guard.test.ts`, `health.test.ts`).
- [x] 3: `docs/deployment.md` section 6 and `docs/database.md` dashboard bullets describe `SCHEMA_INCOMPATIBLE`: `/health` 200, `/ready` 503, fix is the matching release or the pre-deploy dump.

**Decisions & gotchas**
- The `database.md` bullet names the endpoint `/api/health` and `/api/ready`, as the neighbouring bullets do. The `deployment.md` paragraph uses `/health` and `/ready`, as that section does.
- The docs state the status and codes only. The public body carries no migration ids, as in the code.

**New CodeGraph queries**
- None. CodeGraph was unavailable in this container.

**Open flags**
- None target this ticket (`HANDOVERS.md` has no CHORE-2003 row).

---

## REVIEW · 2026-10-19T16:25:00Z · claude-opus-5-5 (coordinator) · DONE

**verify_cmd rerun**: passes (28 files, 234 tests, `format:check`, `lint --quiet`).

**Worker tier**: small (Haiku), matches, both passes.

**Acceptance**
- [x] 1 and 2: unchanged since the first review (code and tests).
- [x] 3: `docs/deployment.md` section 6 has a paragraph on `SCHEMA_INCOMPATIBLE` (200, 503, matching release or pre-deploy dump). `docs/database.md` has the matching bullet.

**Outcome**: DONE.
