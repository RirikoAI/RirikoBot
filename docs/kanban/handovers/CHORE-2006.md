# Handover Notes: CHORE-2006 Dependabot Targets develop, Not master

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-18T15:30:00Z · claude-opus-5-5 (coordinator)

**Approach**: add `.github/dependabot.yml` (version 2). `npm` ecosystem for `/` (Dependabot reads pnpm lockfiles) and `github-actions` for `/`; both `target-branch: develop`, weekly. Group minor and patch updates so the PR count stays low.

**Out of scope**: closing the open 1.x Dependabot PRs (#700, #702 to #705); the maintainer closes them.

---

## PROGRESS · 2026-10-18T11:05:00Z · Claude Code (Haiku 5.5) · REVIEW

**Files changed**
- `.github/dependabot.yml` (new): version 2. `npm` ecosystem, directory `/`, `target-branch: develop`, weekly, one group `minor-and-patch` with `patterns: ['*']` and `update-types: [minor, patch]`. `github-actions` ecosystem, directory `/`, `target-branch: develop`, weekly.
- `docs/kanban/board.json` and `docs/kanban/BOARD.md`: CHORE-2006 claimed (IN_PROGRESS), then set to REVIEW.

**Verification**
- `pnpm format:check` (verify_cmd): pass, after one Prettier fix to the file (`"*"` became `'*'`, the repo uses singleQuote).
- Acceptance: the npm and github-actions entries target `develop` with a weekly schedule, and the minor and patch group is present. Checked against the file on disk.
- Git: no commit, no branch changes (workers never commit).

**Decisions & gotchas**
- Only `.github/dependabot.yml` was created. The other uncommitted changes in the tree (other tickets) were not touched.
- The ticket's codegraph query `registerSetupCommand` was run as required. It returned no relevant code for this ticket.
- Dependabot config with `target-branch` applies to new update PRs. Existing 1.x PRs (#700, #702 to #705) stay open for the maintainer.

**New CodeGraph queries**
- None.

**Next steps**
- Coordinator: review the diff against the acceptance items, rerun `pnpm format:check`, write the REVIEW · DONE entry, and remove any HANDOVERS.md rows for this ticket (none added).
- Maintainer: after the change reaches `develop/2.0.0`, check that Dependabot opens its next PRs against `develop`.

## REVIEW · 2026-10-18T18:30:00Z · claude-opus-5-5 (coordinator) · REWORK

**verify_cmd rerun**: `pnpm format:check` passes. Acceptance 1 and 2 are met in config.

**Issue**: the comment on the npm entry says "target develop/2.0.0, the integration branch". The branch is `develop` now (renamed 2026-10-18). Change the comment to name `develop`.

**Outcome**: REWORK. Back to TODO.

---

## PROGRESS · 2026-10-18T11:05:52Z · Claude Code (Haiku 5.5) · REVIEW

**Files changed**
- `.github/dependabot.yml`: the comment on the npm entry now reads "target develop, the integration branch" (was "develop/2.0.0"). Nothing else changed.

**Verification**
- `pnpm format:check` (verify_cmd): pass.
- Git: no commit, no branch changes.

**New CodeGraph queries**
- None.

**Next steps**
- Coordinator: rerun `pnpm format:check`, write the REVIEW · DONE entry, and remove any HANDOVERS.md rows for this ticket (none added).

## REVIEW · 2026-10-18T11:08:18Z · claude-opus-5-5 (coordinator) · DONE

**verify_cmd rerun**: `pnpm format:check` passes. Both entries target `develop` and the comment names `develop`.

**Worker tier**: small (Haiku), matches.

**Outcome**: DONE. The maintainer closes the 1.x Dependabot PRs (#700, #702 to #705) and retargets or closes #715.
