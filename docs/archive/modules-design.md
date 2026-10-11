# Ririko 2.0 Module System & Feature Specifications

## 1. Overview & Isolation Architecture
Ririko AI 2.0.0 is organized into cohesive, independently configurable **Domain Modules**. Each module encapsulates its commands, event listeners, background schedulers, and database repositories. Server administrators can selectively enable or disable any module per guild via the web dashboard or CLI.

---

## 2. Core Modules Catalog

### 2.1. Automatic Role System (Section 13)
Provides flexible, automated role provisioning:
- **Join Roles**: Instant autorole for new human members or bot accounts upon joining.
- **Verification Roles**: Automatic role assignment after completing Discord onboarding or captcha verification.
- **Interactive Component Roles**: Button roles, reaction roles, and dropdown select-menu roles.
- **Role Groups & Exclusivity**: Mutually exclusive role sets (e.g. selecting "Color Red" automatically strips "Color Blue").
- **Tiered Roles**: Progression-based roles unlocked by XP level, economy net worth, or voice chat milestones.
- **Temporary Roles**: Time-limited role grants that automatically expire.

### 2.2. Giveaways 2.0 (Section 16)
Replaces fragile flat-file JSON libraries with an enterprise database-backed engine:
- **Configurable Entry Gates**: Minimum Discord account age, minimum guild membership tenure, required roles, blacklisted roles.
- **Interactive Entry**: Button-based entry with real-time entry count feedback.
- **Weighted Bonus Entries**: Server boosters or active chatters earn higher roll weights.
- **Lifecycle Controls**: Early termination, automated reroll, cancellation, and winner history.
- **Crash Recovery**: Active giveaways resume seamlessly across bot restarts without dropping participants or duplicating winner announcements.

### 2.3. Auto Voice Channels 2.0 (Section 17)
Temporary dynamic voice channel generator:
1. Member joins designated **"Join to Create"** parent voice channel.
2. Bot instantly provisions a temporary voice channel with configurable name template (e.g. `🔊 {user}'s Lounge`).
3. User is moved to the new channel and granted channel owner permissions.
4. Channel owner can manage channel settings (rename, lock, set user limit, set bitrate, transfer ownership, kick members).
5. When all members leave, the temporary channel is automatically deleted.
6. **Orphan Cleanup**: On bot reboot, any orphaned temporary channels left behind by a crash are cleanly detected and pruned.

### 2.4. Interactive Mini-Games Suite (Section 37)
Built on an extensible `MiniGame` session engine:
- **Tic Tac Toe**: Interactive 3x3 button grid against an unbeatable Minimax AI or human PvP.
- **Rock Paper Scissors**: Ephemeral button selection for secret choices in PvP or against Ririko.
- **High / Low**: Card prediction wager game.
- **Coin Flip & Dice**: Solo and PvP wager games with verified deterministic random number generation.
- **Wager Escrow**: PvP matches hold wagers in database escrow until game conclusion.

### 2.5. Social & Community Modules
- **Anime & Manga Search**: AniList and Jikan API search for anime synopsis, staff, characters, and airing schedules.
- **Anime Reactions Engine**: All 60 legacy anime reaction animations powered by OtakuGIFs.
- **Meme Synthesis Engine**: All 11 meme generators rendered dynamically via `@napi-rs/canvas`.
- **Welcomer & Farewell**: High-resolution welcome banners featuring user avatars, member counts, and customizable background graphics.
  - **Optional text message**: each card can also send a text message in the same Discord message as the card (`guild_welcomer` and `guild_farewell` columns `text_message_enabled` and `text_message`, off and empty by default). Set it on the dashboard Welcome and Farewell pages (checkbox "Also send a text message" and a text box), with `/welcomer text:<message>` and `/farewell text:<message>` (`text:none` turns it off and keeps the stored message; the prefix forms are `!welcomer text <message>` and `!welcomer text none`), or with `ririko guild:config <guild> welcome.textMessage` / `welcome.textMessageEnabled` (and `farewell.*`). The message is trimmed and at most 2000 characters; turning it on with an empty message is refused everywhere.
  - **Placeholders**: `{user}`, `{username}`, `{server}` and `{memberCount}`. In the welcome text `{user}` is a mention of the new member; in the farewell text `{user}` is the plain username. `{username}` is always the plain username. Values are inserted as plain text, so a name that contains `#general` is never turned into a link.
  - **`#channel-name`**: a word like `#rules` that names a channel of the server (case-insensitive, whole word) becomes a channel mention (`<#id>`). Text that already holds `<#id>` is sent as it is, and any other `#word` stays as typed. The dashboard preview shows the filled text under the card, with `#names` left as typed.
  - **No pings**: the welcome send allows only the joining member as a user mention and the farewell send allows no mentions, so `@everyone`, `@here` and role mentions in the template never ping. The filled text is cut to Discord's 2000 characters. With the text off, the bot sends only the card.
- **Persistent Reminders**: User reminders parsed via natural language (`!remindme in 2 hours to study`) surviving bot reboots.

---

## 3. Feature Flags & Configuration Toggles

Every major subsystem is controlled by a typed feature flag in `guild_settings`:
- `music.enabled`
- `ai.enabled`
- `economy.enabled`
- `waifu.enabled`
- `moderation.enabled`
- `imageGeneration.enabled`
- `giveaways.enabled`
- `autoVoice.enabled`
- `streamAlerts.enabled`
- `freeGames.enabled`

When a module is disabled, its commands are automatically unregistered or blocked by middleware, and its background jobs skip the guild.

---

## 4. Optional Future Modules (Section 84)
Designed with clean extension points for post-2.0 releases:
- Starboard
- Custom Embed Builder
- Server Counters & Statistics Channels
- Member Milestones & Birthday Tracker
- Suggestion System with Upvotes
- Discord Support Ticket System
