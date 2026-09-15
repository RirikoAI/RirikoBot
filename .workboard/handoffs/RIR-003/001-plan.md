# RIR-003 — operational validation plan

Coordinator, 2026-09-15. User: "alright continue" after the proposed five-point Docker validation. Only this chore is authorized; stop at its concrete PR checkpoint.

Branch chore/RIR-003-container-validation starts at verified integration 7ed2073a1673f7a558e4a4221b6c6c20ccdee0a8, the squash of PR564. Its full tree equals reviewed head1279966. Prior local publication receipt6281b11 remains on fix/RIR-005-integration-reconciliation; shared revision163 and its receipt are carried as administrative records, without inheriting unpublished implementation. No stack is needed.

Read protocol, board, prior publication handoff, BLUEPRINT deployment/quality/observability/doctor and final acceptance, requirement ledger, Dockerfile, compose.yaml, deployment runbook, devops guidance, bot lifecycle/health and CLI. Requirements BP-55, BP-56, BP-57, BP-69, BP-71 and AC-32 remain partial until their full evidence exists.

Five-point estimate retained before execution: image/native build, isolated persistent volume migration/settings verification across container replacement, non-root/read-only-root checks, doctor, failure-path startup and measured SIGTERM shutdown. This is operational validation with versioned evidence under .workboard; existing ticket owns no implementation paths. Do not silently amend ownership or expand into runtime fixes. Record discovered defects for separately groomed follow-up.

Use uniquely named disposable resources, explicit fixture credentials and no external application network. No live Discord token, production database, registration, image push or deployment is authorized. A simulated gateway can exercise compiled startup/health/shutdown but must be clearly distinguished from live Discord acceptance. Preserve real measurements and gaps; no claim that all platform deployment works. Clean up only exact resources created by this run.

Initial Docker Desktop was installed but stopped; start requested through existing executable. Engine readiness still pending. Git working tree contained only administrative board/receipt changes before this plan. No workers assigned.

Next: establish BATCH-005, groom/ready/start RIR-003, verify engine, build exact source artifact and run bounded isolated checks. Persist results or blockers here and retain the execution slot until review/completion.
