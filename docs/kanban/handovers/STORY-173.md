# STORY-173 — Private Message Context Menu Translation to English

- Type / estimate: Story, 5 points; parent EPIC-003.
- Status: REVIEW.
- Agent: Codex.
- Date: 2026-09-30.
- Branch: `codex/message-translate`, based on `6d2d0dd` (`origin/develop/2.0.0`).

## Completed

- `packages/discord/src/command/{types,context}.ts`: message context-menu metadata and interaction context, preserving shared reply methods.
- `packages/discord/src/router/{registry,router}.ts`: separate case-sensitive menu index, private deferral before middleware, normal override/cooldown/usage hooks, and private deferred errors.
- `packages/discord/src/rest/sync.ts`: type-3 menu payloads alongside existing slash commands in both global and guild bulk synchronization; preserves menu capitalization, omits slash-only descriptions/options.
- `packages/discord/src/help/generator.ts`: correct message-menu help syntax.
- `packages/ai/src/translation.service.ts` and `index.ts`: stateless English translation through the existing fallback provider chain. No conversation history, persona, user identity or executable tools. Rejects empty, oversized and incomplete output.
- `apps/bot/src/commands/ai/translate.command.ts` and `main.ts`: registers **Translate to English** on startup. Extracts selected message and embed text, honors guild provider/model preferences, suppresses mentions/link previews, and sends long results as a UTF-8 attachment in the same ephemeral reply.
- Added translation service, command/router integration, context-menu registry/sync/help tests. Updated `docs/commands.md` and both board files.

## Verification

- `pnpm build --force`: passed after final implementation and test additions.
- `pnpm typecheck`: passed across the workspace.
- `pnpm lint`: passed with 0 errors and 590 existing warnings.
- `pnpm format:check`: passed.
- Focused Discord package, translation service/command and command catalog tests: **150 passed**, 12 files.
- `pnpm test:coverage`: **2526 passed, 24 failed, 5 skipped**. Repeated with `--coverage.reportOnFailure` to obtain coverage despite test failures: statements **67.45%**, branches **57.52%**, functions **69.06%**, lines **68.72%**. All unchanged coverage thresholds pass; the full command still exits unsuccessfully because of the 24 existing failures.
- Unrelated failing files match BUG-0027's recorded local baseline: music controller/command playback fixtures, AI tool/economy/TCG locale-dependent formatting, and WaifuGuild creation fee formatting. No thresholds were lowered and no unrelated tests changed.
- Board IDs unique, WIP cleared when moved to REVIEW. No live database writes or Discord command registration performed during development.

## Decisions and limitations

- Context menu only: canonical name `translate` for overrides/cooldowns; display name `Translate to English`. Prefix or stale slash invocations give menu instructions, never a public translation.
- Normal 10-second per-user cooldown, customizable through existing command overrides.
- Text and readable embeds only; no OCR, attachments, URL fetching or surrounding conversation. Input limit 12,000 characters; output over 2,000 characters uses `translation-en.txt` without truncation.
- Existing configured AI provider required. The selected source text is sent to that provider. Provider errors are sanitized before returning them privately.
- Bot startup synchronizes the message menu using the existing global/development-guild choice. No database migration or new credential is required.

## Maintainer follow-up

1. Review the PR against `develop/2.0.0`; resolve/verify the full CI results before merging. The agent must not merge.
2. Run the updated bot with an available AI provider and let normal startup synchronize commands.
3. In Discord, right-click a foreign-language message → Apps → Translate to English. Verify with a second account that only the invoker sees the result.
4. Check an embed-only message, a long translation attachment, an image-only message, cooldown and disabled-command responses. Confirm private errors when providers are unavailable.
