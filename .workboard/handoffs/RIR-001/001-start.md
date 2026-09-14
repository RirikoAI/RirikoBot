# RIR-001 — bootstrap handoff

- Coordinator; assignment A-001 is the workflow-engine sub-agent.
- Ticket: RIR-001, chore, 8 Fibonacci points; batch BATCH-001.
- Branch: chore/RIR-001-work-governance.
- Base: develop/2.0.0-astra at 801103c0e4c70eca6a380d7d1122b11234695bb1.
- Initial checkout was clean. Topic branch was created; no commits/pushes/PRs yet for this chore.
- Read AGENTS.md, GEMINI.md, roadmap, contribution/development docs, actual Git refs and specialist files. Current base is an existing Astra branch, separate from develop/2.0.0.

## Decisions
Use a repo-backed JSON board and generated Markdown view, with local CLI validation. One active execution slot (in-progress/blocked/review), group grooming and Fibonacci estimates, parent/requires graph, one delivery scope per batch, explicit user-controlled pause/abandon and PR boundary. Workers assist the same ticket; they do not activate parallel tickets. Preserve earlier knowledge without fabricated retrospective estimates.

## Assignment
A-001 owns tools/workboard/model.ts and model.test.ts only. It implements the pure parser/validator/state machine and tests. Coordinator owns Git guards, storage/CLI, render, documentation, hooks/CI, integration and acceptance. Worker returns are persisted and accepted before any status transition.

## Remaining work
Implement tools and tests; wire all agent entry points; seed/refine board; validate Git ancestry/scope and hooks; prepare PR description and durable completion handoff. Stop at the current chore's PR checkpoint and ask the user before publishing or starting any next scope. No switch/publication approval exists.
