# RIR-802 / A-009 — migration documentation return

Agent developer-docs; branch feat/RIR-800-documentation-depth, starting HEAD c9ab6a6; sole active eight-point ticket RIR-802 under RIR-800. Integration 801103c0e4c70eca6a380d7d1122b11234695bb1; immediate parent PR #557 a04753a473c8a807892848052cc248cff3695805. Owned only docs/migrations.md and docs/migration-1.x-to-2.0.md. Files settled, unstaged; no source/board/Git mutation.

Read fresh protocol/state/handoffs, blueprint, migration/database guidance, current source and full Gemini counterparts pinned1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33. Compared actual fixed migration SQL, SQLite/PostgreSQL connection and history guards, CLI, test coverage, legacy schema/manifests and giveaway behavior.

Schema migration guide now specifies exact available commands, version1/checksum authority, three installed records, narrow catalog/status limits, lazy SQLite/no-WAL behavior, PostgreSQL advisory lock/timeouts, transaction versus filesystem crash windows and future versioned-runner acceptance. Correctly distinguishes settings concurrency tests from migration-concurrency/crash tests. No fictitious importer or rollback command.

Legacy runbook preserves all17table/108column source mapping and extends dependency/activation checks, lossless typed canonical rows, protected provenance/quarantine, anomaly classifications, snapshot/transform/target identity, fenced resumable batch transactions, external vault ambiguity, synthetic per-user/global ledger conservation, giveaway capture/eligibility/notification limits and concrete freeze/capture/verify/activate/restore gates. Snapshot metadata is not production evidence; no silent duplicate resolution or rollback-after-new-writes promise.

Worker checks:16 local references valid; all17 table/108-column mappings still match immutable data manifest; boardrev73 WIP1/1; requirements91/35; scoped diff check. No suite rerun, live credentials, source DB writes or cutover. Coordinator reviewed exact migration guide and runbook additions including synthetic2000coin conservation, secret transfer boundary and schema-fingerprint caveat. A-008 database naming still to reconcile before closure.

Accept after persisting return. Full importer/verifier, representative DB/giveaway snapshot, populated upgrade/crash tests and measured restore remain future implementation/release gates. Next: accept remaining RIR-802 assignments, complete seven-file check, local commit, then only RIR-803. Keep single epic and final PR checkpoint.
