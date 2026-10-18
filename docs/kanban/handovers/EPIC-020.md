# EPIC-020 · 2.0.0 on master: Production Launch and the Open-Source Front Door

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-10T20:59:20Z · claude-opus-5-5 (coordinator)

**Goal (maintainer, 2026-10-11)**
- Ship 2.0.0 as the public release on `master`, written from the point of view of an open-source provider. Readers range from a first-time self-hoster to a long-term contributor.
- Docs are deterministic (numbered steps, exact commands) and current. They do not say what changed between rc.2 and rc.3, and they drop context that only mattered while a ticket was being built.
- Archive BLUEPRINT.md, the ADRs and the plans.
- Replace the GitHub wiki with Docusaurus on ririko.ai, reusing the old website (`RirikoAI/RirikoWebsite`, local copy `Z:\Projects\ririko-website`, PHP and Bootstrap).
- Rework the README later: unique, with a feature image, CodeFactor and all-contributors (as on master), plus a simple CONTRIBUTING.
- One privacy and secret audit.
- Free games links are broken: deeper grooming later.

**Facts found during grooming**
- `master` (1.x, 149 commits, tags 1.2.0 to 1.4.0) and `develop/2.0.0` (447 commits) share **no history**. See TASK-1911.
- `ririko.ai` answers Cloudflare 530 (no origin). The old install domain, used by master's README quick start, does not resolve.
- The wiki has 7 pages, all for 1.x: Home, Heroku, Render, music extra config, all commands, build your own image, post-installation settings.
- The tracked tree has no live public IPs. But `board.json`, 8 handover notes, `docs/deployment.md` and the ADR-014 title name the provider, the region and the instance sizes. See TASK-1871.
- master's `.all-contributorsrc` lists 3 contributors.

**Order**: STORY-187 (audit), then STORY-188 (archive, rewrite), STORY-189 (Docusaurus), STORY-190 (README, later) and STORY-191 (master release, production). The chores and bugs can run at any time.

**Out of scope**: new bot features.

---

## GROOMING · 2026-10-11T15:13:00Z · claude-opus-5-5 (coordinator) · STORY-192 added

**Maintainer request (2026-10-11)**: rebuild the 1.x installer (a step-by-step web wizard) in 2.0, keeping its guides, its wizard layout and its predictable steps.

**Added**
- STORY-192 (21 pts): `ririko setup` / `pnpm installer`, a local web wizard that writes `.env` or `.env.production` with live checks. Tasks TASK-1921 to TASK-1926. Details and the 1.x analysis are in `docs/kanban/handovers/STORY-192.md`; the 1.x files are copied, read only, to `.local/installer-1x/`.
- CHORE-2004 (1 pt): the maintainer's new screenshots, wired into the guides after TASK-1924.

**Maintainer decisions**: 2.0.0 does not reach master without the wizard, so STORY-191 and TASK-1911 now require STORY-192. The wizard uses the 2.0 dashboard colors. The terms and privacy step stays, with 2.0 texts drafted in `docs/legal/` (TASK-1923) for the maintainer's approval.

**Order update**: STORY-192 runs before STORY-191. It can run in parallel with STORY-189 and STORY-190 in planning, but the board runs one ticket at a time.
