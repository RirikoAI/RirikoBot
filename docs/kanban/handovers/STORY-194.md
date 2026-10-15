# Handover Notes: STORY-194 Complete User Data Erasure Tool for Data Requests

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-12T16:25:21Z · claude-opus-5-5 (coordinator)

**Why**: the maintainer asked (2026-10-13) for a tool that removes all data about one user, to answer erasure requests that are handled by hand until then. Separate from STORY-193 because it does not gate the launch.

**Order**: after STORY-193 (the consent table and the retention work change the tables the tool must cover).
