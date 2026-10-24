# Handover Notes: CHORE-2012 Ririko Rules from the 2026-10-22 Retrospective

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-23T15:52:42Z · claude-opus-5-5 (coordinator)

**Approach**
- Add the rules to AGENTS.md: the command checklist in section 8.3, and the coverage rule next to rule 5.8.
- Add root script `"test:file-coverage"`: a small `scripts/file-coverage.ts` that runs `vitest run --coverage --coverage.include=<each file>` with the thresholds from vitest.config.ts. Explain it in docs/testing.md.

**Facts checked**: the default prefix is `!` (`DEFAULT_COMMAND_PREFIX`). The maintainer's `.env` sets `$`. The STORY-202 grooming got this wrong, which is the reason for the "check constants" rule.

---

## PROGRESS · 2026-10-23T16:50:00Z · claude-medium (claude-sonnet-5-5) · REVIEW

**Files changed**
- `scripts/file-coverage.ts` (new): the `test:file-coverage` script. Checks that each argument exists and is a source file that coverage counts (`packages/*/src` or `apps/*/src`, not a test or `.d.ts`), reads the four thresholds from `vitest.config.ts` (throws if one is missing), then runs `pnpm exec vitest related --run --coverage` with `--coverage.include=<each file>` and the thresholds on the command line. Report goes to `coverage/file-coverage/` so it does not overwrite the `test:coverage` report. Reuses `createRunner` from `scripts/release/run.ts`.
- `scripts/file-coverage.test.ts` (new): 14 tests of the pure functions and `main` with an injected runner (no vitest or pnpm is started).
- `package.json`: root script `"test:file-coverage": "tsx scripts/file-coverage.ts"`.
- `AGENTS.md`: rule 5.10 (a new source file is covered by its own tests, grooming puts `pnpm test:file-coverage` in `verify_cmd`), section 8 items 5 (adding commands: `command-set.ts` and `GUILD_SCOPED`, shared files only in the Story's first Task) and 6 (check facts, with the `!` / `$` prefix example and the source of the default). The "Releases" bullet in section 10 is untouched.
- `docs/testing.md` (section 1 table and section 4.1), `docs/contributing.md` (step 6), `docs/development.md` (check table): explain the script. `docs/development.md` was not in `context.files`; it holds the table of root scripts, so the new script belongs there.

**Verification**
- `verify_cmd` passes: `pnpm test:file-coverage packages/core/src/index.ts` (100%), `pnpm format:check`, `pnpm docs:build`.
- Failure paths checked by hand: `apps/web/src/app/layout.tsx` (no test imports it) exits 1 with the threshold errors; a missing file and no argument exit 1 with a message.
- `scripts/file-coverage.ts` and its test typecheck clean with `tsc --noEmit --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --module esnext --moduleResolution bundler --target es2023 --types node`; eslint reports nothing.
- Not committed.

**Decisions & gotchas**
- Thresholds are checked on the named files together (vitest's global threshold), not per file, as the acceptance says "below the project thresholds". Documented in `docs/testing.md`.
- `vitest related` picks the tests, so a new file is covered only by tests that import it directly or through relative imports; tests through a built workspace package (`dist/`) do not count, same as `test:coverage`.
- The prefix fact was checked: `DEFAULT_COMMAND_PREFIX = '!'` at `packages/core/src/config/guild-config.ts:34`.
- `AGENTS.md` and `docs/contributing.md` use CRLF in the working copy; edits kept it.

**New CodeGraph queries**
- None beyond the ticket's query. `GUILD_SCOPED` is only in `apps/bot/src/command-set.test.ts:14`, not in `command-set.ts`.

**Next steps**
- Coordinator review. After merge, STORY/TASK grooming should use the rules in AGENTS.md 8.5 and 5.10.

---

## REVIEW · 2026-10-23T16:51:45Z · claude-opus-5-5 (coordinator) · DONE

**verify_cmd rerun**
- `pnpm test:file-coverage packages/core/src/index.ts` exits 0. `pnpm format:check` and `pnpm docs:build` pass. `scripts/file-coverage.test.ts` passes 14 tests.

**Acceptance**
- [x] AGENTS.md section 8, item 5: a ticket that adds a command lists `command-set.ts` and `GUILD_SCOPED` in `command-set.test.ts`, and those shared files change in a Story's first Task only.
- [x] Rule 5.10 and `pnpm test:file-coverage <files>` cover new source files, with the vitest.config.ts thresholds applied to the named files together. It is explained in docs/testing.md 4.1, contributing.md and development.md.
- [x] Section 8, item 6: check facts against the code. The prefix example is checked: `DEFAULT_COMMAND_PREFIX = '!'` is at packages/core/src/config/guild-config.ts:34.
- AGENTS.md diff: +6 lines, CRLF intact (the worker repaired an earlier bad write itself). The section 10 "Releases" bullet is kept.

**Worker tier**
- `claude-medium` (Sonnet) matches the `medium` tier.
