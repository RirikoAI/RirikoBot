# Handover Notes: STORY-124 Postgres Integration Job: Dual-Dialect Repositories, Trade/Market Concurrency & AI Provider Fallback Wiring

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-02T05:25:08Z · Claude Code (Opus 5.5)

**Approach**
- The story grows from 5 to 8 points and now requires TASK-1223, which provides `PG_SCHEMA_DDL`.
- **TASK-1241 (3)**:
  - Add a shared `describeDialects` helper in `tests/support/database.ts`.
    - SQLite uses `:memory:` with `SQLITE_SCHEMA_DDL`.
    - Postgres uses a random schema built from `PG_SCHEMA_DDL`, and is skipped without `TEST_POSTGRES_URL`.
  - Convert the main repository suites to use it.
  - Add a CircleCI `test-postgres` job that uses `cimg/postgres:16` as a secondary container.
- **TASK-1242 (3)**: grooming found a real race. Fix it and test it.
  - `TradeService.acceptTrade` (`trade-service.ts:178`) checks status before `withTransaction` and never re-checks it inside the transaction. `MarketService.buyListing` (`market-service.ts:126`) has the same pattern.
  - The fix is a conditional status update inside the transaction (`WHERE status = PENDING/ACTIVE`). The transaction aborts when no row changed.
- **TASK-1243 (2, new)**: drive the AI chat path through `createBotServices` with fake keys. Gemini throws `AiRateLimitError`, and the test asserts that OpenAI answers. Today only `FallbackChainManager` unit tests exist.

**Relevant code**
- Repository tests each build their own `:memory:` client. They either hand-write the DDL (`trade-market.repository.test.ts:13-20`) or execute `SQLITE_SCHEMA_DDL`. No shared helper exists.
- `packages/database/src/transactions/index.ts:53` `withTransaction`:
  - On SQLite it uses a mutex and `BEGIN IMMEDIATE`.
  - On Postgres it uses a Drizzle transaction.
  - `economy.repository.ts:213-223` locks balances `FOR UPDATE`.
- `apps/bot/src/services.ts:665-698` wires the AI providers: Gemini if its key is set, OpenAI if its key is set, Ollama always.
- `packages/ai/src/fallback/fallback-chain-manager.ts:127` `recordFailure` puts a provider in cooldown on a 429.
- `.circleci/config.yml`: a single `ci` workflow, no services and no contexts.

**Pitfalls**
- `vitest.setup.ts` blocks the network. The Postgres client needs an allowance for the `TEST_POSTGRES_URL` host, or the setup must allow localhost.
- Postgres schema isolation: connect with `?options=-c search_path=<schema>`, as the adventure test does.

**Out of scope**
- Raising coverage thresholds (STORY-125).

---

## FLAG · 2026-10-02T09:21:18Z · from TASK-1223 · Claude Code (Opus 5.5)

**Finding**: `packages/services/src/adventure/__tests__/postgres.integration.test.ts` already fails on real Postgres 16 in one test, "grants completion XP atomically across pools alongside tower XP": `value too long for type character varying(32)`.
- The unchanged test from `develop/2.0.0` fails the same way, so this is not caused by TASK-1223.
- It was never noticed because the suite only runs with `ADVENTURE_TEST_POSTGRES_URL`.
- The other 4 tests in that file pass.
- The cause is probably an id longer than 32 characters (a test user or guild id, or a derived id) written to a `varchar(32)` column in the Postgres schema. SQLite does not enforce the length.

**Impact on this ticket**:
- TASK-1241 runs this suite in CI, so it must fix this first.
- If the id comes from production code rather than the test, it is a real Postgres bug: fix the code or widen the column.

**Local Postgres**: `docker run -d --rm --name ririko-pg-test -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16-alpine`, then set `TEST_POSTGRES_URL=postgres://postgres:test@127.0.0.1:55432/postgres`. Loopback is allowed by `vitest.setup.ts`.

---

## PROGRESS · 2026-10-02T12:52:37Z · Claude Code (Opus 5.5) · REVIEW

**Files changed**
- TASK-1241, TASK-1242 and TASK-1243 are DONE. Their notes list the files.
- Story gate fix: `packages/database/src/migrations/postgres-schema.test.ts` gets a 60 s timeout. `ensurePostgresSchema` takes a database-wide advisory lock, so in a full `pnpm test:postgres` run it waits for every other suite building its schema, and the default 5 s timed out.

**Verification**
- On `feat/STORY-124-postgres-integration`, not committed:
  - Story verify_cmd passes: `pnpm typecheck`; `pnpm vitest run packages/database/src packages/services/src/waifu-tcg apps/bot/src` (120 files, 1003 passed, 51 Postgres variants skipped); `pnpm lint --quiet`.
  - `pnpm build` and `pnpm format:check` pass.
  - `pnpm test:coverage` passes: 2683 tests, 56 skipped. Lines 70.58%, statements 69.23%, branches 59.01%, functions 71.59%.
  - `pnpm test:postgres` against local `postgres:16-alpine`: 143 files, 1380 passed, 1 skipped. Every test schema is dropped afterwards.
- Not run: the CircleCI `test-postgres` job itself. Its first run is on the PR.

**Decisions & gotchas**
- The TASK-1223 FLAG was a production bug: adventure XP could not settle on Postgres (`xp_events.source` overflow). Fixed in TASK-1241.
- TASK-1242 also claims rows in reject, cancel and expiry, which had the same race.
- Open question for the user: the shared row types are inferred from the SQLite schema (`number`) while Postgres returns `bigint` for balances and XP. Worth a BUG ticket.

---

## REVIEW · 2026-10-02T15:41:07Z · Claude Code (Opus 5.5) · DONE

**Checks**
- Re-ran the story verify_cmd on `develop/2.0.0` after PR #677 merged: `pnpm typecheck`, `pnpm vitest run packages/database/src packages/services/src/waifu-tcg apps/bot/src` (120 files, 1005 passed, 53 Postgres variants skipped), `pnpm lint --quiet`. All pass.
- PR #677 CI is green, including the first run of `ci/circleci: test-postgres`, which the REVIEW entry listed as not yet run.

**Acceptance**
- TASK-1241: `.circleci/config.yml` has a `test-postgres` job in the `ci` workflow. The repository suites run through `describeDialects`.
- TASK-1242: `TradeService.claimPending` and `MarketService.claimActive` move the row with `transitionStatus` inside the transaction. The concurrency tests pass on Postgres in CI.
- TASK-1243: `apps/bot/src/controllers/ai-provider-fallback.test.ts` drives the fallback through `createBotServices`.
- The TASK-1223 FLAG (`varchar(32)` overflow) was a production bug in `xp_events.source`, fixed in TASK-1241. The flag is closed.

**Follow-up**
- The question about row types is still open. The shared row types come from the SQLite schema (`number`), but Postgres returns `bigint` for balances and XP. Suggest a BUG ticket. It is not filed yet and waits for the user.
