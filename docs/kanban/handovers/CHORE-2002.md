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
