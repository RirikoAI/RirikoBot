# Contributing and release
Read AGENTS.md, the source inventory, architecture and the matching specialist definition before implementing a domain. New commands/services require contracts, strict types, unit tests, both slash/prefix docs, bounded failure handling and relevant integration tests. Legacy reference directories are read-only.

Use explicit composition, stable pinned dependencies and small reviewed changes. Add an ADR when choosing a meaningful alternative; mark future decisions proposed until verified. Update inventory parity status only with evidence. New schema changes belong in packages/database, cover both dialects, and must be reviewed before application use. Never rewrite an applied migration checksum.

Run lint, typecheck, unit, integration, E2E and build gates. Do not replace external behavior with a placeholder to make tests pass. Record unavailable credentials/data/Docker tests separately.

All workspace packages use version 2.0.0, but release is pending the roadmap gates. 2.0.x is compatible fixes; 2.1.x/2.2.x are additive compatible functionality; 3.x permits breaking interfaces only with a documented migration/compatibility plan. For any release: update versions together, lock dependencies, complete changelog/parity and upgrade notes, test migration plus restore from a representative backup, run CI/container/live smoke gates, tag the reviewed commit, then explicitly publish artifacts. No automated publishing credentials or release job are active at this checkpoint.

