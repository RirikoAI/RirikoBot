# Handover Notes: CHORE-2010 Version 2.0.2 in Every Workspace package.json

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-21T14:20:00Z · claude-opus-5-5 (coordinator)

**Why**: the release PR #735 (develop into master) carries PRs #731 to #734: the lyrics fallback and EPIC-020 fixes, `/energy` and the daily energy reset (STORY-197, BUG-0050), potions keeping their own reset date with migration `0005` (BUG-0051), and Epic free games store links (BUG-0044). `develop` still says 2.0.1, which is already released and tagged. The maintainer chose a 2.0.2 patch release.

**Approach**: the same 17 files as CHORE-2008, `2.0.1` replaced by `2.0.2`: the ten workspace `package.json` files, `CORE_VERSION` in `packages/core/src/index.ts`, `BOT_VERSION` in `website/src/components/DiscordDemo/reply.ts`, and the five tests that assert the version. apps/starter keeps its own version. The `v2.0.1` examples in `docs/deployment.md` and the `apps/starter` release tests are sample tags, not the app version, and stay.

**Order after merge**: merge PR #735 into master with a merge commit, then the maintainer tags `v2.0.2` and moves `latest` (docs/release.md section 6).

---

## REVIEW · 2026-10-21T14:22:00Z · claude-opus-5-5 (coordinator) · DONE

**Files changed**: the 17 files listed in the ticket, one line each, `2.0.1` to `2.0.2`. `pnpm-lock.yaml` is unchanged (no importer records its own version).

**Verification**: `pnpm build && pnpm typecheck && pnpm vitest run apps/bot/src/index.test.ts apps/cli/src/program.test.ts apps/web/src/app/api/health/route.test.ts packages/core/src/index.test.ts scripts/website-demo-reply.test.ts && pnpm format:check` passes (5 test files, 47 tests).

**Acceptance**: all three items met. The maintainer chose the 2.0.2 bump on 2026-10-21; this one-line mechanical repeat of CHORE-2008 was done in the coordinator session rather than by a dispatched worker.
