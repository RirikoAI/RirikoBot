# Handover Note: STORY-166 Stream Alerts, Free Games & Welcome & Farewell Pages

- **Ticket Type & Points**: Story | 13 pts (`TASK-1661` = 5, `TASK-1662` = 3, `TASK-1663` = 5)
- **Epic**: `EPIC-011`
- **Author / Agent**: Claude Code (Opus 5.5)
- **Status**: DONE (merged in PR #657)
- **Timestamp**: 2026-09-28
- **Branch**: `feat/STORY-166-stream-freegames-welcome` (targets `develop/2.0.0`)

## 0. Decisions Made at Story Start (2026-09-28)
- **Uploaded backgrounds are files on a shared volume** (the user's choice over a database blob): `storage/welcomer-backgrounds`, resolved from the workspace root and mounted in both the bot and the web containers.
- **The legacy 1.4.0 migration is fixed in TASK-1661** (the user's choice): it derives UUID v5 stream IDs.
- **STORY-116 moved to DONE** (merged in PR #655).
- **Deviations from the plan:**
  - Streamer rows are not deleted when their last subscription goes. The watcher only polls streamers that have a subscription, so leftover rows do no harm.
  - The welcome and farewell previews show the **saved** settings (rendered when the page loads), not unsaved form input. Saving refreshes the preview.
  - Welcome and Farewell are two pages (`/welcome`, `/farewell`) that share one editor, so the change notice links and module names match.
  - The background link check runs in `GuildConfigService` (a new optional `check` on a module store), so the CLI refuses private links too. The first version checked only on the dashboard.

## 1. Summary of Work Accomplished

### TASK-1661: Stream Alerts (`/dashboard/[guildId]/streams`)
- **New `@ririko/services/stream-alerts`** (no discord.js, no canvas):
  - `handles.ts`: `inferPlatform`, `cleanStreamerIdentifier`, `parseStreamPlatform` and `fallbackPlatformUserId`, moved out of `apps/bot`.
    - A Twitch name starting with "uc" is no longer treated as YouTube; only a real `UC…` channel ID shape is.
    - The platform user ID stored when a handle cannot be resolved is lowercased, except YouTube channel IDs, which are case sensitive.
  - `format.ts`: `formatStreamAnnouncement` replaces all variables in one pass with a function (a title with `$&` or `{role}` is inserted as written), keeps line breaks and caps the message at 2000 characters. `streamAnnouncementMentions` gives the role-only `allowedMentions`.
  - `StreamAlertService`: `list`, `get`, `subscribe`, `update`, `remove`.
    - It resolves the handle through the platform adapter, lets the repository generate the uuid IDs (the command wrote `twitch_123` and `sub_<guild>_<streamer>` into Postgres uuid columns) and enforces 25 subscriptions per guild and messages of at most 1000 characters.
    - Every change writes an audit entry (`stream_alerts.subscribe`, `.update`, `.remove`, with `source` `dashboard` or `command`).
  - `createStreamAdapters(env)` builds the three adapters for the bot and the web app.
- **Repository:** `findSubscriptionById` (a non-uuid ID finds nothing on Postgres instead of failing), `countSubscriptionsByGuild`, `updateSubscription` and `removeSubscriptionById`, all scoped to the guild.
- **Dispatcher:** uses the shared formatter and sends `allowedMentions: { parse: [], roles: [mentionRoleId] }`.
- **Bot:** `/stream subscribe`, `!subscribe`, unsubscribe and list use the service.
  - Prefix subscribe reads the platform, `#channel` and `@role` in any order.
  - The channel must be a text channel of the server and the role a role of the server.
  - Unsubscribe no longer falls back to a streamer the server does not follow, and reports failures.
- **Legacy migration:** `legacyUuid` / `uuidV5` in `packages/database/src/migration/uuid.ts` (checked against the RFC 9562 example). Subscriptions point at their streamer's derived ID.
- **Web:** list with an announcement preview, an add/edit form (streamer, platform, channel, role, message) and removal. A warning shows when Twitch is not configured. Actions check the origin, guild access, the channel and the role (new `checkMemberRole`, also used by the music check).

### TASK-1662: Free Games (`/dashboard/[guildId]/freegames`, module `freegames`)
- **DB:** `free_game_channels.mention_role_id` on both dialects.
- **Repository:**
  - `getGuildChannel` returns `{ guildId, channelId, mentionRoleId }`.
  - `setGuildChannel(guildId, { channelId, mentionRoleId? })` is an upsert; a role left out keeps the saved one.
- **Engine:** `onAnnounceGame(target, game)`. `formatAnnouncement(game, roleId)` puts the role mention above the embed and allows only that mention.
- **Bot:** `/freegames setchannel` takes an optional `role` (slash option or `<@&id>`), and `show` names the role.
- **Guild config:** module `freegames` (`channelId`, `pingRoleId`). An empty channel deletes the row. It is available in the CLI as `freegames.*`.

### TASK-1663: Welcome & Farewell (`/dashboard/[guildId]/welcome`, `/farewell`, modules `welcome`, `farewell`)
- **New `@ririko/services/net`** (`remote-image.ts`, no canvas):
  - `isPrivateOrRestrictedIp` (moved; now covers all of fe80::/10, and 192.0.0.0/24 no longer blocks all of 192.0.0.0/16).
  - `assertPublicUrl` (also refuses `*.localhost` and IPv6 literals).
  - `fetchRemoteImage`: manual redirects with every hop checked, at most 3; content type, size cap.
  - `parseImageDimensions` (moved).
  - `ProfileBackgroundManager` delegates to it; its old `downloadImage` followed redirects without checking them.
- **Core:** `welcomer.ts` holds the defaults, limits, `HexColorSetting`, `WelcomerMessageSetting` (1 to 200 characters) and `OptionalImageUrlSetting`.
- **DB:** `background_file` on `guild_welcomer` and `guild_farewell` (both dialects).
- **Services:**
  - `WelcomerBackgroundStore` (`@ririko/services/welcomer-backgrounds`):
    - Checks uploads by their bytes: PNG/JPEG/WebP/GIF, at most 2 MB and 4096 px a side.
    - Names files `<guild>_<kind>_<hash16>.<format>` and reads or deletes only names of that shape.
    - Prunes a guild's older uploads.
  - `WelcomerService.loadBackground(row)` returns the upload or the fetched link as bytes, or null. `renderCard` takes `background: Buffer` and no longer fetches URLs itself. The message fills every `{user}`/`{server}`/`{memberCount}` (it used to replace only the first) and shrinks to fit.
- **Guild config:** `welcome` and `farewell` modules (`enabled`, `channelId`, `messageTemplate`, `textColor`, `backgroundUrl`).
  - The store reads legacy values in a form the schema accepts, so a bad old color never blocks a save.
  - A link clears the upload. The store's `check` refuses private links before the transaction.
- **Bot:** `/welcomer` and `/farewell` share `runWelcomerCardCommand` with the same checks: a text channel of the server, `#rrggbb`, a 1 to 200 character message, a public link.
  - A link replaces an upload and deletes old files.
  - It now replies once (it used to reply twice to a slash command).
  - The listener loads backgrounds through `loadBackground`.
- **Web:**
  - `WelcomerBackgroundService` (upload, remove, prune) writes the card and an audit entry (`welcomer.<kind>.background_upload|remove`) in one transaction.
  - The card page shows a server-rendered preview (a dynamic import of `@ririko/services/welcomer`), the settings form, and upload and remove forms.
  - `next.config.ts`: `@napi-rs/canvas` is added to `serverExternalPackages`, and `serverActions.bodySizeLimit` is `3mb`.

### Docs
- [dashboard.md](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md) §4 items 15, 16 and 17.
- [database.md](file:///Z:/Projects/ririko-v2-2026/docs/database.md) stream IDs, `free_game_channels` and `guild_welcomer`/`guild_farewell`.
- [deployment.md](file:///Z:/Projects/ririko-v2-2026/docs/deployment.md): the `welcomer_backgrounds` volume on bot and web.
- ADR-007 update on mentions, and a `.env.example` note that the dashboard reads the stream credentials.

## 2. Current State & Verification
- **Build and lint:** `pnpm build`, `pnpm -r typecheck` and the Next.js production build pass; the build lists `/dashboard/[guildId]/streams`, `/freegames`, `/welcome` and `/farewell`. ESLint: 0 errors, 587 warnings (589 before). `prettier --check` is clean on every changed file.
- **Full `vitest run`:** 238 files, 2120 tests, all passing. `factory.test.ts` timed out once under a parallel run and passed alone.
- **New tests:**
  - Handles, announcement formatting and mentions.
  - `StreamAlertService` on SQLite: uuid IDs, the 25 limit per guild, cross-guild refusal, audit.
  - Dispatcher `allowedMentions`; command subscribe, prefix arguments and unsubscribe.
  - `uuidV5` and the migration IDs.
  - The free games repository role, engine target, announcement mentions, command role and foreign role.
  - The `freegames`, `welcome` and `farewell` stores, including legacy values and a private link.
  - Remote image checks (redirect to 169.254.169.254, fe80::/10, size); the background store (types, size, traversal, prune); card rendering; command checks; the web background service; authorization coverage.
- **Real data check** on a backup copy of `data/ririko.sqlite` after `drizzle-kit push`:
  - `ririko guild:config` listed the new `freegames.*`, `welcome.*` and `farewell.*` keys with the guild's real welcome channel.
  - It set the free games channel and ping role, with audit rows from `cli:fariz`.
  - It refused `welcome.textColor red` and the links `http://127.0.0.1/x.png` and `http://169.254.169.254/latest`, and accepted `#FFAA00` (stored as `#ffaa00`).
- **Next runtime check** (a temporary page on `next start -p 3166`, since deleted): the card rendered with the external `@napi-rs/canvas`, and a link to 169.254.169.254 was not loaded.
- **Not verified:**
  - Postgres: Docker was not running, so the uuid inserts ran on SQLite only.
  - The real pages while signed in.
  - In Discord: a live stream announcement with a role, a free game announcement with a role, and welcome/farewell cards with an uploaded background.

## 3. Roadblocks, Gotchas & Decisions Made
- **Existing databases need `pnpm db:push`** for `free_game_channels.mention_role_id` and `background_file` on both card tables. The user's dev server on :3000 needs it and a restart (`next.config.ts` changed).
- **Deployment:** mount `storage/welcomer-backgrounds` in both the bot and the web container. Without a shared volume, the bot does not find dashboard uploads and draws the default background.
- **DNS rebinding** between the address check and the fetch is still possible (no IP pinning). Redirects are checked on every hop.
- **No unique index on `stream_subscriptions(guild_id, streamer_id)` or `streamers(platform, platform_user_id)`.** Existing duplicates would break `db:push`; the check-then-insert race stays.
- **Migrated 1.4.0 streamers** have `username` = the numeric Twitch user ID, so Twitch's batch check by login misses them. This was already true before this story; re-subscribing with `/stream` fixes a streamer.
- **Twitch batch checks** cover only the first 100 streamers (`twitch.adapter.ts`). This was already true before this story.
- **CLI changes to a background link** leave an old upload on disk until the next dashboard save or upload prunes it.
- **Old IDs stay valid:** existing SQLite rows with text IDs like `twitch_123` keep working; new rows get uuids.
- **`apps/web/AGENTS.md`/`CLAUDE.md`** come from the user's dev server and are not committed.

## 4. Actionable Next Steps for Next Session / Continuing Agent
1. Run `pnpm db:push` on every existing database, restart `pnpm dev:web`, then check signed in as a server manager:
   1. **Stream Alerts:** add a Twitch and a YouTube streamer with a role and a message with a line break. Check that the live announcement pings only that role. Check that `/stream list` shows both.
   2. **Free Games:** set a channel and a ping role, and check the next announcement.
   3. **Welcome & Farewell:** upload a background, check the preview, join and leave with a test account, then set a link and check that the upload file is gone.
2. Run the stream repository and service against Postgres once Docker or a server is available.
3. Review and open a PR for `feat/STORY-166-stream-freegames-welcome` into `develop/2.0.0`.
4. Next: STORY-112.
