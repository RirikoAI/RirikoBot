# STORY-201 · Starboard: Repost Popular Messages to a Highlights Channel

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-22T06:10:00Z · claude-opus-5-5 (coordinator)

**Asked by the maintainer** (2026-10-22): "lets do the last one and call it a day". This is item 4, the last one, of the EPIC-021 gap list.

**How it works for a server**
1. On the new Dashboard › Engagement › **Starboard** page, an admin picks a starboard channel. The page also sets the emoji (⭐ by default, or a custom server emoji), the number of stars needed (3 by default), whether the author's own star counts, and channels to ignore.
2. When a message reaches the threshold, Ririko posts a copy to the starboard channel. The copy is an embed with the author, the content, the first image and a jump link, under a line like "⭐ 5 | #general".
3. The count on the copy follows every new star and every removed star. Ririko removes the copy when the original is deleted or the count falls below the threshold.
4. If staff delete a copy, Ririko marks it removed and never posts that message again.

**Design decisions** (KISS)
- **Two tables.** `starboard_settings` follows the eventlogs and levelroles pattern. `starboard_posts` has one row per starred message and links the original to its copy, so counts can be edited and deletes followed. It holds author_id, so it is in the user-data inventory (`delete`) and in the privacy policy.
- **Count from the original message only.** Stars added to the copy don't count. That keeps the logic simple and matches what most servers expect from a basic starboard.
- **Self-star:** off by default. The reactor list is fetched only when the count is near the threshold, to save API calls.
- **NSFW:** a message from an NSFW channel is posted only when the starboard channel is NSFW too.
- **Concurrency:** reactions come in bursts, so each message ID has an in-memory queue, and the primary key on message_id backs it up. The bot runs as one process (the WIP-1 KISS design), so no distributed lock is needed.
- **Intents and partials** are already on: GuildMessageReactions, MessageContent, and the Message, Reaction and User partials (`packages/discord/src/client/factory.ts`).
- **No command** in this story. Settings are set on the dashboard, or with `ririko guild:config <server> starboard.<key>`. A `/starboard` command (top starred messages, random star) is a possible follow-up.
- **Privacy:** the policy date stays 2026-10-22, because STORY-199 already set it and it has not been released since. LEGAL_DOCUMENTS_DATE therefore doesn't change, which follows the maintainer's "Bump terms only" rule.

**Task order:** TASK-2011 (tables) → TASK-2012 (config) → TASK-2013 (service) → TASK-2014 (listener). TASK-2015 (dashboard) needs only TASK-2012. TASK-2016 (docs and privacy) is last.

**CodeGraph note:** this container has no CodeGraph. The queries were written from reading the code at 2a29bb8, not run. Use ranged Reads and Grep instead.

---

## REVIEW · 2026-10-22T08:40:00Z · claude-opus-5-5 (coordinator) · DONE

**Story gates**
- Pass: `pnpm build`, `pnpm db:check`, `pnpm typecheck`, `pnpm lint --quiet`, `pnpm format:check`, `pnpm docs:build` and `pnpm test:coverage`.
- Tests: 472 files passed and 1 skipped; 5814 tests passed and 547 skipped (the `[postgres]` tests skip here and run in CircleCI test-postgres).
- Coverage: statements 82.15%, branches 72.48%, functions 85.7%, lines 83.28%. Every threshold passes.

**Acceptance**
- [x] TASK-2011..2016 are DONE with REVIEW entries.
- [x] Additive migration 0009 for both dialects; the guild and user data inventories list both new tables.
- [x] Starboard module, service, listener, dashboard page, docs and privacy rows are in place.

**Known limit**: after the starboard channel changes, a copy left in the old channel is not deleted when its original is. This is documented in docs/modules.md section 13.
