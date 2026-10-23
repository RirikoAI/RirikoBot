# Handover Notes: CHORE-2012 Ririko Rules from the 2026-10-22 Retrospective

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-23T15:52:42Z · claude-opus-5-5 (coordinator)

**Approach**
- Add the rules to AGENTS.md: the command checklist in section 8.3, and the coverage rule next to rule 5.8.
- Add root script `"test:file-coverage"`: a small `scripts/file-coverage.ts` that runs `vitest run --coverage --coverage.include=<each file>` with the thresholds from vitest.config.ts. Explain it in docs/testing.md.

**Facts checked**: the default prefix is `!` (`DEFAULT_COMMAND_PREFIX`). The maintainer's `.env` sets `$`. The STORY-202 grooming got this wrong, which is the reason for the "check constants" rule.
