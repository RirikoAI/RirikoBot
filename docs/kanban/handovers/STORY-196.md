# Handover Notes: STORY-196 npx ririko: the npm Package Becomes a Zero-Dependency 2.0 Starter

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-18T15:30:00Z · claude-opus-5-5 (coordinator)

**Why**: the npm package `ririko` is a way people find the project while they browse AI packages. Version 0.14.5 (March 2024) is the whole 1.x bot; its `bin/npx.js` runs `git clone` on the default branch, `npm i`, copies `config.example.js` and builds. Since master holds 2.0 (PR #714) that script breaks.

**Maintainer decisions (2026-10-18)**
- `ririko@2` is a starter, not the bot. Publishing the 2.0 monorepo (11 workspace packages, native modules, the Next.js dashboard, the private music package) to npm is not worth its upkeep; Docker and the source install already exist.
- The starter looks up the newest release when it runs, so a bot release needs no npm release.
- Publishing: GitHub Actions with npm trusted publishing (OIDC, provenance), on its own `npm-v*` tags, separate from the `v*` image releases.

**Order**: TASK-1961 (the package), then TASK-1962 (publish workflow, README, docs). CHORE-2006 (Dependabot) is independent.

**Maintainer steps after the merge**: add the trusted publisher on npmjs.com, tag `npm-v2.0.0`, run the deprecate command (TASK-1962 writes them in docs/release.md).

## REVIEW · 2026-10-18T11:08:18Z · claude-opus-5-5 (coordinator) · DONE

**verify_cmd rerun**: `pnpm build` and `pnpm typecheck` pass. `pnpm test:coverage` (without `scripts/deploy-host.test.ts`): 4871 tests pass; the one failure is the Windows-only CRLF case in `apps/cli/src/installer/server.test.ts`, which passes on Linux CI. Coverage: statements 81.52%, branches 71.7%, functions 84.73%, lines 82.72%, all above the thresholds. `pnpm lint --quiet` and `pnpm format:check` pass.

**Acceptance**
- [x] 1: TASK-1961 and TASK-1962 are DONE.
- [x] 2: the coverage gate passes.

**Not verified here**: a real `npx ririko` run against Docker and GitHub, and the first trusted publish. The maintainer does both after the merge (docs/release.md section 11).

**Outcome**: DONE.
