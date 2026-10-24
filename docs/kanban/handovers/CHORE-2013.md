# Handover Notes: CHORE-2013 Upgrade Ririko to Scrum-Kanban 0.8.0

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-23T15:52:42Z · claude-opus-5-5 (coordinator)

**Approach**
1. Run the 0.8.0 upgrade (`bin/scrum-kanban.mjs upgrade` as the template README says) from the template release.
2. Review its diff: protocol.md, scripts/kanban, scripts/hooks, AGENTS.md (only the scrum-kanban block may change) and board.json migration.
3. Remove the duplicate `codegraph.cmd prompt-hook` entry from `.claude/settings.json`.

**Pitfalls**
- Never commit `scripts/kanban/board-server.mjs` with a LAN host default.
- `board-dist/` is a build output.
- Ririko's `.claude/settings.json` has the nudge hook from TASK-2044 by then; keep it.
