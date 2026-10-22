# STORY-202 · Set Up Tickets, Starboard, Event Logs and Level Role Stacking with Commands

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-22T13:09:16Z · claude-opus-5-5 (coordinator)

**Asked by the maintainer** (2026-10-22): "lets not add a new one. But lets allow server owners to enable the features using commands." The maintainer then chose:
- **Who:** members with Manage Server or Administrator, the same rule as the dashboard and the existing `/ticket action:panel`.
- **Which features:** Starboard, Tickets, the level roles keep-lower-roles switch, and Event logs.

**What exists today** (develop at `a35ae68`)
- `/ticket` (STORY-198) has panel, close, claim, add and remove. Turning tickets on and choosing the category, staff roles and transcript channel happen only on the dashboard Tickets page.
- `/levelroles` (STORY-200) has list, add, remove and sync. `keepPreviousRoles` is set only on the XP & Ranking page.
- The starboard (STORY-201) and event logs (STORY-199) have no command. They are set up only on the dashboard.

**Design decisions** (KISS)
- **One save path.** Every command saves with `GuildConfigService.update(guildId, module, patch, { userId, source: 'discord' })`. This is the path the dashboard and `ririko guild:config` already use. It validates with `GuildConfigSchemas[module]`, writes an audit row, and bumps the module version. `GuildConfigWatcher` polls versions every 5 s and emits `guild:configChanged`, and `apps/bot/src/services.ts` already invalidates the starboard, event log and level role caches on that event. So the commands need no cache code of their own.
- **No schema change and no new service.** Commands read with `guildConfigService.get(guildId, module)`. Only the fields the dashboard already has are used. Tickets have an `enabled` flag. The starboard and each event log turn off when their channel ID is empty.
- **Shared helper first** (TASK-2021): `canManageServer`, `saveGuildConfig` and `parseToggle` live in `apps/bot/src/commands/shared/guild-config-command.ts`, so the four commands do not each copy the validation-reply code. Today that code sits in `level-roles.command.ts` as `saveRewards` and `describeValidationError`.
- **Dual dispatch.** Slash and prefix follow the action-word pattern of `/ticket` and `/levelroles`: one `action` string option with choices on slash, and the first word on prefix, read in a `readRequest` function.
- **Registration scope `guild`**, like the other admin commands. The guild scope keeps the global scope under Discord's 100 slash-command limit.
- **Command names.** `starboard` goes in `commands/utility` (same category as ticket and levelroles). `eventlogs` goes in `commands/moderation`. Neither may take `logs` or any name or alias already in use.

**Task order:** TASK-2021 (helper and levelroles stack) → TASK-2022 (ticket), TASK-2023 (starboard) and TASK-2024 (event logs), which are independent but run one at a time (WIP 1) → TASK-2025 (docs).

**Out of scope**
- New features (the maintainer said "lets not add a new one"), dashboard changes, schema changes, and changing who may use the existing actions.
- The help examples write the prefix as `!` while the default prefix is `$`. That is noted for a separate chore and is not fixed here.

---

## REVIEW · 2026-10-22T15:40:00Z · claude-opus-5-5 (coordinator) · DONE

**verify_cmd rerun**
- `pnpm typecheck` and `pnpm lint --quiet` pass; I ran them at the TASK-2024 review, the last code change. `pnpm format:check` and `pnpm docs:build` pass. `pnpm test:coverage` passes: 475 files, 5957 tests. Coverage is statements 82.34%, branches 72.84%, functions 85.8% and lines 83.47%, all above the gate.

**Acceptance**
- [x] TASK-2021 to TASK-2025 are DONE.

**Notes**
- No schema change and no new service. Every command saves through `GuildConfigService.update` with `source: 'discord'`.
- New guild-scoped slash commands: `starboard` and `eventlogs`. The bot must sync commands (`SYNC_COMMANDS=true` at startup) before they appear in Discord.
