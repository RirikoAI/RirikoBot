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
