# Handover Notes: CHORE-2011 Version 2.1.0 in Every Workspace package.json

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-22T14:45:00Z · claude-opus-5-5 (coordinator)

**Why**: the maintainer asked on 2026-10-22 to release v2.1.0. Since v2.0.2, `develop` has gained support tickets (STORY-198), server event logs (STORY-199, BUG-0052), level role rewards (STORY-200), the starboard (STORY-201) and the setup commands (STORY-202), with additive migrations `0006` to `0009`. These are new features, so this is a minor release.

**Approach**: the same files as CHORE-2010, with `2.0.2` replaced by `2.1.0`:
- the ten workspace `package.json` files;
- `CORE_VERSION` in `packages/core/src/index.ts`;
- `BOT_VERSION` in `website/src/components/DiscordDemo/reply.ts`;
- the five tests that assert the version.

**Pitfalls**: a search for `2.0.2` also matches strings that are not the version, such as an address like `10.0.2.2`, test fixtures and the read-only `.local/` folder. Change only the files listed in `context.files`. apps/starter keeps its own version.

**Order after merge**: the version PR goes into `develop`. Then a release PR merges `develop` into `master` with a merge commit, `v2.1.0` is tagged on `master`, the CircleCI `release` workflow pushes the images, the GitHub release is published, and `latest` moves (docs/release.md sections 4 and 6). Production stays paused, so `approve-production` stays unclicked.

## PROGRESS · 2026-10-22T14:54:17Z · claude-small (claude-haiku-5-5) · REVIEW

**Files changed** (17, each one `2.0.2` replaced by `2.1.0`, one line per file)
- `package.json`, `apps/bot/package.json`, `apps/cli/package.json`, `apps/web/package.json`, `packages/ai/package.json`, `packages/core/package.json`, `packages/database/package.json`, `packages/discord/package.json`, `packages/music/package.json`, `website/package.json`: `"version"` field.
- `packages/core/src/index.ts`: `CORE_VERSION`.
- `website/src/components/DiscordDemo/reply.ts`: `BOT_VERSION`.
- `apps/bot/src/index.test.ts`, `apps/cli/src/program.test.ts`, `apps/web/src/app/api/health/route.test.ts`, `packages/core/src/index.test.ts`, `scripts/website-demo-reply.test.ts`: version assertions expect `2.1.0`.
- `scripts/website-demo-reply.test.ts` assertion string is `` `v2.1.0` `` to match the bot version line.

**Verification**
- `grep -n "2\.0\.2"` over the 17 files returns nothing.
- `verify_cmd` (`pnpm build && pnpm typecheck && pnpm vitest run <5 test files> && pnpm format:check`) exits 0. Build, typecheck (11 projects plus `tsc -p tests`), the five test files and `format:check` all pass.
- `git status`: only the 17 files, plus the board files and this handover. `pnpm-lock.yaml` is unchanged. `website/src/data/commands.json` regenerated during typecheck with identical content, so it does not show as modified.
- Not touched: `apps/starter`, `packages/music-private`, and the `10.0.2.2`-style strings (none were in the listed files).

**Acceptance**
- [x] Ten `package.json` versions and the root are `2.1.0`. `apps/starter` keeps its own version.
- [x] `CORE_VERSION` and `BOT_VERSION` are `2.1.0`. The five version tests expect `2.1.0`.
- [x] No other line changed.

**Decisions & gotchas**
- `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` show as uncommitted `next dev` output. Not touched; they are outside `context.files`.
- The ticket asks for `pnpm build`. It ran `tsc -b` and passed.

**New CodeGraph queries**
- None beyond `context.codegraph_queries`.

**Next steps**
- Coordinator reviews the diff, reruns `verify_cmd`, and writes the REVIEW entry. Commit and PR wait for the user's confirmation.

---

## REVIEW · 2026-10-22T15:00:00Z · claude-opus-5-5 (coordinator) · DONE

**verify_cmd rerun**
- `pnpm build`, `pnpm typecheck` (no errors), the five version tests (47 tests) and `pnpm format:check` pass.

**Acceptance**
- [x] The ten `package.json` files read `2.1.0`. apps/starter is untouched.
- [x] `CORE_VERSION`, `BOT_VERSION` and the five version tests read `2.1.0`.
- [x] The diff is exactly 17 files with one line each. `pnpm-lock.yaml` is unchanged.

**Worker tier**
- `claude-small` (Haiku) matches the `small` tier.
