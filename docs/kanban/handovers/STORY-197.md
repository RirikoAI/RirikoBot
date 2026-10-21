# STORY-197 · Energy at a Glance: the /energy and !energy Command

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-21T12:30:00Z · claude-opus-5-5 (coordinator)

**Asked by the maintainer** (2026-10-21): "we'd need !energy or /energy to check the energy".

Today the only place that shows energy is `/dungeon action:status`, and BUG-0050 fixes that it can show yesterday's value. One task, TASK-1971, adds the command. It runs after BUG-0050, because both change `energy-lifecycle.service.ts`.

The bot has 68 global slash commands (measured with `command-set.test.ts` on 2026-10-21), so one more stays under Discord's limit of 100.

---

## REVIEW · 2026-10-21T14:00:00Z · claude-opus-5-5 (coordinator) · DONE

**verify_cmd rerun**: `pnpm format:check && pnpm lint --quiet` pass.

**Acceptance**
- [x] TASK-1971 is DONE.

**Outcome**: DONE.
