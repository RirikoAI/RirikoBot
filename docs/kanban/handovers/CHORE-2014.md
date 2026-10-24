# Handover Notes: CHORE-2014 Fix the discord.js Deprecation Warnings: ready and ephemeral

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-23T15:52:42Z · claude-opus-5-5 (coordinator)

**Found** on 2026-10-22 in the bot log (two DeprecationWarnings).

**Approach**
1. `packages/discord/src/client/gateway.ts:66`: remove `this.client.on('ready', onReady)`. Line 65 already listens to `Events.ClientReady`.
2. Map `ephemeral` to flags in the command context adapter (`packages/discord/src/command/context.ts`), then fix the direct interaction calls that bypass it (buttons, modals, select menus, ticket and giveaway components). Search `ephemeral` outside tests. There are 213 hits in 61 files; most go through ctx and need no change once the adapter maps them.

**Pitfalls**: prefix commands ignore ephemeral today; keep that. `deferReply({ ephemeral })` needs `flags` too.

---

## PROGRESS · 2026-10-23T20:43:00Z · claude-medium (Sonnet) · REVIEW

**Files changed**
- `packages/discord/src/client/gateway.ts`: removed `this.client.on('ready', onReady)`; only `Events.ClientReady` is listened to.
- `packages/discord/src/command/context.ts`: new exported `withEphemeralFlag(options)`. It turns `ephemeral: true` into `flags: MessageFlags.Ephemeral` (merges with existing number, array or flag-name flags; `ephemeral: false` is dropped; strings, payloads and options without `ephemeral` pass through). `InteractionCommandContext.reply`, `followUp` and `deferReply` use it, so command code through `ctx` keeps writing `ephemeral: true`. `PrefixCommandContext` is unchanged: it still strips `ephemeral` and ignores it.
- Direct interaction calls (72 `ephemeral: true` properties in 22 files) now use `flags: MessageFlags.Ephemeral`, with `MessageFlags` added to the `discord.js` import:
  - `packages/discord/src/router/router.ts` (1), `packages/services/src/roles/reaction-role.service.ts` (9)
  - `apps/bot/src/component-interactions.ts` (1), `apps/bot/src/controllers/music-embed.controller.ts` (13)
  - `apps/bot/src/commands/anime/search.command.ts` (1), `anime/waifu.command.ts` (1)
  - `apps/bot/src/commands/games/adventure-controller.ts` (4), `games/highlow.command.ts` (1), `games/rps.command.ts` (3), `games/tictactoe.command.ts` (3)
  - `apps/bot/src/commands/giveaway/components.ts` (5), `images/imagine.command.ts` (4), `shared/owner-collector.ts` (1)
  - `apps/bot/src/commands/tcg/cards.command.ts` (5), `craft-menu.ts` (1), `dungeon-battle.manager.ts` (5), `dungeon.command.ts` (2), `gear-menu.ts` (1), `info.command.ts` (1), `item.command.ts` (3), `shop-menu.ts` (1)
  - `apps/bot/src/commands/tickets/components.ts` (4)
- The other 143 `ephemeral` uses are `ctx.reply`, `ctx.followUp` and `ctx.deferReply` calls; they go through the central translation and are unchanged. `website/src/components/DiscordDemo/*` also has `ephemeral` but it is the website's demo data, not discord.js, so it is untouched.
- Tests updated to expect the flag: `packages/discord/src/client/client.test.ts` (emits `Events.ClientReady`; new test that no `ready` listener exists), `packages/discord/src/command/command.test.ts` (new `withEphemeralFlag` tests incl. reply, followUp, deferred paths), `packages/discord/src/middleware/pipeline.test.ts`, `packages/discord/src/router/router.test.ts`, and in `apps/bot`: `anime.command`, `waifu.command`, `wallpaper.command`, `adventure.command`, `games.flows`, `giveaway.command`, `imagine.command`, `cards.flow`, `dungeon-battle.manager`, `tickets/components`, `music-embed.controller` tests. Assertions only changed on interaction-level mocks; none weakened.
- `docs/kanban/board.json`: added `packages/discord/src/router/router.ts` to `context.files` (not listed at grooming).

**Verification**
- `pnpm typecheck` pass, `pnpm lint --quiet` pass, `pnpm format:check` pass, `pnpm test:coverage` pass (482 files passed, 6119 tests passed, thresholds met).
- No bot start was run, so the two warnings are not observed in a live log; the code no longer registers `ready` and no discord.js reply option carries `ephemeral` (checked with a TypeScript AST scan: every remaining literal `ephemeral` is a `ctx.*` call).
- Not committed. Git branch `feat/STORY-204-scripted-releases`, with other uncommitted work (CHORE-2012, BUG-0053) left untouched.

**Decisions & gotchas**
- Working-tree source files are CRLF; edits kept CRLF, test files that were LF stayed LF. Prettier run per file with `rtk proxy`.
- `ephemeral` stays in the `CommandContext` types so command code is unchanged (deprecated in discord.js types only).
- Prefix context still passes through a `flags` value if given; callers (terms-notice, ai-consent) already guard by source.

**New CodeGraph queries**
- None beyond the ticket's queries. A TypeScript AST scan (`ephemeral` property assignments grouped by enclosing call callee) was the quickest way to separate `ctx.*` from direct interaction calls.

**Next steps**
- Coordinator review. Optionally watch a bot start and a slash reply for the absence of both DeprecationWarnings.

---

## REVIEW · 2026-10-23T20:51:03Z · claude-opus-5-5 (coordinator) · DONE

**verify_cmd rerun**
- `pnpm typecheck`, `pnpm lint --quiet` and `pnpm format:check` pass.
- `pnpm test:coverage` passes: 482 files, 6119 tests. Coverage is statements 82.37%, branches 72.87%, functions 85.83% and lines 83.5%, all above the gate.

**Acceptance**
- [x] gateway.ts listens only to `Events.ClientReady`. A live bot start on the built tree (2.1.0) logged in with no "ready event has been renamed" warning.
- [x] `withEphemeralFlag` in packages/discord/src/command/context.ts turns `ephemeral: true` into `MessageFlags.Ephemeral` (OR-ed with existing flags) for slash reply, followUp and deferReply. 72 direct interaction calls in 22 files now use flags. Prefix commands still ignore ephemeral.
- [ ] A live slash reply was not checked for the "ephemeral is deprecated" warning; that needs a person to run a slash command. The code path is covered by the `withEphemeralFlag` tests and the updated command tests.

**Also checked live**: BUG-0053. With Lavalink down, the library gave up after 5 attempts, the background reconnect started ("attempt 1, after the library gave up"), and once Lavalink was started the bot logged "Connected to Lavalink node" without a restart.

**Worker tier**
- `claude-medium` (Sonnet) matches the `medium` tier. The worker was cut off once by a usage limit and resumed from its saved state.
