# Knowledge predating the board

The source audit/foundation was completed before estimates and board tracking were introduced. Do not manufacture points, ticket start times or PR history for that work. Initial tracked Git baseline is `801103c0e4c70eca6a380d7d1122b11234695bb1` on `origin/develop/2.0.0-astra`. The workspace now has Git metadata, superseding the previous roadmap note.

Read docs/architecture-summary.md, docs/legacy-feature-inventory.md and its command manifest, docs/migration-1.x-to-2.0.md and its data manifest, docs/testing.md, docs/implementation-roadmap.md and relevant ADRs. Static audit: 141 command files, 68 reactions, 17 tables/108 columns/11 FKs, 191 assets. Legacy source `.audit/RirikoBot` is immutable at `0d8be25b17e25dfa61812d6e7b5aaf8497687257`; `.local/` is also immutable.

Implemented foundation: core settings/permissions/logging, PostgreSQL+SQLite revision/audit stores, explicit checksummed foundation migration, shared registry/parser/dispatcher, ping/prefix/help, Discord gateway, CLI, diagnostics, CI/Docker definitions. Previous evidence: 68 tests including a separately started/stopped real PostgreSQL18.6 instance, lint/typecheck/build. These are historical results, not fresh verification of subsequent changes. No live Discord/provider/Docker execution or representative legacy-data import was verified. Major product modules and dashboard remain pending.

The desktop fallback pnpm differs from pinned10.34.5. Prefer project pnpm through a correctly configured package manager; direct Node binaries can run existing tests/typecheck if the wrapper tries to reinstall modules. Do not let parallel agents reinstall shared dependencies. No real credentials belong in handoffs.
