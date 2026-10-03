# Handover Notes: CHORE-0003 DOM Test Environment for Dashboard Client Components

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-03T20:00:00Z · Claude Code (Opus 5.5)

**Source**: FLAG from TASK-1253 (see `STORY-125.md`). Filed to BACKLOG by maintainer decision on 2026-10-03.

`apps/web` has no DOM test environment (no `jsdom`, `happy-dom` or `@testing-library/react`; `vitest.config.ts` uses `environment: 'node'`). TASK-1253 tested client components with `react-dom/server` and a mocked `useActionState`, which cannot exercise click or typing handlers. Low files: `components/passkeys/passkey-manager.tsx` 15.9%, `session-list.tsx` 41.2%, `passkey-check-button.tsx` 35.7%, plus add/remove row handlers in the field editors.

**Scope when groomed**: add `jsdom` and `@testing-library/react` as devDependencies, enable a per-file `// @vitest-environment jsdom` (keep `node` as the default), and write interaction tests for the files above. Needs points, acceptance and codegraph queries before TODO.
