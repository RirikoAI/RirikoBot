# STORY-191 · Release 2.0.0 to master and Launch Production

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-10T20:59:53Z · claude-opus-5-5 (coordinator) · BACKLOG

**Status**: BACKLOG until the maintainer confirms the branch plan (TASK-1911). TASK-1912 and TASK-1913 can run before that: they only prepare docs and texts.

**Who does what**
- The maintainer: tags, approvals, Docker Hub, the GitHub settings (default branch, protection, wiki), Cloudflare DNS.
- The coordinator: production host commands over SSH, after the maintainer's go-ahead, following the TASK-1912 checklist and `docs/release.md` 8.8 step 0.

---

## GROOMING · 2026-10-10T21:18:21Z · claude-opus-5-5 (coordinator) · maintainer decisions

**Branches confirmed** (TASK-1911 is now TODO): `1.x` is legacy, `master` is 2.0.0, `develop` is the PR base. The story moves to TODO.

---

## GROOMING · 2026-10-11T15:13:00Z · claude-opus-5-5 (coordinator) · requires STORY-192

The maintainer decided on 2026-10-11 that 2.0.0 ships with the setup wizard. STORY-191 and TASK-1911 now require STORY-192 (`ririko setup`). TASK-1912 and TASK-1913 are not gated. The go-live checklist (TASK-1912) may mention `pnpm installer` once STORY-192 is DONE.
