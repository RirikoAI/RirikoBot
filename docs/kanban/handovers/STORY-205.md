# Handover Notes: STORY-205 Claim Card Drops with a Button, Send the Card by DM, Edit the Drop Message

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-31T13:51:40Z · claude-opus-5-5 (coordinator)

**Request** (maintainer, 2026-10-31): claim with a button instead of only by command. On success, DM the full card design to the claimer, and edit the existing drop message with a success message instead of posting a new one, so the channel is not flooded.

**Decisions**
- The commands stay. AGENTS.md rule 5.2 requires command parity, and `/card action:claim` is documented. They end the same way as the button.
- The success and expired states remove the card image from the drop message (`attachments: []`) as well as the button. The DM holds the full card, and the goal is less channel noise.
- Closed DMs do not lose the claim. The ephemeral confirmation carries the card. A prefix reply cannot be ephemeral (`packages/discord/src/command/context.ts:291` deletes the option), so a prefix claim with closed DMs gets text only, pointing to `/cards`.
- The drop embed stops naming the commands, so `handleCardDrop` no longer needs the prefix lookup (`guildSettingsService.getSettings`).

**Approach**
1. `drop-manager.ts`: add `messageId: string | null` to `ActiveDrop` (null in `spawnDrop`) and `setDropMessage(dropId, messageId)`. In `claimDrop`, wrap `createUserCard` so a rejection restores `claimed`, `claimedBy` and the previous `lastClaimants` entry, then rethrows.
2. New `apps/bot/src/commands/tcg/card-drop-claim.ts` holds the shared flow: custom id helpers, the button row, the claimed and expired embeds, the DM embed (moved from `card.command.ts` case `claim`), one completion function used by both the button and the command, the button handler, and the expiry timer.
3. `listeners/card-drop.ts`: send with the button row, call `setDropMessage` with the sent message id, and start the expiry timer. Then check `drop.claimed`: a command claim may have won during the image render, so edit to the claimed state right away.
4. `component-interactions.ts`: route the `carddrop:claim:` prefix. Import from `./commands/tcg/card-drop-claim.js` directly, as `./privacy/ai-consent.js` is, because `component-interactions.test.ts` mocks `./index.js` with a fixed export list.
5. `card.command.ts` case `claim`: call the completion function and reply per the acceptance. Keep the existing "no active drop" and failure replies. `attachCardImage` stays for `inspect`.
6. Update user text. `info.command.ts:58`: keep the strings `/card action:claim` and `<prefix>card claim`, because `info.command.test.ts:94,252,265` asserts them; add the button in front. Dashboard `tcg/page.tsx:30`, `docs/waifu-tcg.md:53`, `docs/tcg-player-guide.md:11,20,445`. Keep each doc's plain style.

**Relevant code**
- `apps/bot/src/listeners/card-drop.ts:12` `handleCardDrop`: posts the drop. Never throws, and it must stay that way.
- `packages/services/src/waifu-tcg/drops/drop-manager.ts:312` `claimDrop`: the lock is synchronous before the first await, so concurrent presses are safe. Claimed drops stay in `activeDrops`, so a late press gets "already claimed by".
- `drop-manager.ts:165` `getActiveDropById`: returns null and clears an expired or unknown drop. Drops live in memory only, so a restart leaves dead buttons on old messages.
- `apps/bot/src/commands/tcg/card.command.ts:308` case `claim`: the current public reply with the full card.
- `apps/bot/src/component-interactions.ts:35`: button routing by custom id prefix. Errors are caught and logged there, but a press still needs its own ephemeral error answer.
- `packages/services/src/waifu-tcg/canvas/card-image.service.ts:50`: images are cached by `card.id` in `public/cards/`, so the DM normally reuses the drop's render.
- `apps/bot/src/commands/tcg/achievement-progress.ts` `syncCollectionAchievements`: swallows its own errors. BUG-0025 requires it after every claim.

**Pitfalls**
- Call `interaction.deferUpdate()` first. Discord allows 3 seconds, and the mint, DM and render can take longer. After it, answer with `followUp` using `flags: MessageFlags.Ephemeral`. Direct interaction calls must use flags, not `ephemeral` (CHORE-2014).
- A button claim and a command claim share one edit path: `user.client.channels.fetch(drop.channelId)`, then `messages.edit(drop.messageId, ...)`. Skip it when `messageId` is null. A failed edit is logged; it must not fail the claim, the DM or the confirmation.
- `claimDrop` rejects only when `now > expiresAt`. Start the expiry timer at `expiresAt - now + 1000` so a claim cannot succeed after the expired edit went out. `.unref()` the timer so it never holds the process open. It does nothing when `drop.claimed` is true.
- Do not put the card image in the channel on the command path. The existing test at `card.command.test.ts:225` asserts the old public reply; change it to assert the new behavior, keeping its checks of the footer, `getCardImage` arguments and `syncCollection` on the DM payload. Its mock user needs a `send`.
- Mentions in embeds do not ping. Keep the claimer mention in the embed.
- Tests that involve randomness keep deterministic values. Use fake timers for the expiry.

**Out of scope**
- The website demo (`website/src/components/DiscordDemo/`) and its tests.
- Claim rules, drop settings, schema changes. Drops stay in memory.
- `docs/archive/` (design history).

---

## PROGRESS · 2026-10-31T14:07:39Z · claude-large (claude-opus-5-5) · REVIEW

**Files changed**
- `apps/bot/src/commands/tcg/card-drop-claim.ts` (new): button row, claimed and expired edits, the shared `completeCardDropClaim`, `handleCardDropClaimButton`, `scheduleCardDropExpiry`, and the replies.
- `apps/bot/src/commands/tcg/card-drop-claim.test.ts` (new): 100% coverage of the new file, including two presses at once.
- `apps/bot/src/listeners/card-drop.ts` and its test: posts with the button, stores the message id, starts the expiry timer, and edits right away when a command claim won during the post. The prefix lookup is gone.
- `apps/bot/src/commands/tcg/card.command.ts` and its test: case `claim` uses the shared completion.
- `apps/bot/src/component-interactions.ts` and its test: routes `carddrop:claim:`.
- `packages/services/src/waifu-tcg/drops/drop-manager.ts` and `drops-and-dismantle.test.ts`: `messageId`, `setDropMessage`, the rollback in `claimDrop`, and the `clearDrop` guard below.
- User text: `info.command.ts`, dashboard `tcg/page.tsx`, `docs/waifu-tcg.md`, `docs/tcg-player-guide.md`.

**Verification**
- `verify_cmd` passes in full. File coverage of `card-drop-claim.ts`: 100% statements, branches, functions and lines. Named vitest run: 570 passed, 3 skipped. Typecheck, lint, format and docs build are clean.
- Also ran `pnpm vitest run apps/bot packages/services apps/web`: 3449 passed, 8 skipped.
- Not tried against real Discord. Tests mock the client, so the button, the DM and the message edit have not been seen in a live server.
- No branch or commit. Nothing is staged.

**Acceptance**
1. Button and routing: `card-drop.test.ts` checks the one button, its custom id, "Press **Claim**" and `<t:60:R>`. `component-interactions.test.ts` checks the route.
2. First press: `card-drop-claim.test.ts` checks one mint, the sync, the DM with image and details, and the edit with `components: []`, `attachments: []` and no image, with no channel send.
3. Closed DMs: the claim stays and the ephemeral message carries the embed and file.
4. Failed presses: already claimed (names the winner), cooldown (no edit), and gone (`editReply({ components: [] })`) each have a test.
5. Expiry: fake timer tests cover the edit at `expiresAt + 1000`, no edit when claimed, and a failed edit that is logged.
6. Commands: `card.command.test.ts` covers the slash DM, slash with closed DMs, the drop message edit, and prefix with open and closed DMs (one line, no card).
7. Claim during the post: `card-drop.test.ts` ends in the claimed state, and the timer leaves it alone.
8. Rollback: `drops-and-dismantle.test.ts` checks `claimed`, `claimedBy`, and `lastClaimants` both with and without a previous claimant. The button test checks the ephemeral error and a working retry.
9. Concurrency: covered at both the button and the `claimDrop` level, with one mint and one DM.
10. User text is updated. The command stays documented as the alternative.

**Decisions & gotchas**
- `attachCardImage` moved out of `card.command.ts` instead of staying. The grooming note says it stays for `inspect`, but `inspect` uses its own copy in `cards.command.ts`, so the old one had no caller left. The unused `formatCardSerialNumber` import went with it.
- Added a guard not in the grooming: `clearDrop` only removes the guild pointer when it points at this drop. Without it, a late press on an old claimed drop after its window would unlink a newer drop, and `/card action:claim` would stop finding it. Buttons make that path reachable.
- Added a slash `deferReply({ ephemeral: true })` to case `claim`, after the "no active drop" check, because the DM makes the command slower than Discord's 3 seconds can allow. Prefix does not defer.
- The drop message is edited before the DM is rendered, so the button goes away as soon as possible.
- A failed source lookup after the mint falls back to the default attribution, so it cannot lose the edit, the DM or the confirmation.
- `@ririko/services` resolves to `dist` in tests, so `packages/services` must be built (`pnpm build`) before the bot tests see `setDropMessage`.

**Known edge cases, left as they are**
- If a command claim's mint fails after the listener already showed the claimed state, the message says claimed but the drop can still be claimed by command until it expires. The expiry timer then edits it to expired.
- If a drop is cleared from memory during a very long post (longer than its claim window), `setDropMessage` finds nothing, so the expiry edit is skipped. A press still removes the dead button.
- Claimed drops stay in `activeDrops` until something looks them up after expiry. This leak is older than this ticket and small. Not changed.
- `dungeon-battle.manager.ts:77` and `game.command.ts:153` still say `/card claim`. The website demo (`scripts/website-demo-*.test.ts`) still shows the old drop text, which is out of scope.

**New CodeGraph queries**
- None.

**Next steps**
- Coordinator review. Try one drop in a real server before release: press Claim, then check the DM, the edit and the expiry.

---

## REVIEW · 2026-10-31T14:19:37Z · claude-opus-5-5 (coordinator) · DONE

**verify_cmd rerun**: passes. File coverage of `card-drop-claim.ts` is 100%. Named vitest run: 570 passed, 3 skipped. Typecheck, lint, format and docs build are clean. `pnpm test:coverage` also passes every threshold: statements 82.43%, branches 72.94%, functions 85.87%, lines 83.57%.

**Worker tier**: `claude-large` on claude-opus-5-5, matching the ticket's `large` tier.

**Acceptance** (checked against the diff)
- [x] 1. One Claim button with custom id `carddrop:claim:<dropId>`, routed in `registerComponentInteractions`; the drop text says to press Claim and keeps the relative expiry.
- [x] 2. First press mints once, syncs achievements, sends the DM with the full card, and edits the drop message with `components: []` and `attachments: []`. No channel send.
- [x] 3. Ephemeral confirmation; failed DM keeps the claim and the ephemeral message carries the card.
- [x] 4. Failed presses answer ephemerally; a gone drop also removes the button.
- [x] 5. Expiry edit at `expiresAt + 1000`; a failed edit is logged.
- [x] 6. Commands share `completeCardDropClaim`. Slash is ephemeral; prefix is one line of text with no card.
- [x] 7. A claim during the post ends in the claimed state (`if (drop.claimed)` after `setDropMessage`).
- [x] 8. `claimDrop` rolls back on a `createUserCard` rejection; the button answers with an ephemeral error.
- [x] 9. The lock is synchronous before the first await; concurrent tests pass.
- [x] 10. User text updated; the command stays documented.

**Accepted deviations from the grooming note**: `attachCardImage` left `card.command.ts` (no caller remained); `clearDrop` guards the guild pointer (a late press must not unlink a newer drop); slash claim defers (the DM can exceed 3 seconds; a deferred `ctx.reply` goes through `followUp` with the ephemeral flag).

**Open points**
- Not tried against real Discord. Tests mock the client.
- The Claim button does not pass the command router middlewares (`createMaintenanceMiddleware`, `createModuleToggleMiddleware`, `createCommandOverrideMiddleware`, `createPermissionMiddleware`, rate limit, cooldown), so a per-server `/card` override or maintenance mode does not stop a press. Other component buttons, such as giveaways, behave the same way.
- The website demo still shows the old drop text and public claim reply. `dungeon-battle.manager.ts:77` and `game.command.ts:153` still name `/card claim`.
