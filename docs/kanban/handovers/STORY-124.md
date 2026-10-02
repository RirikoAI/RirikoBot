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
