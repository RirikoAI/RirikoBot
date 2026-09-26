# Handover Note: STORY-164 Reaction Roles Builder, Auto Roles & Auto Voice Pages

- **Ticket Type & Points**: Story | 8 pts (`TASK-1641` = 3, `TASK-1642` = 3, `TASK-1643` = 2)
- **Epic**: `EPIC-011`
- **Author / Agent**: Claude Code (Opus 5.5)
- **Status**: REVIEW
- **Timestamp**: 2026-09-26
- **Branch**: `feat/STORY-164-reaction-roles-autoroles-autovoice` (targets `develop/2.0.0`)

## 0. Decisions Made at Story Start (2026-09-26)
- **Every reaction role panel write needs a passkey check** from the last five minutes: publish, edit, remove one role and delete a panel (user's choice). Auto Roles and Auto Voice saves do not.
- **Audit findings that changed the plan:**
  - The warning in dashboard.md §4 item 14 ("the bot deletes every empty voice channel in a hub's category") was out of date: BUG-0021 made the bot delete only channels it created. The page says that instead, and the doc line is fixed.
  - Auto Voice passed the saved bitrate to Discord unchanged, so a guild that lost boosts could no longer create channels. The bot now lowers it to `guild.maximumBitrate`.
- **Panel model (no schema change):** a panel is one Discord message with its `BUTTON` or `SELECT_MENU` bindings in `reaction_roles`. The layout (labels, emojis, colours) lives in the message; each binding stores its role. Buttons use the existing `rr:btn:<binding id>` handler, menus the existing `rr:select:group:<group id>` handler, with `group_id` identifying the panel. One click mode per button panel.

## 1. Summary of Work Accomplished

### TASK-1641: Guild resources, Auto Roles and Auto Voice pages
- **[GuildResourceDirectory](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/guilds/guild-resources.ts):**
  - `voiceChannels`, `maxBitrate` (boost tier, `VIP_REGIONS`), `botRoleContext` (top role name, Manage Roles) and a public `botUserId` (read once per process from `GET /users/@me`).
  - `assignableRoles` now mirrors the bot's rule: not @everyone, not managed, strictly below Ririko's highest role. It reads the bot member (`GET /guilds/{id}/members/{bot}`), cached 60 s like the rest.
  - The guild read (`with_counts`) is cached once and shared by `memberCounts` and `maxBitrate`.
- **Core:** `autoroles` (`enabled`, `humanRoleIds`, `botRoleIds` up to 10 each, `verificationRoleId`) and `autovoice` (`hubs`, [AutoVoiceHubsSchema](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/auto-voice.ts): up to 20 hubs, template up to 100 characters, limit 0 to 99, bitrate 8 to 384 kbps, one hub per channel, sorted by channel). `voiceBitrateCap(tier, vip)`.
- **[GuildConfigService](file:///Z:/Projects/ririko-v2-2026/packages/services/src/guild/guild-config.service.ts):** stores for both modules. Deps gain `autoRoles` and `autoVoice` (wired in the web, the CLI and tests). The Auto Roles store keeps the verification channel and message columns that `/autorole send-verify` writes; the Auto Voice store deletes hubs that are no longer listed and upserts the rest.
- **`saveGuildSettings(..., { check })`:** an async hook that returns field errors, run after the guards and before any write. [setting-checks.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/guilds/setting-checks.ts) checks roles against `assignableRoles` and hubs against the guild's voice channels and bitrate cap (errors numbered by submitted row). A Discord failure during the check shows "Could not check the channels and roles with Discord" and writes nothing.
- **Pages:** `/dashboard/[guildId]/autoroles` (toggle, `AssignableRoleListField` twice, `RoleSelectField`) and `/dashboard/[guildId]/autovoice` (row builder [auto-voice-hubs-field.tsx](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/autovoice/auto-voice-hubs-field.tsx) with bitrate presets up to the cap). Both warn when Ririko lacks Manage Roles or explain the hierarchy.
- **Role pickers keep saved roles Ririko cannot give** (labelled "Ririko cannot give it" or "Deleted role"). Without this, a stored role missing from a `<select>` would fall back to the first option and be cleared on the next save.
- **Bot:** `AutoVoiceService` clamps the bitrate; `/autovoice setup` clamps to the guild's maximum too.
- Nav entries, audit labels ("Auto Roles settings changed"), coverage entries, CLI keys `autoroles.*` and `autovoice.hubs`.

### TASK-1642: Panel builder and publishing
- **Core [reaction-roles.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/reaction-roles.ts):** `ReactionRolePanelSchema` (text up to 2000, optional embed, buttons or a menu, up to 25 roles, emoji parsing for Unicode and `<:name:id>`, errors named `Role N:`), `buildPanelMessage` (5 buttons per row; `allowed_mentions: { parse: [] }` so panel text never pings), `stripPanelBinding`, `panelFromMessage`, `hasForeignComponents`.
- **[ReactionRolePanelService](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/guilds/reaction-role-panels.ts) `publish`:** schema, then channel and role checks, then Discord (`POST` a new message, or `GET` + `PATCH` one of Ririko's own messages that has no other feature's components), then `replaceComponentBindings` and an audit row in one transaction. If the transaction fails, the new message is deleted or the edited one restored. Editing keeps the panel's `group_id`, so a menu's custom ID stays the same. Discord errors 50013, 50001, 10003, 10008 and 50035 become messages the manager can act on.
- **`ReactionRoleRepository.replaceComponentBindings`:** replaces only `BUTTON` and `SELECT_MENU` rows of one message; emoji bindings stay.
- **Page** `/dashboard/[guildId]/reaction-roles`: builder with a live preview ([panel-builder-field.tsx](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/reaction-roles/panel-builder-field.tsx)). After a publish, the builder switches to editing that message, so saving again does not post a duplicate. `SettingsForm` takes `submitLabel`.
- **Bot hardening:** the menu handler only honours roles still bound to the menu's group, so a removed binding stops giving its role even if the option is still on the message.
- Audit labels "Reaction role panel published / Reaction role removed / Reaction role panel deleted"; change notices link to the page.

### TASK-1643: List, edit and remove
- **Service:** `listPanels` (grouped by message, newest first, role and channel names), `loadPanel` (reads the message back into builder input), `removeBinding` (strips the button or option, or removes Ririko's own reaction, then deletes the row), `deletePanel` (takes Ririko's components and reactions off, or deletes the message when it is Ririko's; never another author's message). Missing messages, channels and emojis are tolerated so stale bindings can always be removed.
- **Page:** a "Panels" list with Open in Discord, Edit (`?edit=<message id>`), Remove per role, Remove all roles and Delete message (with confirm dialogs), above the builder.
- **`ActionButtonForm`:** a one-button form sharing `SettingsForm`'s passkey retry (the logic moved into a `usePasskeyAction` hook).
- **Bot:** `/reaction-roles remove` now strips the button or menu option from the message with the same core helper.
- **Docs:** [dashboard.md](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md) §2.3, §3.4 (the `check` hook), §4 items 13 and 14 (plus Auto Roles), §8.

## 2. Current State & Verification
- `pnpm build` (`tsc -b`), `pnpm -r typecheck` and the Next.js production build pass (the build lists the three new routes).
- ESLint: 0 errors on the touched areas (warnings are pre-existing `any`). `prettier --check .` is clean.
- **Full `vitest run`:** 221 files, 1956 of 1957 tests pass. The failure was the network-bound Spotify extractor test timing out at 25 s; it passes alone (known flake, see STORY-114).
- **New tests:** schemas (hub rows, emoji parsing, panel issues, message layout, strip and read-back), both new stores, the check hook and its checks, the directory (hierarchy filter, bot identity retry, voice channels, bitrate cap), the repository replace, the panel service with a fake REST client (new, edit, foreign components, other authors, Discord error mapping, compensation, list, load, remove, delete), the menu group filter, `/reaction-roles remove` stripping, the Auto Voice clamp, CLI round trips, audit labels and coverage entries.
- **Real CLI against a copy of the dev database:** set `autoroles.enabled`, `autoroles.humanRoleIds` and `autovoice.hubs`, which wrote the rows, `autoroles`/`autovoice` feed versions and `cli:<user>` audit entries; a limit of 300 was refused with `Row 1: User limit must be a whole number from 0 to 99.`
- **Browser checks on temporary preview pages** (since deleted; the real pages need a Discord sign-in): the hub builder (row errors keep a blank box, unused channel picked for a new hub, above-limit bitrate labelled), the panel builder (empty submit shows `Role 1:` errors, a bad emoji and a too-high pick limit are reported, a valid publish switches to "Editing message …"), and `ActionButtonForm` (cancelling the confirm sends nothing; confirming shows the passkey retry). No React warnings.
- **Not verified:** the real pages while signed in, a real publish, edit or removal in Discord, the passkey ceremony from these forms, and clicks on published panels. See §4.

## 3. Roadblocks, Gotchas & Decisions Made
- **No schema change, so no `db:push`.**
- **`assignableRoles` now needs the bot member.** It costs one extra Discord call per guild per minute, plus one `GET /users/@me` per process. A guild where the bot has only @everyone gets no assignable roles.
- **Existing button panels with mixed modes** (built one button at a time with `/create-reaction-role`) take the first button's mode when edited in the builder and saved.
- **Menus replace a member's roles from that menu on every pick** (existing handler behaviour). The page explains it; with a limit of 1 the menu is "pick one".
- **Panel list reads no messages from Discord,** so a deleted message still shows until its roles are removed; Edit then explains that it no longer exists.
- **Emoji panels cannot be edited in the builder**, only have roles removed; build new ones as button or menu panels.
- **Change notices list role IDs** as the other settings notices do (`roleIds: [...]`); the audit log page shows role names.
- **The Auto Voice store upserts every listed hub** on save, even unchanged ones; harmless inside the transaction.
- **`AGENTS.md`/`CLAUDE.md` under `apps/web`** are rewritten by `next dev`; they were never staged.

## 4. Actionable Next Steps for Next Session / Continuing Agent
1. With the real bot and `pnpm dev:web`, signed in as a guild manager:
   1. Auto Roles: add a join role and check that a new member gets it. A role above Ririko should be refused with the hierarchy message.
   2. Auto Voice: add a hub and join it; a channel should appear and be deleted when empty. A bitrate above the server's cap should be refused.
   3. Reaction Roles: publish a button panel (expect the passkey prompt after 5 minutes), click the buttons, edit the panel to a menu, remove one role, then delete the message. Check the audit log entries and the change notices.
   4. Run `/reaction-roles remove` on a button binding and check that the button disappears.
2. Review and open a PR for `feat/STORY-164-reaction-roles-autoroles-autovoice` into `develop/2.0.0`.
3. Still to do in EPIC-011: STORY-115, STORY-116 and STORY-112.
