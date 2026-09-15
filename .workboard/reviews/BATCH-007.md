# RIR-003 — verify production container lifecycle and persistent storage

Local Docker availability previously blocked production-image validation. This delivery records a successful build and nine operational check groups against the merged source, with exact artifact identities and reproducible offline fixtures. No application code changed.

Proposed head chore/RIR-003-container-validation-resume targets develop/2.0.0-astra at c175c629957bacaf6d3992bd913b6f60b7bcec39. The same five-point RIR-003 chore resumes in BATCH-007; the interrupted attempt and repair publication receipts remain preserved.

Validation: non-root/read-only-root execution, native SQLite, exact startup errors, explicit idempotent migration, compiled doctor, prefix/audit persistence across replacement and restart, real healthcheck/readiness transitions with offline Discord instrumentation, two clean SIGTERM exits (266ms/237ms). Task resource cleanup preserved the exact existing container/volume sets. Compose, board, requirements and Git checks passed.

The image uses Node24.19.0 and pnpm10.34.5; its identity and all evidence are in .workboard/handoffs/RIR-003/005-completion.md, 006-results.json and 007-replay.md. Live Discord, PostgreSQL deployment, load and recovery gates remain unverified. The fixture validates compiled lifecycle code without contacting Discord. No full-platform or production-readiness claim.

Publication awaits the user's approval of this concrete repair-validation record and target.
