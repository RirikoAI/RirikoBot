# Handover Notes: STORY-128 1.4.0 Guild Settings Fidelity: Migrate guild_config Into the 2.0 Tables the Bot Reads

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## FLAG · 2026-10-01T16:21:01Z · from TASK-1261 · Claude Code (Opus 5.5)

**Finding**: TASK-1261 tested the migration against the real 1.4.0 schema and the real `guild_config` names. The names come from the 1.4.0 commands: `.local/RirikoBot/src/command/guild/welcomer.command.ts`, `farewell.command.ts`, `karma.command.ts` and `free-games.command.ts`, `twitch/setup-twitch.command.ts`, `ai/ai-model.command.ts` and `stablediffusion/stablediffusion-model.command.ts`.

TASK-1261 fixed the names the transformer reads. Where the values land in 2.0 is still wrong or missing:

| 1.4.0 `guild_config` name | Migrated to (`packages/database/src/migration/transformer.ts`) | What 2.0 reads |
|---|---|---|
| `welcomer_channel`, `welcomer_enabled`, `welcomer_bg` | `guild_settings.welcomer_channel_id`, `welcomer_enabled`, `welcomer_bg` | `guild_welcomer` (`WelcomerRepository.getWelcomeConfig`, `packages/database/src/schema/sqlite/utilities.ts:93`). Nothing in `packages/services` or `apps` reads the `guild_settings` welcomer columns. |
| `farewell_channel`, `farewell_enabled`, `farewell_bg` | `guild_settings.farewell_*` | `guild_farewell` (`utilities.ts:105`) |
| `freeGamesChannelId` | not migrated. `free_game_announcements.channel_id` is set to the guild id. | `free_game_channels` (`packages/database/src/schema/sqlite/free-games.ts:27`) |
| `ai_model` | not migrated | probably `ai_guild_preferences` (`ai.ts:44`) |
| `stablediffusion_model` | not migrated | probably `image_guild_settings` (`images.ts:49`) |
| `twitch_channel` | not migrated | each `stream_subscription` row already has its own `channelId`. Check whether 1.4.0 used this name as a default. |
| `karma-notification-enabled` | `guild_settings.karma_notifications_enabled` | the same column, so this one is correct |

- The `configuration` table (one row per application) holds plaintext `twitchClientId`, `twitchClientSecret` and `stableDiffusionApiToken`. They are deliberately not migrated (`docs/migrations.md` section 2 says "plaintext tokens stripped"). Decide whether the upgrade should tell the owner to re-enter them.
- `reaction_role` has no channel in 1.4.0, so `reaction_roles.channel_id` gets the guild id. Check what 2.0 does with such a row, for example when it re-fetches the message.

**Impact on this ticket**:
- Welcome and farewell cards, the free-games channel and the AI and image models configured in 1.4.0 would silently reset after the Docker upgrade. That breaks the zero-data-loss rule (`docs/migrations.md` section 1).
- Route each value into the table the bot reads, through the existing repositories' row shapes, and extend `packages/database/src/migration/migration.test.ts`. That test already inserts every name above.
- This must land before STORY-127 moves `latest`.

---

## GROOMING · 2026-10-02T05:25:08Z · Claude Code (Opus 5.5)

**Approach**
- This answers the TASK-1261 FLAG above. The story grows from 3 to 5 points because the maintainer approved the reaction-role fix on 2026-10-02.
- TASK-1281 routes every `guild_config` setting into the table 2.0 reads. The task acceptance and the TASK-1281 note give each mapping.
- TASK-1282 fixes reaction roles. 1.4.0 never stored their channel, so the migration writes the guild id as the channel id.
  - On the first reaction, the bot saves the real channel id.
  - Until then, the remove command and the dashboard panel treat the channel as unknown.
- Decisions:
  - `twitch_channel` is not migrated. 2.0 has no default-channel setting, and every migrated subscription already has its own channel.
  - The Twitch and Stable Diffusion credentials in the `configuration` table stay unmigrated, because plaintext tokens are stripped. The migration summary names the ones the owner must re-enter in the dashboard vault.
  - `stablediffusion_model` maps only to `default_provider = replicate`. 2.0 has no per-guild image model.
  - The `guild_settings.welcomer_*` / `farewell_*` columns stay in the schema but are no longer written. Nothing reads them, and dropping them would mean a schema change.

**Relevant code** (from CodeGraph and exploration during grooming)
- `packages/database/src/migration/transformer.ts`:
  - `:199-221`: the `guild_config` switch.
  - `:373-387`: free-game announcements, which get the guild id as their channel id.
  - `:349`: reaction roles, which get the guild id as their channel id.
- `packages/database/src/migration/engine.ts:147-222`: the insert order. Every insert uses `onConflictDoNothing`, all in one transaction.
- `packages/database/src/repositories/welcomer.repository.ts:20,65` and `apps/bot/src/listeners/member.listener.ts:61` read `guild_welcomer` / `guild_farewell`. They need `isEnabled && channelId`.
- `packages/database/src/repositories/free-game.repository.ts:173,251`: `isGameAnnounced` and `getGuildChannel`.
- `packages/core/src/config/ai.ts:20-96`: the 2.0 AI model choices and the functions that normalise them.

**Pitfalls**
- Legacy `*_enabled` values are strings (`'true'`). Use `isEnabledValue`.
- `guild_welcomer.channel_id` is NOT NULL. Write no row when the channel is missing.
- The 2.0 default for `is_enabled` is true. Set false explicitly when legacy has no enabled row.
- Legacy free-game ids are raw Epic ids or slugs, or Steam store URLs. The 2.0 ids are `epic-<id>` and `steam-<appId>`.

**Out of scope**
- Dropping the unused `guild_settings` columns.
- Migrating credentials.
- Everything in STORY-127.

---

## PROGRESS · 2026-10-02T05:39:03Z · Claude Code (Opus 5.5) · REVIEW

**Files changed**
- TASK-1281 and TASK-1282 are DONE. Their notes list the files.

**Verification**
- Story gate on `feat/STORY-128-guild-settings-fidelity`, not committed:
  - `pnpm lint --quiet` and `pnpm typecheck` pass.
  - `pnpm test:coverage` passes: 2663 tests and 5 skipped. Coverage is lines 70.34%, statements 69.01%, branches 58.93% and functions 70.57%, all above the thresholds.
  - `pnpm build` passes.
- Not run: `docker build` and `node scripts/docker-smoke.ts bot`. The legacy smoke check builds its database from the changed fixture, so run it before the PR, or let the CircleCI `docker` job run it.

**Decisions & gotchas**
- The migration summary now has a `notices` list on `MigrationResult`. The bot startup log and `ririko migrate:legacy` print it.
- Answers to the TASK-1261 FLAG: every row of its table is handled, and the reaction-role channel is backfilled lazily.
