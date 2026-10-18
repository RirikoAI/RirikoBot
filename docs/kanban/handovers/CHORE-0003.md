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

---

## GROOMING · 2026-10-03T21:00:00Z · Claude Code (Opus 5.5)

Groomed into TODO as part of closing EPIC-012. Estimate stays 3, model medium.

- Add `jsdom` and `@testing-library/react` as root devDependencies. Keep `environment: 'node'` as the default; DOM tests opt in per file with `// @vitest-environment jsdom`.
- Mock server actions and `@simplewebauthn/browser` (or whatever the passkey components import) at the module boundary; click and type through the real component handlers.
- Targets: passkey-manager, passkey-check-button, session-list, and the add/remove row handlers of a field editor.
- Verify with `pnpm test:coverage`; thresholds must not drop.

---

## PROGRESS · 2026-10-03T15:45:00Z · Claude Code (Opus 5.5) · REVIEW

- Root devDependencies: `jsdom`, `@testing-library/react`, `@testing-library/dom` (peer of the React package). `vitest.config.ts` is unchanged: `environment: 'node'` stays the default; DOM tests opt in with `// @vitest-environment jsdom`.
- `apps/web/src/components/account-interactions.test.tsx`: clicks and types through `PasskeyManager` (add, check-and-retry, check failure, recent sign-in link, closed prompt, failed finish, remove with last-passkey warning, cancelled and failed remove), `PasskeyCheckButton` (success and failure) and `SessionList` (single sign-out, sign out everywhere after confirm, cancelled confirm, failed sign-out). Server actions, `next/navigation` and `@simplewebauthn/browser` are mocked at the module boundary.
- `apps/web/src/app/dashboard/[guildId]/moderation/escalation-steps-field.dom.test.tsx`: add step, remove rows down to the empty state, switch to a timeout and edit length/unit/threshold, reset to defaults, all read back from the submitted hidden JSON.
- `docs/testing.md` 3.1 notes the opt-in DOM environment.
- `pnpm test:coverage` passes: 372 files, 3627 tests; statements 79.45, branches 69.09, functions 82.25, lines 80.78 (thresholds 79/68/81/80). `pnpm lint` 0 errors, `pnpm typecheck` clean.

## REVIEW · 2026-10-03T15:47:00Z · Claude Code (Opus 5.5) · DONE

Reran `verify_cmd`. Acceptance checked against the diff: all three items met.
