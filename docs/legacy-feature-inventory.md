# Legacy Feature & Architecture Inventory (Ririko 1.4.0 -> 2.0.0)

## 1. Executive Summary
This document provides an exhaustive audit of the Ririko AI legacy codebase (version 1.4.0, located at `.local/RirikoBot`). Every command, database entity, scheduled task, background service, asset, and configuration parameter is inventoried, evaluated, and mapped to a definitive action for Ririko AI 2.0.0.

### Action Legend:
- **KEEP**: Preserve the exact interface, parameters, and user-facing behavior while modernizing internal typing and error handling.
- **REWORK**: Redesign the underlying implementation to eliminate technical debt, enhance reliability, or add modern features while maintaining backward compatibility.
- **REPLACE**: Swap out legacy third-party dependencies or engines with modern, production-grade 2026 alternatives.
- **MERGE**: Consolidate duplicated or fragmented commands into a unified subcommand or module.
- **DEPRECATE**: Phase out obsolete or insecure mechanisms with a safe backward-compatibility fallback.

---

## 2. Command Inventory (All 141 Legacy Commands)

### 2.1. AI Commands (2 commands)
| Command | Category | Legacy Behavior (1.4.0) | Action | Target in 2.0 | Modernization Details |
|---|---|---|---|---|---|
| `ai` | AI | Invokes LLM chat; streamed replies; memory stored in ephemeral RAM array; post-reply regex triggers `🎵` music play. | **REWORK** | `packages/ai`, `apps/bot` | Implement persistent conversation memory, multi-provider adapter (Gemini, OpenAI, Ollama), structured tool calling instead of regex, per-channel auto-respond. |
| `ai-model` | AI | Sets guild AI model in `guild_config` (`ai_model`). | **REWORK** | `packages/ai`, `apps/bot` | Support model selection per provider (e.g. Gemini 2.5 Flash, GPT-4o-mini, Llama 3.3) with autocomplete. |

### 2.2. Anime Commands (5 commands)
| Command | Category | Legacy Behavior (1.4.0) | Action | Target in 2.0 | Modernization Details |
|---|---|---|---|---|---|
| `anime` | Anime | Searches anime via Jikan API v4, renders select menu, displays MAL details embed. | **KEEP** | `packages/services/anime` | Modernize rate-limit handling for Jikan API, add caching layer (Redis/in-memory) to prevent HTTP 429. |
| `anime-character` | Anime | Searches anime character via Jikan API v4, displays character details embed. | **KEEP** | `packages/services/anime` | Add image caching and rich pagination. |
| `manga` | Anime | Searches manga via Jikan API v4, displays manga details embed. | **KEEP** | `packages/services/anime` | Standardize select menu UI and cached responses. |
| `waifu` | Anime | Fetches random anime waifu image from `api.waifu.im/search`. | **REWORK** | `packages/services/anime` | Keep command as quick selfie generator; bridge to new flagship Waifu TCG card claim system. |
| `wallpaper` | Anime | Scrapes wallpapers from WallHaven, Wallpapers.com, MoeWalls, Pinterest, ZeroChan. | **REWORK** | `packages/services/anime` | Replace fragile cheerio/Puppeteer web scrapers with robust REST APIs or resilient fallback scrapers. |

### 2.3. Economy & Profile Commands (2 commands)
| Command | Category | Legacy Behavior (1.4.0) | Action | Target in 2.0 | Modernization Details |
|---|---|---|---|---|---|
| `balance` | Economy | Displays user wallet coins. | **REWORK** | `packages/services/economy` | Expand to display Wallet, Bank, Net Worth, Daily Streak, and Karma XP with interactive deposit/withdraw buttons. |
| `profile` | Economy | Generates visual rank card image using `node-canvas` displaying level, karma, badges, presence, and custom background. | **REWORK** | `packages/services/economy`, `packages/graphics` | Rewrite canvas renderer using `@napi-rs/canvas` (no native cairo/pango compilation required), support WebP/PNG, cached Discord badges. |

### 2.4. Games Commands (3 commands)
| Command | Category | Legacy Behavior (1.4.0) | Action | Target in 2.0 | Modernization Details |
|---|---|---|---|---|---|
| `coin-flip` | Games | Flips coin (heads/tails) via simple `Math.random()`. | **REWORK** | `packages/services/games` | Integrate with `MiniGame` engine: add solo/PvP wagering, animated flips, stats tracking. |
| `dice` | Games | Rolls random 1-6 dice. | **REWORK** | `packages/services/games` | Support multi-dice notation (`2d6`, `1d20`, `1d100`), PvP high-roll wagering, embed art. |
| `highlow` | Games | Number guessing game (1-100) using 15s text message collector. | **REWORK** | `packages/services/games` | Replace raw text collector with interactive Higher / Lower / Equal Discord buttons, streak multipliers, coin payouts. |

### 2.5. General Commands (4 commands)
| Command | Category | Legacy Behavior (1.4.0) | Action | Target in 2.0 | Modernization Details |
|---|---|---|---|---|---|
| `get-avatar` | General | Fetches avatar URL of target user or author. | **KEEP** | `apps/bot/commands/general` | Preserve parity; add server-specific avatar support and format selection (PNG, WebP, GIF). |
| `help` | General | Displays paginated category help embed. | **REWORK** | `apps/bot/commands/general` | Dynamic metadata-driven help system with interactive category select menus and autocomplete search. |
| `ping` | General | Displays WebSocket ping and message roundtrip latency. | **KEEP** | `apps/bot/commands/general` | Add database query latency, voice connection latency, and uptime formatting. |
| `reminder` | General | Creates, lists, or cancels reminders via chrono date parsing. | **REWORK** | `packages/services/reminder` | Store reminders in Drizzle database with recurring support (`daily`, `weekly`), timezone awareness, and resilient cron dispatch. |

### 2.6. Giveaway Commands (5 commands)
| Command | Category | Legacy Behavior (1.4.0) | Action | Target in 2.0 | Modernization Details |
|---|---|---|---|---|---|
| `giveaway create` | Giveaway | Creates giveaway using `discord-giveaways` with JSON flat-file storage (`giveaways.json`). | **REPLACE** | `packages/services/giveaways` | Replace `discord-giveaways` flat-file with database-backed giveaway engine. Survive bot restarts, support multi-winner and role requirements. |
| `giveaway delete` | Giveaway | Deletes giveaway from `giveaways.json`. | **REWORK** | `packages/services/giveaways` | Database-backed deletion and message cleanup. |
| `giveaway edit` | Giveaway | Edits prize, winners, or duration of giveaway. | **REWORK** | `packages/services/giveaways` | Modal-based or option-based editing with instant embed updates. |
| `giveaway end` | Giveaway | Immediately terminates giveaway and rolls winners. | **REWORK** | `packages/services/giveaways` | Atomic database state transition from `active` to `ended`, instant winner calculation. |
| `giveaway reroll` | Giveaway | Picks new winner(s) for an ended giveaway. | **REWORK** | `packages/services/giveaways` | Re-queries reaction/entry table excluding previous winners. |

### 2.7. Guild & Server Configuration Commands (10 commands)
| Command | Category | Legacy Behavior (1.4.0) | Action | Target in 2.0 | Modernization Details |
|---|---|---|---|---|---|
| `guild-info` | Guild | Displays server owner, member count, creation date. | **KEEP** | `apps/bot/commands/guild` | Preserve and enhance with boost status, channel breakdown, and security level. |
| `member-info` | Guild | Displays member join date, roles, permissions. | **KEEP** | `apps/bot/commands/guild` | Add badges, karma/XP level, and moderation history summary for staff. |
| `prefix` | Guild | Sets custom prefix in `guild.prefix` table. | **KEEP** | `packages/database`, `apps/bot` | Cache guild prefixes in-memory to prevent DB queries on every Discord message. |
| `karma` | Guild | Enables/disables karma notifications for user or server. | **REWORK** | `packages/services/economy` | Modernize subcommands (`view`, `enable`, `disable`, `server`) and link with leveling system. |
| `welcomer` | Guild | Configures welcome channel, toggle, and background image. | **REWORK** | `packages/services/guild` | Migrate config to structured `guild_settings` table, replace `node-canvas` welcome card with `@napi-rs/canvas`. |
| `farewell` | Guild | Configures farewell channel, toggle, and background image. | **REWORK** | `packages/services/guild` | Migrate config to structured `guild_settings` table, modernized card generator. |
| `free-games` | Guild | Toggles free game notifications channel. | **REWORK** | `packages/services/free-games` | Expand source filters (Epic Games, Steam, GOG), embed preview. |
| `setup-avc` | Guild | Configures Auto Voice Channel (Join to Create) parent channel. | **REWORK** | `packages/services/avc` | Ensure instant channel cleanup, permission cloning, and dynamic room name customization. |
| `create-reaction-role`| Guild | Binds an emoji on a message to a Discord role. | **REWORK** | `packages/services/reaction-role` | Add button-based reaction roles alongside legacy emoji reactions, limit checking. |
| `reaction-roles` | Guild | Lists active reaction roles for the guild. | **KEEP** | `packages/services/reaction-role` | Interactive paginated list with remove buttons. |

### 2.8. Meme Commands (11 commands)
| Command | Category | Legacy Behavior (1.4.0) | Action | Target in 2.0 | Modernization Details |
|---|---|---|---|---|---|
| `0days` | Meme | Generates "0 Days Without Accidents" meme with custom text. | **KEEP** | `packages/graphics/memes` | Modernize canvas engine to `@napi-rs/canvas`, auto-wrap text, keep all 80+ templates in `assets/memes`. |
| `allmyhomies` | Meme | Generates "All My Homies Hate X" meme. | **KEEP** | `packages/graphics/memes` | Same modernized text-rendering pipeline. |
| `always-been` | Meme | Generates "Wait, it's all X? Always has been" astronaut meme. | **KEEP** | `packages/graphics/memes` | Same modernized text-rendering pipeline. |
| `american-chopper` | Meme | Generates 5-panel American Chopper argument meme. | **KEEP** | `packages/graphics/memes` | Same modernized text-rendering pipeline. |
| `chad` | Meme | Generates GigaChad meme with custom text. | **KEEP** | `packages/graphics/memes` | Same modernized text-rendering pipeline. |
| `everywhere` | Meme | Generates Buzz Lightyear "X, X Everywhere" meme. | **KEEP** | `packages/graphics/memes` | Same modernized text-rendering pipeline. |
| `getting-paid` | Meme | Generates "You guys are getting paid?" meme. | **KEEP** | `packages/graphics/memes` | Same modernized text-rendering pipeline. |
| `got-any-more` | Meme | Generates "Y'all got any more of them X" Dave Chappelle meme. | **KEEP** | `packages/graphics/memes` | Same modernized text-rendering pipeline. |
| `train-bus` | Meme | Generates train hitting school bus meme. | **KEEP** | `packages/graphics/memes` | Same modernized text-rendering pipeline. |
| `undertaker` | Meme | Generates AJ Styles / Undertaker meme. | **KEEP** | `packages/graphics/memes` | Same modernized text-rendering pipeline. |
| `woman-yelling-at-cat`| Meme| Generates woman yelling at confused cat meme. | **KEEP** | `packages/graphics/memes` | Same modernized text-rendering pipeline. |

### 2.9. Moderation Commands (6 commands)
| Command | Category | Legacy Behavior (1.4.0) | Action | Target in 2.0 | Modernization Details |
|---|---|---|---|---|---|
| `admin-note` | Moderation | Adds, removes, lists admin notes per user in guild. Has user & chat context menu entries. | **REWORK** | `packages/services/moderation` | Store audit history of who edited/deleted notes, add search, preserve context menu shortcuts. |
| `ban` | Moderation | Bans member with reason. | **REWORK** | `packages/services/moderation` | Log case to `moderation_cases` table, dispatch log to mod log channel, check hierarchy permissions. |
| `kick` | Moderation | Kicks member with reason. | **REWORK** | `packages/services/moderation` | Case logging, role hierarchy check, DM notification to kicked user. |
| `delete` | Moderation | Purges N messages (bulk delete up to 100). | **REWORK** | `packages/services/moderation` | Support filtering by user, bot, embeds, or keyword, log purged count to mod log channel. |
| `lock` | Moderation | Locks channel by disabling `SendMessages` permission. | **REWORK** | `packages/services/moderation` | Save previous permissions so `unlock` accurately restores them rather than forcing global allow. |
| `unlock` | Moderation | Unlocks previously locked channel. | **REWORK** | `packages/services/moderation` | Accurately restores prior channel permission state. |

### 2.10. Music Commands (17 commands)
| Command | Category | Legacy Behavior (1.4.0) | Action | Target in 2.0 | Modernization Details |
|---|---|---|---|---|---|
| `play` | Music | Plays audio via DisTube / LavaShark, searches YouTube. | **REPLACE** | `packages/music` | Replace DisTube with modern extractor pipeline (YouTube, Spotify, SoundCloud, Bandcamp, Direct Stream). |
| `pause` | Music | Pauses active track. | **KEEP** | `packages/music` | Update interactive now-playing buttons reactively. |
| `skip` | Music | Skips active track. | **KEEP** | `packages/music` | Add vote-skip support if non-DJ. |
| `stop` | Music | Stops playback and clears queue. | **KEEP** | `packages/music` | Clean voice state and topic. |
| `queue` | Music | Displays current track queue with pagination. | **REWORK** | `packages/music` | Interactive paginated embed with total queue duration and remove buttons. |
| `volume` | Music | Adjusts guild player volume (0-100%). | **KEEP** | `packages/music` | Persistent volume per guild, smooth software gain control. |
| `back` | Music | Plays previous track. | **KEEP** | `packages/music` | Re-indexes previous track from queue history. |
| `filter` | Music | Applies audio filters (bassboost, nightcore, 8D, etc.). | **REWORK** | `packages/music` | Use FFmpeg realtime audio filter pipeline. |
| `join` | Music | Joins user voice channel without playing. | **KEEP** | `packages/music` | Permission check, voice connection state binding. |
| `leave` | Music | Leaves voice channel and clears queue. | **KEEP** | `packages/music` | Graceful audio stream destruction. |
| `lyrics` | Music | Fetches song lyrics. | **REWORK** | `packages/music` | Use Genius / Musixmatch API with fallback search. |
| `mute` | Music | Sets volume to 0% or restores previous volume. | **KEEP** | `packages/music` | Volume toggle state preserved. |
| `playlist` | Music | Creates, plays, or lists user custom playlists from database. | **REWORK** | `packages/music`, `packages/database` | Migrate `playlist` and `track` entities to Drizzle, support public/private sharing and import from Spotify. |
| `playtop` | Music | Inserts track at the top of the queue. | **KEEP** | `packages/music` | Shift track to position 0 in queue. |
| `repeat` | Music | Toggles loop mode (Off, Song, Queue). | **KEEP** | `packages/music` | Update now-playing interactive button state. |
| `rewind` | Music | Rewinds current track by N seconds. | **KEEP** | `packages/music` | Seek stream position without restarting track. |
| `setup-music` | Music | Creates dedicated persistent music channel with player controls. | **REWORK** | `packages/music` | Replace 10-second polling interval with event-driven updates on track change / interaction. |

### 2.11. Reactions Commands (60 commands)
All 60 reaction commands subclass `ReactBase` and fetch anime reaction GIFs from `api.otakugifs.xyz`:
`airkiss`, `angrystare`, `bite`, `bleh`, `blush`, `brofist`, `celebrate`, `cheers`, `clap`, `confused`, `cool`, `cry`, `cuddle`, `dance`, `drool`, `evillaugh`, `facepalm`, `handhold`, `happy`, `headbang`, `hug`, `kiss`, `laugh`, `lick`, `love`, `mad`, `nervous`, `no`, `nom`, `nosebleed`, `nuzzle`, `panic`, `pat`, `peck`, `poke`, `pout`, `punch`, `run`, `sad`, `scared`, `scream`, `shrug`, `shy`, `sigh`, `sip`, `slap`, `sleep`, `slowclap`, `smack`, `smile`, `smug`, `stare`, `stop`, `surprised`, `sweat`, `thumbsup`, `tickle`, `tired`, `wave`, `wink`, `yawn`, `yes`.
- **Action**: **KEEP**.
- **Target in 2.0**: `packages/services/reactions`.
- **Modernization**: Retain all 60 commands. Replace per-command file duplication with a unified metadata-driven command factory or lightweight subclasses. Add fallback GIF cache if `otakugifs.xyz` is unreachable.

### 2.12. Stable Diffusion / Image Generation Commands (3 commands)
| Command | Category | Legacy Behavior (1.4.0) | Action | Target in 2.0 | Modernization Details |
|---|---|---|---|---|---|
| `imagine` | StableDiffusion| Calls Replicate API using plaintext token from `Configuration` entity; prompts queued in RAM. | **REPLACE** | `packages/services/image-generation` | Multi-backend adapter (Google Gemini Imagen, ComfyUI/Local, Replicate, HuggingFace). Encrypted secrets, persistent job queue, user cooldowns. |
| `setup-stablediffusion-api`| StableDiffusion| Saves Replicate API key in plaintext in DB. | **DEPRECATE** | `apps/bot`, `packages/services/security` | Discontinue plaintext DB secret storage. Move to encrypted credentials vault or environment variable injection. |
| `stablediffusion-model`| StableDiffusion| Saves guild default image model name in DB. | **REWORK** | `packages/services/image-generation` | Support preset models (Anime, Photoreal, Pixel Art) per guild. |

### 2.13. Twitch / Streamer Commands (5 commands)
| Command | Category | Legacy Behavior (1.4.0) | Action | Target in 2.0 | Modernization Details |
|---|---|---|---|---|---|
| `setup-twitch-api` | Twitch | Stores Twitch Client ID & Secret in plaintext in DB. | **DEPRECATE** | `packages/services/security` | Move to environment variables (`TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`). |
| `setup-twitch` | Twitch | Configures guild notification channel. | **REWORK** | `packages/services/stream-platforms` | Expand into general stream notification channel for Twitch, YouTube Live, TikTok Live. |
| `subscribe` | Twitch | Subscribes guild channel to a streamer's live alerts. | **REWORK** | `packages/services/stream-platforms` | Multi-platform support, idempotency key recording, thumbnail caching. |
| `unsubscribe` | Twitch | Unsubscribes from streamer alerts. | **REWORK** | `packages/services/stream-platforms` | Clean up subscriptions without leaving orphan notifications. |
| `twitch-status` | Twitch | Displays subscription list and API connection status. | **REWORK** | `packages/services/stream-platforms` | Paginated status embed with live indicator and last notification timestamp. |

---

## 3. Database Entities & Migration Mapping (17 Legacy Entities)

| # | Legacy Entity | Columns in 1.4.0 | Target in 2.0 (Drizzle) | Migration Strategy & Action |
|---|---|---|---|---|
| 1 | `User` | `id`, `username`, `displayName`, `backgroundImageURL`, `karma`, `coins`, `pointsSuspended`, `commandsSuspended`, `doNotNotifyOnLevelUp`, `warns`, `createdAt`, `updatedAt` | `users`, `economy_balances` | Migrate to `users` core table. Map `coins` to `economy_balances.wallet_balance`, `karma` to `economy_balances.xp` and `karma`. No data loss. |
| 2 | `Guild` | `id`, `name`, `prefix` | `guilds` | Migrate to `guilds` table with `id`, `name`, `prefix`, `joined_at`. |
| 3 | `GuildConfig` | `id`, `name`, `value`, `guildId` | `guild_settings` | Pivot key-value pairs into structured JSON or typed columns (`welcomer_*`, `farewell_*`, `karma_enabled`, etc.). |
| 4 | `Configuration` | `applicationId`, `twitchClientId`, `twitchClientSecret`, `stableDiffusionType`, `stableDiffusionApiToken` | **DEPRECATE / VAULT** | Deprecate table. Do not migrate plaintext API secrets. Migrate to secure encrypted vault or env vars. |
| 5 | `UserNote` | `id`, `note`, `createdBy`, `userId`, `guildId`, `createdAt`, `updatedAt` | `moderation_notes` | Migrate 100% of admin notes to `moderation_notes` table preserving author, timestamps, and relations. |
| 6 | `VoiceChannel` | `id`, `name`, `parentId`, `guildId` | `avc_channels` | Migrate parent and active child channels to `avc_channels`. |
| 7 | `MusicChannel` | `id`, `name`, `guildId` | `music_channels` | Migrate dedicated music channels to `music_channels`. |
| 8 | `Playlist` | `id`, `name`, `userId`, `author`, `authorTag`, `public`, `plays`, `guildId` | `music_playlists` | Migrate custom playlists to `music_playlists` with ownership intact. |
| 9 | `Track` | `id`, `name`, `url`, `playlistId` | `music_playlist_tracks` | Migrate tracks preserving order and playlist relations. |
| 10 | `StreamSubscription` | `id`, `twitchUserId`, `channelId`, `guildId` | `stream_subscriptions` | Migrate with `platform = 'twitch'`. |
| 11 | `StreamNotification` | `id`, `twitchUserId`, `streamId`, `channelId`, `notified`, `guildId` | `stream_notifications` | Migrate to notification idempotency table. |
| 12 | `TwitchStreamer` | `twitchUserId`, `isLive` | `stream_creators` | Normalize into multi-platform creator status cache. |
| 13 | `ReactionRole` | `id`, `messageId`, `emoji`, `roleId`, `guildId` | `reaction_roles` | Migrate all message-to-role bindings. |
| 14 | `Reminder` | `id`, `userId`, `channelId`, `guildId`, `message`, `scheduledTime`, `sent`, `repeat` | `reminders` | Migrate pending and historical reminders. |
| 15 | `FreeGameNotification`| `id`, `gameId`, `gameName`, `source`, `notified`, `guildId` | `free_game_notifications` | Migrate past notifications to prevent re-alerts. |
| 16 | `Item` | `id`, `name`, `price`, `description`, `rarity`, `imageUrl`, etc. | `economy_items` | Standardize item definitions for shop and inventory. |
| 17 | `ItemCategory` | `id`, `name` | `economy_item_categories` | Migrate item categories. |

---

## 4. Background Schedulers & Timers Inventory

| Service | Legacy Mechanism | Problem in 1.4.0 | Target in 2.0 | Modern Solution |
|---|---|---|---|---|
| `TwitchService` | `@Cron(CronExpression.EVERY_MINUTE)` | Hardcoded 60s poll; uncached thumbnails; single platform. | `packages/services/stream-platforms` | Adaptive polling with rate limit awareness, EventSub webhooks, thumbnail asset CDN proxying. |
| `FreeGamesService`| `@Cron(CronExpression.EVERY_HOUR)` | Cheerio scraping Steam directly; unhandled scraper failures. | `packages/services/free-games` | Scheduled task using official Epic promotions API + Steam Store REST API with resilient fallback. |
| `ReminderScheduler`| `@Cron(CronExpression.EVERY_30_SECONDS)` | In-memory timer querying DB every 30s. | `packages/services/reminder` | Precision job scheduler (BullMQ / PgBoss or lightweight cron) with accurate delivery timestamps. |
| `MusicService` | `setInterval(10000)` per active guild | Polls Discord API every 10 seconds to edit embed! Hits Discord rate limits (429). | `packages/music` | **Eliminated**. Embeds updated purely on track transition, player events, or user button interactions. |
| `GiveawaysService`| `discord-giveaways` internal loop | Kept state in `giveaways.json` flat file. Corrupted easily on crash. | `packages/services/giveaways` | Database-backed schedule with automated end-time resolution. |
