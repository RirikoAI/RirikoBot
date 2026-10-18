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

---

## GROOMING · 2026-10-18T12:00:00Z · claude-opus-5-5 (coordinator) · execution order

STORY-192 and STORY-194 are DONE (PRs #706 and #712), so every `requires` of STORY-191 is met.

**Facts checked**
- CircleCI has no branch-name filters; its release jobs run on `v*` tags only. Renaming `develop/2.0.0` to `develop` does not change what CI runs.
- Text that names `develop/2.0.0`: AGENTS.md, CONTRIBUTING.md, README.md, `.scrum-kanban.json` (`base_branch`), `website/docusaurus.config.ts` (`EDIT_BRANCH`), `deploy/host/bootstrap.sh` (help text), and several user docs (adapters, architecture, contributing, dashboard, database, deployment, development, music, waifu-tcg, dockerhub). `docs/archive/` and `docs/kanban/` are history and stay as they are.
- Git cannot hold `develop` and `develop/2.0.0` as branches in one clone at the same time. After the rename every clone runs `git fetch --prune` (which drops `origin/develop/2.0.0`) and deletes or renames its local `develop/2.0.0` before it checks out `develop`.

**Order**
1. One prep PR into `develop/2.0.0`: TASK-1913 (Docker Hub and GitHub texts), TASK-1912 (go-live checklist), and the TASK-1911 text changes that name `develop` as the PR base and `master` as the release branch. Its acceptance 3 ("after the rename") is met by landing the text in the same PR the maintainer merges just before the rename, so the docs are correct from the moment `develop` exists. The docs site edit link points at `master`, where the published docs come from.
2. The maintainer merges the prep PR, then renames `develop/2.0.0` to `develop` on GitHub. That retargets open PRs.
3. TASK-1911 merge branch: built from `develop` with `git commit-tree` (tree of `develop`, parents `develop` and `origin/master`). This is the same result as `git merge -s ours --allow-unrelated-histories`, with no checkout. The worker also creates local `1.x` at the old master head, then the PR into `master` is opened. The maintainer pushes `1.x`, merges into `master`, and sets branch protection.
4. Production go-live follows the TASK-1912 checklist (maintainer and coordinator; no workers).
