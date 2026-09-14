# Testing and validation evidence

## Commands

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

Vitest projects separate unit (`*.test.ts`), integration (`*.integration.test.ts`) and end-to-end (`tests/*.e2e.test.ts`) runs. Unit excludes integration/E2E. No pass-with-no-tests switch is enabled. Production TypeScript builds exclude test code; a separate strict check covers tests and implementation together. ESLint enforces awaited/supervised promises, typed boundaries and no explicit any.

## Verified 2026-09-14

The six commands above passed through pinned **pnpm 10.34.5**, using Node **24.13.1**, TypeScript **6.0.3**, and Vitest **4.1.10** on Windows. The desktop's fallback pnpm is a different major version, so validation invoked the pinned pnpm through npm exec; no global package-manager configuration was changed.

| Check | Result and actual scope |
|---|---|
| Lint | Pass across apps, packages and tests |
| Strict typecheck | Pass including tests and production code |
| Unit | 48 passed across 7 test files |
| SQLite integration | 12 passed, including actual restart persistence, concurrent settings writes, audit rollback, checksums and legacy refusal |
| PostgreSQL integration | 7 passed separately against a real temporary PostgreSQL 18.6 server |
| CLI E2E | 1 passed: subprocess migration, persisted configuration across processes, doctor/health/metadata and refusal paths |
| Production build | Pass for all project references; compiled CLI version command also ran successfully |
| Compose configuration | Validated; this does not build or run containers |
| Legacy immutability | Pinned checkout git status remains clean |

**68 distinct tests passed across these runs.** The standard integration invocation skips its seven PostgreSQL cases when TEST_POSTGRES_URL is absent; they were run with a real server in the separate validation above, not counted as passing merely because they skipped.

The temporary PostgreSQL server bound only 127.0.0.1, used an isolated test cluster and per-test schemas, and was stopped in a finally block. No server process, postmaster PID or temporary password file remained. Test-only native binaries came from the Zonky PostgreSQL 18.6.0 Windows artifact; SHA-256 matched its published checksum `b7ef2d03588e0439f0d0a2250f43905f7464f1e96ace47703ceaf79094198150`. No production dependency or Windows service was added. Local ignored evidence is in `.tmp/pg-validation-2zqoqL/` and `.tools/postgres-validation-18.6.0/provenance.json`; CI uses its PostgreSQL service instead.

## Failure modes covered

- Slash/prefix/context equivalence, alias collision, escaped/quoted parsing, argument validation and concurrent request isolation.
- Owner/member/bot/role/module/channel restrictions; uncached Discord channels are fetched and unavailable channels fail closed.
- Private administrative deferral, requester-bound help menus and category selection without a search query, safe mention handling and error redaction.
- Settings cache expiry/defensive copies, no default fallback on database errors, optimistic conflicts and atomic settings/audit writes.
- Generator traversal, all symlink/junction ancestor positions, existing-file preservation and both generated command syntaxes.
- Liveness versus readiness, shutdown status, bounded stuck database probes and response limits.

## Remaining evidence

No live Discord bot login/registration, real external provider calls, audio playback, dashboard OAuth/browser E2E, Docker image execution or representative 1.4.0 data migration has been performed. The Docker daemon was unavailable. No credentials or representative database/giveaway data were supplied. Those are release gates, not failures hidden by offline mocks. Browser Playwright tests belong to the future dashboard phase; current CLI E2E is not presented as a browser suite.

The static legacy audit replayed 12 migration SQL sequences on a fresh in-memory SQLite database and checked schema integrity. That verifies source DDL only, not TypeORM execution or migration of production rows.

## Adding tests

Inject clocks and random sources, use deterministic expected outcomes, and test observable behavior/failure boundaries. Real PostgreSQL tests require TEST_POSTGRES_URL for a disposable database where the test role may create/drop its isolated schemas. Never point tests at production data. Add persistent service tests for restart/retry/races before exposing durable commands. Add live smoke checks as explicit opt-in jobs with test credentials; mocks never certify a provider's actual terms or availability.
