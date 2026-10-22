# EPIC-021 · Essential Server Tools

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-21T15:45:00Z · claude-opus-5-5 (coordinator)

**Asked by the maintainer** (2026-10-21): "what cool feature can I add for Ririko, something that is essential for most Discord servers."

**Gap review of develop (dbe22fe).** Ririko already has moderation with cases, AutoMod, anti-raid, a log channel, welcome and farewell cards, auto roles with a verification button, reaction roles, temporary roles, XP, giveaways, reminders, stream alerts and free games. These common features are missing, in the order they matter to a typical server:

1. Support tickets. Nothing exists. Chosen by the maintainer on 2026-10-21, groomed as STORY-198.
2. Server event logs. The Logging page sends only moderation cases, anti-raid alerts and dashboard notices. No listener exists for messageUpdate, messageDelete or guildMemberUpdate, although the intents and partials are already on (`packages/discord/src/client/factory.ts`).
3. Level role rewards. XP and level-ups exist (`apps/bot/src/listeners/level-up.ts`), but no roles are given at a level.
4. Starboard. Nothing exists; the reaction listener is already there.

Add a story here when the maintainer picks the next one.

---

## GROOMING · 2026-10-22T02:10:00Z · claude-opus-5-5 (coordinator)

STORY-198 (support tickets) is DONE and merged (PR #740). On 2026-10-22 the maintainer asked for the next essential feature. Server event logs, item 2 of the gap list, is groomed as STORY-199.

---

## GROOMING · 2026-10-22T04:40:00Z · claude-opus-5-5 (coordinator)

STORY-199 (server event logs) is DONE and merged (PR #741). On 2026-10-22 the maintainer asked for the next essential feature. Level role rewards, item 3 of the gap list, is groomed as STORY-200. The starboard is left.

---

## GROOMING · 2026-10-22T06:10:00Z · claude-opus-5-5 (coordinator)

STORY-200 (level role rewards) is DONE and merged (PR #742). The maintainer asked for the last one of the day, so the starboard (item 4) is groomed as STORY-201. After it, every item on the gap list is covered.
