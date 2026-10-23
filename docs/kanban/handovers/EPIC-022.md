# Handover Notes: EPIC-022 Scripted Board and Assisted Releases

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-23T15:52:42Z · claude-opus-5-5 (coordinator)

**Asked by the maintainer** (2026-10-23), in reply to the 2026-10-22 retrospective:
- Loosen docs/release.md: agents assist with the whole release (tag, images, GitHub release, latest) unless the maintainer asks to release by hand.
- Board: every claim, handover, grooming note and "last modified" goes through scripts that stamp the local machine time, the agent, the role, the model and the tier. The web board sorts and filters by them. Grooming notes can be added, edited and deleted by script; a delete needs a reason. Nobody edits the board by hand.
- A version-bump script, and a release scripted by the coordinator with one merge stop. Every release starts in plan mode with the features, tickets, fixes and draft notes.
- Plan shared files into the first task.
- Adopt all proposed standing rules (stricter and relaxed). Ticket the Lavalink reconnect and the discord.js deprecations.

**Maintainer decisions (2026-10-23)**
- Board tooling is built in the Scrum-Kanban-Template first (STORY-203), released as 0.8.0, then adopted here (CHORE-2013). The template is at 0.7.0 and already has `scripts/kanban/ticket.mjs` (claim, handover, note, review, recover, show) with tier checks; Ririko is still on 0.6.0.
- One merge stop: the release script commits the version bump straight to `develop` (not protected) and opens the develop-to-master PR.
- Plan mode: a `/release` skill plus a prompt hook that points to it.

**Kept as they are:** WIP 1, and the maintainer merges PRs.

**Order:** STORY-204 and CHORE-2012 run here now. STORY-203 runs in a separate session in the template repository. CHORE-2013 waits for 0.8.0. BUG-0053 and CHORE-2014 are standalone and can go any time.
