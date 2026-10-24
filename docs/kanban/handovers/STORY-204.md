# Handover Notes: STORY-204 Scripted Releases: Plan Mode, One Merge Stop, Assisted Tag and Images

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-23T15:52:42Z · claude-opus-5-5 (coordinator)

**Design**
- `scripts/release/` holds the TypeScript scripts, run with tsx from root `package.json` scripts. `scripts/release-tags.ts` is the model for code and tests (pure functions plus a thin CLI).
- **Flow:** `/release` skill → plan mode (`release:notes` draft, version proposal) → approval → `release:prepare` (bump on develop, one PR) → maintainer merges → `release:publish` (tag, wait for images, GitHub release, `latest`, staging status).
- **Why this order:** on 2026-10-21 the GitHub release went out before the images, and `npx ririko --docker` failed for about 20 minutes. Publish waits for the images.
- The CircleCI `release` workflow is unchanged: it builds and pushes the images and deploys staging for a `v*` tag.

**Facts checked in the code**
- The version lives in the 17 files of CHORE-2011's context.files.
- Docker Hub repositories: `ririkoai/ririkobot` and `ririkoai/ririkobot-dashboard`, tags x.y.z, x.y and x (`scripts/release-tags.ts`).
- In Git Bash `docker` fails with "/c/Program: No such file", so spawn docker without a shell.

**Out of scope:** production deploy approval (stays the maintainer's), and the npm `ririko` starter release (`npm-v*` tags).

---

## REVIEW · 2026-10-23T16:38:28Z · claude-opus-5-5 (coordinator) · DONE

**Acceptance**
- [x] TASK-2041 to TASK-2044 are DONE.

**verify_cmd**: `pnpm vitest run scripts/release scripts/hooks` passes (142 tests). typecheck, lint and format:check passed at the TASK-2043 review, and format:check and docs:build passed at the TASK-2044 review.

**Note**: `scripts/` is outside the tsc projects, so CI does not type-check the release scripts. The workers checked them by hand with strict tsc.
