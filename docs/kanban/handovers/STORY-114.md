# Handover Note: STORY-114 Settings Infrastructure, Logging, Moderation Escalation & AutoMod Pages

- **Ticket Type & Points**: Story | 8 pts (`TASK-1141` = 3, `TASK-1142` = 5)
- **Epic**: `EPIC-011`
- **Author / Agent**: Claude Code (Opus 5.5)
- **Status**: REVIEW
- **Timestamp**: 2026-09-26
- **Branch**: `feat/STORY-114-moderation-pages` (targets `develop/2.0.0`; not pushed yet)

## 0. Re-Grooming (2026-09-25)
An audit of the bot before implementation showed the original STORY-114 could not ship as groomed:
- Nothing reads `command_settings`: there is no repository, the router's middleware pipeline is empty, and even base cooldowns are not enforced.
- No select-menu or new-message reaction-role builder exists.
- The escalation policy was stored inside `moderation_rules.exempt_roles`, and only a test wrote it.
- AutoMod `TIMEOUT` only recorded a case, `KICK` and `BAN` did nothing, and `WARN` skipped escalation.
- Moderation case logs were never posted (`ModerationLogService.startListening` was never called).
- The only log channel is `guild_settings.log_channel_id`. The bot writes no message, voice or role logs.

The user chose to split the story three ways, fix AutoMod so every action runs, and bind the one log channel while wiring case logs:
- **STORY-114 (this story):** settings infrastructure, Logging, Moderation escalation and AutoMod.
- **STORY-163:** the Command Overrides engine and page.
- **STORY-164:** the Reaction Roles builder, Auto Roles and Auto Voice.

`TASK-1143` was abandoned before any work started.

## 1. Summary of Work Accomplished

### TASK-1141: Typed settings, step-up forms, CLI values, Logging page
- **Setting types** in [guild-config.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/guild-config.ts). Each accepts typed values from the dashboard and strings from the CLI:
  - `FlagSetting`: `true/false`, `on/off`, `yes/no`, `1/0`.
  - `IntSetting(min, max)`.
  - `OptionalSnowflakeSetting`: `''` or `none` clears it.
  - `SnowflakeListSetting(max)`: comma or space separated, de-duplicated.
  - `JsonSetting(schema)`.
- **New modules:** `moderation`, `automod` and `logging` in `GuildConfigSchemas`.
- **[GuildConfigService](file:///Z:/Projects/ririko-v2-2026/packages/services/src/guild/guild-config.service.ts):**
  - Stores for the three new modules. It now takes `moderation: ModerationRepository`.
  - Errors inside a list keep their row: `Row 3: Timeout steps need a length.`
- **[settings-action.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/settings-action.ts):**
  - `saveGuildSettings(guildId, module, patch, { stepUp })` accepts typed patches.
  - With `stepUp`, a save without a passkey check from the last five minutes writes nothing and returns `reason: 'passkey-check-required' | 'passkey-required'`.
  - New `readFormFields(formData, { text, list, flag })`.
- **[settings-form.tsx](file:///Z:/Projects/ririko-v2-2026/apps/web/src/components/settings-form.tsx):**
  - Shows "Confirm with passkey and save", runs `runPasskeyCheck()` (loaded on demand), then submits the same `FormData` again. On `passkey-required` it shows a link to add a passkey.
  - New fields `NumberField`, `ToggleField` and `ListField` (chips plus an add select; one hidden input per value).
  - Exported `useSettingsField` and `FieldNotes` for custom fields.
- **[guild-pickers.tsx](file:///Z:/Projects/ririko-v2-2026/apps/web/src/components/guild-pickers.tsx):** `ChannelListField` and `RoleListField`. `RoleListField` uses the new `GuildResourceDirectory.memberRoles`, which includes managed roles such as Server Booster, because exemptions match any role a member holds.
- **CLI** ([guild-config.ts](file:///Z:/Projects/ririko-v2-2026/apps/cli/src/commands/guild-config.ts)):
  - `formatConfigValue` prints ID lists comma separated, rows as JSON, and an unset channel as an empty string, so every printed value can be set back.
  - The key column fits the longest key.
- **Logging page:** [/dashboard/[guildId]/logging](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/logging/page.tsx) binds `guild_settings.log_channel_id`.
- **Bot:** [main.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/main.ts) calls `moderationLogService.startListening(client)` once at startup, not on READY (which fires again after reconnects), and stops it on shutdown. Every moderation case is now posted to the log channel.

### TASK-1142: Moderation escalation and AutoMod
- **Escalation storage:**
  - New nullable JSON column `guild_settings.escalation_steps` in both dialects. `ddl.ts` is regenerated.
  - `null` means the default policy, and `[]` turns escalation off.
  - `EscalationStep`, `EscalationStepSchema`, `EscalationPolicySchema` and `DEFAULT_ESCALATION_STEPS` live in [moderation-settings.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/moderation-settings.ts).
  - Policy rules: 1 to 20 steps, unique thresholds from 1 to 100, and timeouts from 1 minute to 28 days on `TIMEOUT` steps only. Steps are saved sorted.
- **[WarningEscalationService](file:///Z:/Projects/ririko-v2-2026/packages/services/src/moderation/warning-escalation.service.ts):**
  - It takes `GuildSettingsRepository` and reads the column.
  - `setEscalationPolicy` and the `exempt_roles` hack are gone. No data migration is needed, because only a test ever wrote that row.
  - A read error now propagates instead of silently applying the default policy, which contains a ban.
- **[Moderation page](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/moderation/page.tsx):**
  - A client row builder ([escalation-steps-field.tsx](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/moderation/escalation-steps-field.tsx)) edits threshold, action and a timeout length in minutes, hours or days. It has add, remove and "Reset to defaults".
  - The rows are submitted as one JSON field, the same form the CLI accepts.
  - Saving needs step-up.
- **[AutoMod page](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/automod/page.tsx):** for each rule, on/off, action, limit (mention and burst spam) and exempt roles and channels. Settings are stored in `moderation_rules` through `upsertRule`.
  - The store shows what the bot runs: a stored row wins, otherwise `AUTOMOD_RULE_DEFAULTS` from core.
  - A stored `ALLOW` is shown as `DELETE`, because every match deletes the message anyway.
  - `AutoModService.getDefaultConfig` now uses the same defaults.
- **Real AutoMod actions** ([automod.service.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/moderation/automod.service.ts)):
  - `ModerationContext` carries `guild` and `member` (passed by the message listener).
  - `WARN` goes through `WarningEscalationService.issueWarning`.
  - `TIMEOUT` (600 s), `KICK` and `BAN` go through `ModerationActionService`.
  - All of them act as Ririko's own member, so permission and hierarchy checks apply and cases are recorded.
- **Cache invalidation:** [services.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/services.ts) drops the AutoMod rule cache on `guild:configChanged` for `module === 'automod'`.
- **`/automod enable|disable`:** when no row exists, it now inserts the rule defaults (`DELETE`, 5), not the repository defaults (`WARN`, 3).
- **Docs:** [dashboard.md](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md) §3.4 (the new recipe), §4 and §8, and [moderation.md](file:///Z:/Projects/ririko-v2-2026/docs/moderation.md) §3.2, §4 and §5.

## 2. Current State & Verification
- **Build and checks:** `pnpm build` (`tsc -b`), `pnpm -r typecheck` and `pnpm build:web` pass. ESLint shows 0 errors on the touched areas; the warnings are pre-existing `any` usage.
- **Prettier:** clean on every new file and on every touched file that was clean on `develop/2.0.0`. The bot `commands.ts`, `main.ts`, `services.ts` and `message.listener.ts`, and `automod.service*.ts`, `automod.types.ts` and `warning-escalation.service.ts`, already failed Prettier on `develop/2.0.0` and were not reformatted.
- **Full `vitest run`:** 202 files, 1823 tests pass.
  - One parallel run lost two network-bound music extractor tests to timeouts; they pass alone.
- **New and changed tests:**
  - Setting types and escalation schema edges (core).
  - The three new stores, including CLI strings, row errors, audit rows and feed bumps (services).
  - Step-up and `readFormFields` (web action).
  - `memberRoles`.
  - CLI round trips for flags, numbers, lists, JSON and cleared channels.
  - The escalation service reading the column, an empty policy, and no fallback on error.
  - AutoMod punishments per action.
  - `/automod` defaults.
  - Bot sync: the AutoMod cache drops after a feed tick.
  - The coverage test lists the three new actions.
- **Test DDL:** eight test files keep hand-written `guild_settings` DDL and got the new `escalation_steps TEXT` column.
- **`drizzle-kit push` against a backup of the dev database:** the only statement was `ALTER TABLE guild_settings ADD escalation_steps text`.
- **Real CLI against that backup:**
  - Listed all keys.
  - Set `automod.mentionSpamLimit 8` and a two-step policy. This wrote `cli:<user>` audit rows, `automod` and `moderation` feed versions, and four `moderation_rules` rows.
  - Rejected a timeout without a length with `Row 1: Timeout steps need a length.`
- **Browser check** on a temporary preview page, since deleted (the real pages need a Discord sign-in):
  - The step builder shows row errors and keeps a blank box blank after an error. The "Confirm with passkey and save" button appears when the action asks for it.
  - The AutoMod fields keep toggles, chips and limits across error and save.
  - This check found and fixed a React key warning: `key` placed after `{...props}` compiles to `createElement` with a children array, which only showed once a `SelectField` was rendered.
- **Not verified:** saving on the real pages as a signed-in user, the passkey ceremony from a settings form, and real Discord effects. See §4.

## 3. Roadblocks, Gotchas & Decisions Made
- **Run `pnpm db:push` before starting the bot or dashboard on an existing database.** `guild_settings` gained a column, and every `guild_settings` read, including prefix lookups, fails with `no such column: "escalation_steps"` until it exists. A dev server running from this working tree already hit that error on 2026-09-26.
- **Escalation read errors are no longer swallowed.** On a database error `/warn` reports the error after saving the warning; no case or DM is written for that call. Defaulting would ban members in guilds that turned escalation off.
- **AutoMod cases are now recorded under Ririko's user ID**, not the string `AUTOMOD`, because they run through the normal moderation services.
- **`moderation_rules` has no unique `(guild_id, rule_type)`,** and `upsertRule` selects then inserts. This is fine inside the settings transaction on SQLite. Two concurrent first saves on Postgres could insert duplicates; the bot and the dashboard then both use the last row of that type.
- **Row numbers in errors follow the submitted order.** The builder labels rows "Row 1…" to match. Duplicate thresholds are reported without a row.
- **The CLI has no step-up.** It needs database access, and every write is audited as `cli:<os user>`, the same as `passkeys:reset`.
- **Not in scope, but noticed:**
  - `/warn` severity has no range clamp.
  - Auto Voice `cleanupOrphans` deletes every empty voice channel in a hub's category, not only the channels it created. This was flagged as a separate follow-up; STORY-164 must warn about it on the page.

## 4. Actionable Next Steps for Next Session / Continuing Agent
1. Run `pnpm db:push` on the dev database.
2. With the real bot token, `pnpm dev:web` and the bot running:
   1. Logging: pick a channel, then `/warn` someone. The case embed should appear there, followed by the dashboard change notice.
   2. Moderation: save a policy after more than 5 minutes. "Confirm with passkey and save" should appear, and the save should complete after the passkey prompt. `/warn` then follows the new steps.
   3. AutoMod: set the mention limit to 2 and the action to timeout, and send a message with 3 mentions from a non-staff account. The message should be deleted and the account timed out for 10 minutes, with a case in the log channel within about 5 seconds of the save (feed tick).
3. Open the STORY-114 PR against `develop/2.0.0` once the user asks.
4. Next in the delivery order: STORY-113 and STORY-115; STORY-163 and STORY-164 follow STORY-114.
