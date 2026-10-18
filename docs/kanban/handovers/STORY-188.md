# STORY-188 · Docs Cleanup

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-10T20:59:20Z · claude-opus-5-5 (coordinator)

**Principles for every user doc**
1. Write for the reader of the doc, not the builder of the feature.
2. Use numbered steps, one action each, with the exact command and the expected result.
3. Describe 2.0.0 as it is now: no ticket IDs and no prerelease history.
4. Give one path per audience.

**Archive**: TASK-1881 moves BLUEPRINT.md, the ADRs and the plans to `docs/archive`. They stay public, because decision records tell contributors why things are as they are. They are not user docs.

---

## GROOMING · 2026-10-10T21:18:21Z · claude-opus-5-5 (coordinator) · maintainer decisions

**Maintainer decisions (2026-10-11)**
- Everything a user needs to learn (installation, configuration, every command) lives on the docs site, which replaces the GitHub wiki.
- Docs that are not for users stay valuable for future development sessions. Coordinator's call: `docs/archive`, not `.local`. `.local` is git-ignored, so a fresh clone, CI or another contributor would never see them. The archive is public, versioned and excluded from the site.
- Write every user doc in simple English for readers who may not be technical. This is now an acceptance item on TASK-1882 and TASK-1883.

## REVIEW · 2026-10-11T12:35:58Z · claude-opus-5-5 (coordinator) · DONE

TASK-1881 (archive move, merged in PR #699), TASK-1882 (operator docs) and TASK-1883 (feature docs) are DONE. User docs in `docs/` describe the current 2.0.0 behaviour in numbered steps and simple English; design history is in `docs/archive/`. `pnpm format:check`, `pnpm lint --quiet` and `pnpm site:build` pass, and the privacy scans print nothing. STORY-189 (the Docusaurus site) can start.
