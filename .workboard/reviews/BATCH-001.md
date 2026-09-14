The platform roadmap had no durable ticket execution limits, agent return protocol or delivery checkpoints. This change adds a repository-backed Scrum/Kanban board and guards so every session works on one estimated ticket, preserves findings for the next agent and stops for the user's PR decision at one declared story/epic boundary.

Batch **BATCH-001**, scope **RIR-001** (8-point chore). Head `chore/RIR-001-work-governance` → base `develop/2.0.0-astra` in `RirikoAI/RirikoBot`.

- Adds grouped Fibonacci grooming, lifecycle tracking, parent/child and dependency relationships, explicit pause/terminal abandonment decisions and a 20-ticket starting backlog.
- Adds a typed Node CLI, common-worktree state/locking, versioned handoffs, worker assignment/acceptance and standing rules in root guidance and every specialist definition.
- Adds Git hooks for scope/staging/branch checks and approved exact-HEAD pushes, plus CI verification of PR head/base/repository and file scope. Provides a workflow guide, ticket/handoff templates and recovery instructions.

Validation: 87 unit tests passed (39 governance tests), 13 SQLite integration/CLI E2E tests passed; seven PostgreSQL tests skipped in this run. ESLint, strict typecheck, build and board validation passed. No application behavior changed; the audited legacy checkout remains untouched.

Limitations: local hooks are bypassable; separate clones need coordination and installation. User consent still comes from the actual conversation. GitHub branch-protection/required-check settings are not configured here. No live provider, Docker deployment or PostgreSQL run was added to this tooling change.

Handoff: `.workboard/handoffs/RIR-001/003-completion.md`. Follow-up RIR-004 records historical tracked dependency-launcher cleanup; it remains ungroomed backlog. This prepared description is not evidence that a PR has been created or publication approved.
