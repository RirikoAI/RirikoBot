# Handover Notes: STORY-178 CircleCI Deploy Pipeline: Automatic Staging, Approved Production

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-04T18:50:17Z · Claude Code (Opus 5.5)

**Approach**
- TASK-1781: the host side (`ririko-deploy-ssh` forced command and `ririko-deploy`).
- TASK-1782: the CircleCI side (deploy job, approval, contexts) and `docs/release.md`.

**Relevant code**
- `.circleci/config.yml`: the `release` job and workflow, tag filter `/^v\d+\.\d+\.\d+(-.+)?$/`.
- `scripts/release-tags.ts:14` `RELEASE_TAG_PATTERN`.
- `apps/bot/src/health.ts:41` `probe`: `/ready` is 200 only after startup and Discord gateway READY.
- `apps/web/src/lib/server/health.ts:18` `webProbe`: `/api/ready` is 200 when the database answers.

**Pitfalls**
- The release job already pushes `X.Y` and `X` before production is approved. That is the existing release design for self-hosters and stays as it is; the host always deploys the exact version.
