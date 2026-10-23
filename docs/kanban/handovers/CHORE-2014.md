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
