# Ririko AI 2.0.0 — Full Platform Rework

You are the lead architect, principal engineer, DevOps engineer, security engineer, database architect, Discord
engineer, AI engineer, web engineer and technical project manager for the complete redevelopment of Ririko AI.

Repository:

`https://github.com/RirikoAI/RirikoBot`

The existing repository is the old Ririko AI Discord bot, currently version 1.4.0 on the `master` branch.

The goal is to create **Ririko AI 2.0.0**.

This is **not** a simple dependency upgrade.

Treat this as a controlled modernization and partial re-architecture of an established production Discord bot while
preserving the existing functionality users already know.

---

# 0. Absolute Rules

Before modifying significant code, understand the repository.

Do NOT immediately start rewriting files.

Do NOT discard existing features because they appear old.

Do NOT blindly preserve the existing architecture merely because it exists.

Do NOT assume NestJS must remain.

Do NOT assume TypeORM must remain.

Do NOT replace working functionality with placeholders.

Do NOT remove a feature just because it is not mentioned in the new feature list.

Do NOT invent a migration that silently loses data.

Do NOT put every feature into one giant service.

Do NOT create an over-engineered enterprise architecture for the sake of architecture.

Use the KISS principle while still designing proper extension points.

The final system must be easy for another developer to understand six months from now.

The final system must make it easy for a developer to add a new provider, command, event handler, game, AI provider,
image provider, social platform, music source or dashboard module without touching unrelated parts of the system.

---

# 1. FIRST TASK: AUDIT THE EXISTING REPOSITORY

Before implementing Ririko 2.0, perform a complete repository audit.

You have access to the source repository.

Inspect:

* package.json
* package-lock.json
* TypeScript configuration
* ESLint
* Prettier
* Docker
* Docker Compose
* Render configuration
* CI configuration
* database migrations
* entities
* services
* controllers
* commands
* command base classes
* command registration
* prefix handling
* slash command handling
* reaction handlers
* event handlers
* schedulers
* API integrations
* AI providers
* music implementation
* Twitch implementation
* image generation
* giveaways
* economy
* EXP
* rankings
* cards/profile rendering
* auto voice channel
* welcome/farewell
* reaction roles
* free games
* anime features
* memes
* reminders
* CLI
* test suite
* assets
* public/dashboard-related files
* environment configuration
* deployment configuration

Search the entire repository.

Do not rely solely on README documentation.

Create a feature inventory containing:

| Feature | Existing implementation | Existing commands | Existing database structures | Existing APIs | Existing behavior | Keep/replace/rework |
|---------|-------------------------|-------------------|------------------------------|---------------|-------------------|---------------------|

Also create:

`docs/legacy-feature-inventory.md`

This document must be the authoritative checklist for feature parity.

Every existing feature must receive one of:

* KEEP
* REWORK
* REPLACE
* MERGE
* DEPRECATE WITH COMPATIBILITY PATH

Do not delete a feature silently.

---

# 2. CREATE THE AI ENGINEERING TEAM FIRST

Before doing substantial implementation, create the Gemini project-agent structure.

Use Gemini CLI's current project-level agent system.

Create:

`.gemini/agents/`

Create specialist agents approximately like:

* `legacy-auditor.md`
* `architecture.md`
* `discord.md`
* `database.md`
* `music.md`
* `ai.md`
* `moderation.md`
* `image-generation.md`
* `stream-platforms.md`
* `economy.md`
* `waifu-tcg.md`
* `games.md`
* `dashboard.md`
* `security.md`
* `testing.md`
* `devops.md`
* `code-reviewer.md`
* `migration.md`

Each agent must have:

* YAML frontmatter
* clear responsibility
* constraints
* preferred tools
* expected output
* what it must NOT modify
* relevant files/documentation to inspect

Agents should specialize rather than duplicate the work of the main agent.

The main agent should delegate substantial investigations to the relevant specialists.

Do not create dozens of trivial agents.

Approximately 12–16 useful specialist agents is preferable to 50 noisy agents.

---

# 3. CREATE PROJECT-LEVEL AGENT INSTRUCTIONS

Create:

`GEMINI.md`

and, where useful:

`AGENTS.md`

If Gemini CLI in the current version allows `AGENTS.md` to participate directly in context loading, configure that
appropriately.

The documentation must explain:

* project purpose
* architecture
* coding rules
* testing rules
* database rules
* adapter rules
* Discord rules
* security rules
* migration rules
* commands
* package management
* release process
* how to create a new feature
* how to create a new command
* how to create a provider adapter
* how to create a new dashboard module
* how to create a migration
* how to add tests
* how to create/update documentation

Keep `GEMINI.md` focused.

Use imported modular documentation rather than making one enormous context file.

---

# 4. CREATE A MODERN PROJECT STRUCTURE

Do not force NestJS into 2.0 if it provides little value.

Prefer a simple modular architecture.

A reasonable starting point is:

```text
apps/
  bot/
  dashboard/
  api/

packages/
  core/
  database/
  discord/
  commands/
  ai/
  music/
  moderation/
  economy/
  games/
  media/
  streams/
  image-generation/
  waifu/
  cards/
  shared/

tools/
  cli/

docs/

scripts/

tests/
```

You may change this structure if your audit demonstrates a better design.

The important requirement is not the exact folder names.

The important requirement is that:

* Discord-specific code is isolated
* domain logic does not depend directly on Discord.js
* API providers are adapters
* database access is not scattered everywhere
* commands call application services
* application services call domain logic
* integrations implement interfaces
* web dashboard code does not know implementation details of Discord features
* modules can be tested without starting Discord

Avoid excessive abstraction.

Do not create interfaces for classes that have no realistic alternate implementation.

Create adapters where provider replacement is realistically valuable.

---

# 5. TECHNOLOGY BASELINE

Target the latest production-ready technologies as of **2026-08-14**.

Do NOT blindly copy versions from this prompt.

At implementation time:

1. inspect official release information;
2. select stable releases;
3. avoid unnecessary prereleases;
4. document the exact chosen versions;
5. record why a significant technology was selected.

Preferred baseline:

* Node.js 24 LTS unless compatibility testing proves another supported LTS is better.
* TypeScript 6.x or the current stable supported TypeScript version.
* latest stable discord.js 14.x compatible with the selected Node version.
* ESM-first modern TypeScript.
* strict TypeScript.
* pnpm unless there is a strong reason not to use it.
* PostgreSQL for production.
* SQLite may be supported for development/small self-hosted deployments if practical.
* Drizzle or another lightweight SQL-first data layer is preferred over blindly carrying forward TypeORM.
* Next.js 16.x for dashboard.
* React current stable.
* modern CSS/UI system.
* Vitest or the current best-fit unit/integration test runner.
* Playwright for dashboard/E2E tests.
* Docker for deployment.
* GitHub Actions or the simplest equivalent CI.
* structured logging.
* environment validation at startup.
* runtime schema validation for external data.

Do not use an experimental framework merely because it is fashionable.

---

# 6. KISS + EXTENSIBILITY PRINCIPLE

Ririko must be developer-friendly.

A developer should be able to do something like:

```bash
ririko generate command
ririko generate module
ririko generate adapter
ririko generate migration
ririko generate game
ririko generate dashboard-module
```

or equivalent.

Create a CLI capable of scaffolding boilerplate.

The exact CLI syntax may differ.

The important requirement:

**boilerplate must become automation rather than tribal knowledge.**

Examples:

```text
generate:command
generate:event
generate:service
generate:adapter
generate:provider
generate:migration
generate:module
generate:game
generate:dashboard
generate:card
```

Document these commands.

---

# 7. COMMAND SYSTEM

Support BOTH:

1. Slash commands
2. Prefix commands

The same application command should be usable by both where appropriate.

Do not implement the business logic twice.

For example:

```text
User
 ├─ /play ...
 └─ !play ...

        ↓

Command parser / dispatcher

        ↓

Application command/service

        ↓

Domain logic
```

The system should support:

* guild-specific prefix
* default prefix
* configurable prefix
* aliases
* command permissions
* role permissions
* cooldowns
* rate limits
* command enable/disable per guild/channel
* hidden/internal commands
* owner-only commands
* moderator-only commands
* user-only commands

Commands should expose machine-readable metadata so the dashboard and help system can automatically discover them.

---

# 8. HELP SYSTEM

Replace the old help implementation with a modern interactive help system.

Requirements:

* categories
* pagination
* select menus
* command search
* command aliases
* command descriptions
* usage
* examples
* permissions
* cooldown
* prefix syntax
* slash syntax
* links to dashboard configuration
* dynamically generated from command metadata

Example conceptual structure:

```text
Ririko Help

[Search...]

[Category ▼]

General
AI
Music
Moderation
Economy
Games
Anime
Waifu TCG
Giveaways
Streams
Utilities
Server
```

Never maintain a manually duplicated command list.

The help system must consume the command registry.

---

# 9. RIRIKO 2.0 MODULE SYSTEM

Build the bot as modules.

Initial modules should include:

* Core
* Commands
* Moderation
* Auto Moderation
* Music
* AI
* Image Generation
* Economy
* EXP
* Ranking
* Cards
* Waifu TCG
* Games
* Giveaways
* Reaction Roles
* Auto Voice
* Streams
* Free Games
* Anime
* Memes
* Welcome
* Farewell
* Reminders
* Server Utilities
* Logging
* Dashboard Integration
* Analytics

Modules must be independently configurable.

A guild should be able to enable or disable modules.

---

# 10. MUSIC 2.0

Completely rework music.

Required sources:

* YouTube
* Spotify
* Deezer
* SoundCloud

Do not assume all providers stream directly in the same way.

Use a provider/extractor architecture.

Recommended conceptual model:

```ts
interface MusicSourceAdapter {
  readonly id: string;
  readonly name: string;
  
  canResolve(input: string): boolean;
  
  search(query: string): Promise<MusicSearchResult[]>;
  
  resolve(input: string): Promise<ResolvedTrack | ResolvedPlaylist>;
  
  healthCheck(): Promise<AdapterHealth>;
}
```

Do not couple the application directly to a single player implementation.

Use current Discord audio tooling.

Evaluate Discord Player 7.x and/or Lavalink as options.

The final architecture should support replacing the audio engine later.

Features:

* queue
* playlist
* search
* play
* pause
* resume
* skip
* previous
* replay
* stop
* volume
* seek
* loop
* shuffle
* move queue item
* remove queue item
* clear
* now playing
* lyrics
* filters/effects where practical
* autoplay
* queue persistence where useful
* per-guild player
* DJ role
* music channel
* voice channel restrictions
* inactivity disconnect
* queue import/export
* favorites
* saved playlists

The AI system must be able to invoke music actions safely.

Example:

> Ririko, play YOASOBI Idol

The AI should produce a structured tool call such as:

```text
music.play({
  guildId,
  userId,
  query: "YOASOBI Idol"
})
```

AI must NOT execute arbitrary shell commands or manipulate the player directly.

---

# 11. AI CHATBOT 2.0

Rebuild the AI chatbot as a proper conversational subsystem.

Requirements:

## Dedicated AI channel

A guild may configure:

```text
AI Channel: #ririko-ai
```

Messages inside that channel invoke the AI without a prefix.

Do not trigger AI globally unless explicitly configured.

## Per-user unique context

The channel is shared.

But conversation context is isolated per user.

Example:

```text
#ririko-ai

Alice:
"What do you think about Gundam?"

Ririko:
...

Bob:
"Do you remember my character?"

Ririko:
...
```

Alice and Bob have different conversational memories.

The system must not accidentally leak one user's private context into another user's conversation.

## User identity

The AI should know safe Discord identity data such as:

* Discord username
* display name
* guild context where appropriate
* user preferences explicitly configured

Do not expose sensitive internal data.

## Personality

Allow guild owners to configure Ririko's personality.

Example:

```text
Personality:
Helpful anime-loving AI companion.
Speaks casually.
Uses American English.
Occasionally uses Japanese phrases.
Avoids excessive emoji usage.
```

Also support per-user preferences where useful.

Personality configuration must be stored separately from system safety instructions.

## Time tool

Provide an explicit time tool:

```text
get_current_time()
```

Support:

* UTC
* configured guild timezone
* user timezone where explicitly configured

Never make the LLM guess the current time.

## Tool calling

Ririko AI should use explicit tools for:

* current time
* music
* user profile
* guild configuration
* economy balance
* selected game actions
* reminders
* approved bot functions

Example:

```text
AI
 ↓
tool decision
 ↓
music.play()
 ↓
Discord
```

Never allow an arbitrary natural-language model output to directly execute privileged Discord operations.

## AI providers

Create:

```ts
interface ChatModelProvider {
  id: string;
  
  generate(request: ChatRequest): Promise<ChatResponse>;
  
  stream?(request: ChatRequest): AsyncIterable<ChatToken>;
}
```

Support pluggable providers.

Possible providers may include:

* Google Gemini
* OpenAI
* local Ollama
* OpenAI-compatible endpoints
* future providers

Provider configuration belongs to guild/bot owner configuration.

---

# 12. MODERATION 2.0

Build a real moderation engine.

Required:

* ban
* softban where practical
* kick
* timeout
* warn
* unban
* purge/delete
* lock/unlock
* nickname moderation
* moderation notes
* moderation history
* audit log
* configurable log channel

Warning escalation must be configurable.

Example:

```text
1 warning → warn
2 warnings → warn
3 warnings → 10m timeout
4 warnings → 1h timeout
5 warnings → 1d timeout
6 warnings → ban
```

Do not hardcode this exact policy.

Guild owners should be able to configure escalation.

Warnings should support:

* reason
* moderator
* timestamp
* active/expired
* severity
* evidence/reference
* automatic action

Also support:

* spam detection
* repeated message detection
* mention spam
* invite spam
* scam link detection
* suspicious URL detection
* URL shortener rules
* phishing domains
* anti-nuke protections where practical
* raid protection
* excessive emoji/sticker spam
* repeated attachment spam

Design a rule engine:

```ts
interface ModerationRule {
  id: string;
  
  evaluate(context: ModerationContext): Promise<RuleResult>;
}
```

Then:

```text
message
 ↓
moderation pipeline
 ↓
rules
 ↓
decision
 ↓
action
 ↓
audit log
```

Use Discord native AutoMod functionality where appropriate rather than rebuilding everything unnecessarily.

---

# 13. AUTOMATIC ROLE SYSTEM

Support:

* autorole on join
* bot role assignment
* verified role
* reaction roles
* button roles
* select-menu roles
* role groups
* role exclusivity
* temporary roles
* level-based roles
* economy-based roles
* activity-based roles

The dashboard must expose these configurations.

---

# 14. IMAGE GENERATION 2.0

Completely redesign image generation.

Use an adapter architecture:

```ts
interface ImageGenerationProvider {
  id: string;
  name: string;
  capabilities: ImageGenerationCapabilities;
  
  generate(request: ImageGenerationRequest):
    Promise<ImageGenerationResult>;
}
```

Supported capabilities should include:

* prompt
* negative prompt
* count
* width
* height
* aspect ratio
* seed
* model
* quality
* guidance where applicable
* image-to-image where supported
* editing where supported

Provide:

## Free provider

At least one genuinely useful free/open/free-tier option.

Possible approaches:

* hosted free provider
* Hugging Face inference provider/free allocation
* self-hosted ComfyUI
* self-hosted Stable Diffusion/Flux-compatible backend

The implementation must verify the provider's actual current terms and limits rather than claiming an API is unlimited
or permanently free.

## Paid providers

Support configurable providers.

Candidates may include:

* Google Gemini image generation
* OpenAI image generation
* Replicate
* other reputable image APIs

Do not hard-code one provider.

## Guild configuration

Guild owner chooses:

```text
Default provider
Fallback provider
Allowed providers
Maximum images/request
Default model
Default positive prompt
Default negative prompt
Maximum resolution
Daily quota
Per-user quota
```

## User configuration

Users may optionally configure personal preferences:

```text
positive prompt
negative prompt
preferred provider
preferred model
default image count
```

Guild administrators may disable user provider selection.

## Queueing

Do not fire unlimited concurrent generation jobs.

Implement:

* concurrency
* queue
* rate limit
* retry
* timeout
* provider fallback
* job status
* cancellation if practical

---

# 15. DEFAULT ANIME PROMPTS

Provide sensible defaults.

For example:

```text
Positive:
high quality anime illustration, detailed character design,
beautiful composition, clean line art, expressive eyes,
cinematic lighting, detailed background
```

and a configurable negative prompt.

Do not force these values.

Allow administrators to change them.

Allow users to opt out where permitted.

---

# 16. GIVEAWAY 2.0

Replace the old giveaway implementation with a robust giveaway service.

Support:

* scheduled start
* duration
* number of winners
* minimum account age
* minimum server age
* role requirements
* channel requirements
* reaction/button entry
* bonus entries
* exclusions
* blacklist roles
* reroll
* end early
* cancel
* rerun
* winner history
* persistent recovery after restart

Giveaways must survive bot restarts.

Use database state rather than memory as the source of truth.

---

# 17. AUTO VOICE 2.0

Rework auto voice channels.

Support:

```text
Join "Join to Create"
       ↓
Create temporary channel
       ↓
Move user
       ↓
Channel ownership
       ↓
User leaves
       ↓
Delete channel when empty
```

Features:

* custom naming
* user ownership
* permission controls
* bitrate/user-limit settings
* region where Discord supports it
* locked channel
* rename
* transfer ownership
* delete
* persistent configuration

Handle restarts correctly.

Never leave orphan channels indefinitely.

---

# 18. STREAMER PLATFORM SYSTEM

Create a generic stream platform adapter.

```ts
interface StreamPlatformAdapter {
  id: string;
  name: string;
  
  resolveStreamer(input: string): Promise<Streamer>;
  
  getCurrentStream(streamer: Streamer): Promise<LiveStream | null>;
  
  subscribe(...): Promise<void>;
  
  unsubscribe(...): Promise<void>;
}
```

Initial adapters:

* Twitch
* TikTok
* Facebook

Add more later without changing the announcement engine.

Important:

Platform APIs have very different availability and permission models.

Do not assume that TikTok or Facebook provide exactly the same webhook/data functionality as Twitch.

Research their currently available official APIs before implementing.

---

# 19. STREAM SUBSCRIPTION MODEL

A user can subscribe to a streamer.

The system needs to remember:

```text
user
streamer
platform
guild
announcement channel
subscription state
```

Example:

Alice subscribes to:

```text
@streamer on Twitch
```

in:

```text
Guild A
```

Bob subscribes to the same streamer in:

```text
Guild B
```

The system must know that these are independent guild announcements.

It must also track whether a particular live-stream event has already been announced.

Use an idempotency key.

Conceptually:

```text
platform + stream_id + guild_id + announcement_target
```

Do not announce the same stream repeatedly after retries/restarts.

---

# 20. STREAM THUMBNAIL CACHE

Do NOT permanently embed provider thumbnail URLs if they can expire or become invalid.

When a stream notification happens:

1. download the image;
2. validate it;
3. cache/store it;
4. upload/reupload the image to Discord;
5. use the Discord-hosted attachment URL in the announcement.

Cache lifecycle must be configurable.

Use content hashing to avoid duplicate downloads.

---

# 21. FREE GAMES ANNOUNCER 2.0

Rework free-game announcements.

Providers may include:

* Epic Games Store
* Steam
* GOG
* other legitimate sources

Use adapters:

```ts
interface FreeGameProvider {
  id: string;
  
  fetchFreeGames(): Promise<FreeGame[]>;
}
```

Support:

* schedule
* duplicate detection
* region awareness
* start/end date
* notification channel
* mention role
* enable/disable per provider

Do not scrape blindly where an official API/feed is available.

---

# 22. WAIFU TCG — MAJOR NEW SYSTEM

Build a proper anime waifu trading-card game.

This should become one of Ririko's major features.

Use waifu.im as an image acquisition source, but do NOT repeatedly request the same image on every command.

Create a local asset/cache pipeline.

---

# 23. WAIFU IMAGE INGESTION PIPELINE

Create:

```text
waifu.im
 ↓
ingestion worker
 ↓
validate image
 ↓
download original
 ↓
calculate hash
 ↓
metadata extraction
 ↓
database
 ↓
local/object storage
```

Store:

* source URL
* source ID
* API metadata
* tags
* image hash
* local storage location
* imported timestamp
* credit information
* moderation/deletion state

Cache locally or in object storage.

The bot should serve cached assets rather than repeatedly downloading from waifu.im.

If the original creator/source requests removal, the image must be removable without breaking the card system.

---

# 24. WAIFU CARD CREDITS

Cards MUST include attribution.

Card footer:

```text
Image source: waifu.im
```

And the command response/help should also provide appropriate attribution.

Preserve source metadata in the database.

Do not remove attribution merely because the image is cached locally.

---

# 25. CARD RARITIES

Design an entertaining rarity system.

For example:

```text
Common
Uncommon
Rare
Super Rare
Ultra Rare
Secret Rare
Special Illustration Rare
Mythic
```

But choose the final rarity model based on game balance.

Each card may have:

* name
* ID
* rarity
* element
* attack
* defense
* speed
* health
* passive
* skill
* critical chance
* source anime
* image
* flavor text
* collection number

Do not make every card equally powerful merely because it is rare.

---

# 26. CARD ELEMENTS

Create an elemental interaction table.

Example:

```text
Fire > Earth
Earth > Lightning
Lightning > Water
Water > Fire
Light > Shadow
Shadow > Light
```

Use a configurable type chart.

Allow future elements.

---

# 27. WAIFU DROP SYSTEM

Guild administrators configure:

```text
Drop channel
Drop interval
Minimum message activity
Allowed hours
Rarity weights
Duplicate rules
Claim duration
Maximum active drops
```

Example:

```text
Common       60%
Uncommon     20%
Rare         10%
Super Rare    6%
Ultra Rare    3%
SIR            0.9%
Mythic         0.1%
```

These are examples only.

Create a configurable weighted RNG system.

---

# 28. WAIFU CARD GAME MODES

Implement a foundation supporting:

* collection
* explore
* quests
* expeditions
* boss fights
* PvE
* PvP
* dungeons
* guilds
* guild boss
* events
* daily missions
* weekly missions
* achievements

Do not implement every feature as one giant command.

Use game services.

Example:

```text
/game explore
/game quest
/game dungeon
/game boss
/game pvp
/game collection
/game trade
/game market
/game guild
```

---

# 29. CARD COLLECTION

Users need:

```text
collection
favorites
duplicate counts
filters
rarity filter
element filter
anime filter
search
sorting
```

Support:

```text
/card collection
/card inspect
/card equip
/card favorite
```

---

# 30. CARD TRADING

Users can:

* trade cards
* offer credits
* reject trades
* accept trades
* cancel trades
* lock cards currently being traded
* prevent duplicate/double spending

Trades must be transactional.

---

# 31. CARD MARKET

Create a player market.

Support:

* listing card
* asking price
* buying card
* canceling listing
* market fee
* expiration
* search
* filters
* transaction history

Use database transactions.

Do not let race conditions duplicate or sell the same card twice.

---

# 32. ECONOMY 2.0

Create a centralized economy system.

The economy must be used by multiple modules.

Example:

```text
message → credits + EXP
voice participation → credits + EXP
attachment upload → credits + EXP
games → credits/EXP
quests → credits/EXP
dungeons → credits/EXP
giveaways → credits where appropriate
daily rewards → credits
achievements → credits
waifu cards → economy interaction
```

But NEVER reward obvious spam.

---

# 33. ECONOMY EVENT ENGINE

Create a generic event/reward model:

```ts
interface EconomyEvent {
  type: EconomyEventType;
  userId: string;
  guildId?: string;
  source: string;
  metadata?: Record<string, unknown>;
}
```

Examples:

```text
MESSAGE_SENT
VOICE_MINUTE
ATTACHMENT_UPLOADED
GAME_WON
GAME_LOST
QUEST_COMPLETE
CARD_DROPPED
CARD_CLAIMED
CARD_SOLD
DAILY_REWARD
ACHIEVEMENT_UNLOCKED
```

The economy engine converts them to rewards.

---

# 34. ANTI-SPAM REWARD PROTECTION

A critical rule:

Spam must NOT generate money or EXP.

Detect:

* repeated messages
* message bursts
* copy/paste spam
* short repetitive messages
* repeated attachments
* automated-looking activity
* self-bot-like behavior
* abuse of cooldowns

Use rolling windows and per-user reward cooldowns.

Never simply reward every Discord `messageCreate`.

---

# 35. VOICE XP / ECONOMY

Voice activity gives more XP than normal chatting.

But avoid AFK farming.

Possible checks:

* minimum active participants
* self-deafened status
* server mute
* channel state
* minimum interval
* interaction/activity
* AFK channel exclusions

Make values configurable.

---

# 36. BANK SYSTEM

Create:

```text
wallet
bank
transactions
```

Features:

```text
deposit
withdraw
balance
transfer
history
interest where appropriate
```

Do not allow negative balances through race conditions.

All money operations should be transactional.

---

# 37. GAMES

Create a generic game framework.

Required:

* Tic Tac Toe
* Rock Paper Scissors
* High/Low
* Coin Flip
* Dice

Support:

* bot opponent
* player vs player
* wager where applicable
* XP reward
* economy reward
* cooldown
* statistics

Design this so additional games can be added with:

```ts
interface MiniGame {
  id: string;
  name: string;
  
  start(...): Promise<GameSession>;
  
  handleMove(...): Promise<GameUpdate>;
  
  finish(...): Promise<GameResult>;
}
```

---

# 38. RANKING 2.0

Implement:

## Global leaderboard

Ranks across all Ririko activity.

## Guild leaderboard

Ranks within the current Discord server.

Support:

* XP
* level
* rank
* percentile
* activity
* credits where useful

The profile should show:

```text
Global Rank #1234
Server Rank #42

Level 68
██████████████░░ 82%
```

Ranking calculations must be efficient enough for large populations.

Do not fetch every user on every profile request.

---

# 39. PROFILE CARD 2.0

Retain the existing profile-card functionality but improve it.

The card should display:

* Discord avatar
* username
* server rank
* global rank
* level
* XP
* XP bar
* credits
* bank balance
* selected card
* statistics
* optional guild title

Users can set a custom profile background image URL.

IMPORTANT:

Do not blindly embed arbitrary remote URLs forever.

Download the image, validate it and cache it locally/object storage.

Provide:

```text
/profile background <url>
```

or equivalent.

Add moderation limits around image size/type.

---

# 40. ECONOMY + TCG INTEGRATION

Connect the systems creatively.

For example:

* card drops require activity;
* higher levels improve exploration rewards;
* achievements award cards;
* daily quests award credits;
* cards can modify dungeon rewards;
* equipped cards can affect combat;
* rare cards unlock special quests;
* guilds have shared progression;
* boss fights award exclusive cards;
* events introduce limited cards;
* duplicate cards can be dismantled;
* cards can be traded;
* player market charges a fee;
* expeditions consume energy;
* daily energy regenerates;
* economy can buy cosmetic effects, not only power.

Avoid pay-to-win unless explicitly configured as an optional system.

---

# 41. GUILD SYSTEM FOR WAIFU TCG

Users can create TCG guilds.

Support:

* guild creation
* guild name
* guild members
* ranks
* guild XP
* guild bank
* guild quests
* guild boss
* guild leaderboard
* permissions

Do not confuse this with Discord guilds.

Use different terminology internally, for example:

```text
DiscordGuild
WaifuGuild
```

---

# 42. DASHBOARD

Create a proper web dashboard.

Authentication:

```text
Discord OAuth2
```

After authentication, determine:

* Discord identity
* servers user belongs to
* which servers contain Ririko
* which servers user can administer/configure

Do not rely purely on a manually supplied guild ID.

Use the Discord OAuth scopes/permissions appropriate to the functionality.

Dashboard structure:

```text
Dashboard

My Servers

  Server A
    Overview
    General
    Moderation
    AutoMod
    Music
    AI
    Image Generation
    Economy
    XP & Ranking
    Waifu TCG
    Games
    Giveaways
    Reaction Roles
    Auto Voice
    Stream Alerts
    Free Games
    Welcome
    Farewell
    Logging
    Roles
    Commands
    Prefix
    Appearance
    Integrations
```

---

# 43. DASHBOARD MODULE CONFIGURATION

Every configurable module should expose a typed configuration schema.

Do not manually duplicate validation in frontend/backend.

Prefer a shared schema package using the same validation definitions.

For example:

```ts
const moderationConfigSchema =
...
```

can be consumed by:

* CLI
* API
* dashboard
* runtime validation

---

# 44. DASHBOARD FEATURES TO ADD

Add sensible administration features beyond the list above:

* audit log viewer
* bot health
* integration health
* API provider status
* usage statistics
* AI usage
* image generation usage
* music usage
* economy statistics
* moderation statistics
* stream subscription statistics
* command analytics
* error dashboard
* rate-limit status
* feature flags
* maintenance mode
* module enable/disable
* permission testing
* log viewer
* backup/export
* import configuration
* configuration presets

Do not expose secrets.

---

# 45. PROVIDER CONFIGURATION

Providers should be abstract.

For example:

```text
AI
 ├─ Gemini
 ├─ OpenAI
 ├─ Ollama
 └─ OpenAI-Compatible

Images
 ├─ Local/ComfyUI
 ├─ Hugging Face
 ├─ Gemini
 ├─ OpenAI
 └─ Replicate

Streams
 ├─ Twitch
 ├─ TikTok
 └─ Facebook

Music
 ├─ YouTube
 ├─ Spotify
 ├─ Deezer
 └─ SoundCloud

Games
 ├─ Epic
 ├─ Steam
 └─ GOG
```

A provider must be replaceable without modifying domain logic.

---

# 46. SECRETS

Never store API secrets in guild configuration tables as plaintext.

Use:

* environment variables
* encrypted secret storage where appropriate
* secret references
* controlled secret decryption

Dashboard should display:

```text
Configured ✓
```

rather than:

```text
sk-abc123...
```

---

# 47. DATABASE

Design a proper schema before implementing feature logic.

At minimum consider:

```text
users
guilds
guild_members
guild_settings

commands
command_settings

moderation_cases
moderation_warnings
moderation_rules

economy_accounts
economy_transactions
economy_rewards
economy_cooldowns

xp_accounts
xp_events
leaderboard_snapshots

music_guild_settings
music_history
music_saved_playlists

ai_channels
ai_conversations
ai_messages
ai_user_preferences
ai_guild_preferences

image_providers
image_jobs
image_presets
image_usage

giveaways
giveaway_entries
giveaway_winners

streamers
stream_subscriptions
stream_events
stream_announcements
stream_assets

free_games
free_game_announcements

waifu_sources
waifu_assets
waifu_cards
user_cards
card_trades
market_listings
waifu_guilds
waifu_guild_members
quests
dungeons
bosses
boss_runs

mini_games
game_sessions
game_statistics

reaction_roles
auto_voice_configs
reminders
welcome_configs
farewell_configs
audit_logs
```

Do not blindly create all these tables.

Design the final schema after studying existing data and normalization requirements.

---

# 48. MIGRATION STRATEGY

This is extremely important.

Create:

`docs/migration-1.x-to-2.0.md`

The migration strategy must explain:

* what old tables map to
* what old IDs remain compatible
* which values are transformed
* which data is deprecated
* rollback strategy
* dry-run mode
* validation
* backup
* verification

Create migration utilities such as:

```bash
ririko migrate:legacy
ririko migrate:verify
ririko migrate:rollback
```

Do not require users to manually rewrite databases.

---

# 49. EVENT-DRIVEN INTERNAL DESIGN

Use internal application events where useful.

Examples:

```text
MessageReceived
UserLevelUp
EconomyRewarded
ModerationAction
StreamStarted
GiveawayStarted
GiveawayEnded
CardDropped
CardClaimed
GameFinished
```

Events can be consumed by:

* economy
* analytics
* logging
* ranking
* notifications
* achievements

But avoid building an unnecessarily complicated enterprise event bus.

Simple typed events are enough.

---

# 50. SCHEDULING / JOBS

Create a reliable job abstraction.

Use it for:

* stream polling/webhooks
* free game updates
* giveaway expiration
* reminders
* voice cleanup
* image jobs
* card drops
* economy rewards
* daily resets
* weekly resets

Jobs must be safe across restarts.

Use persistent state where duplication would matter.

---

# 51. CACHING

Create a common cache abstraction.

Possible backends:

```text
memory
Redis
database
```

Use caching for:

* Discord metadata
* provider results
* anime searches
* waifu metadata
* images
* free games
* stream status
* AI context retrieval where appropriate

Do not cache sensitive data indefinitely.

---

# 52. LOGGING

Use structured logging.

Every important subsystem should have:

```text
timestamp
level
module
operation
guildId
userId
correlationId
duration
error
```

Avoid logging:

* tokens
* OAuth secrets
* API keys
* full private AI conversations unless explicitly configured
* passwords
* sensitive credentials

---

# 53. ERROR HANDLING

External API failure should never crash the Discord bot.

For every adapter:

* timeout
* retry
* exponential backoff
* rate-limit handling
* circuit breaker where justified
* graceful fallback
* clear user-facing error

Example:

```text
Gemini unavailable
    ↓
configured fallback provider
    ↓
response
```

Do not retry indefinitely.

---

# 54. SECURITY

Perform a security review covering:

* OAuth2
* CSRF
* session handling
* cookies
* dashboard authorization
* Discord permissions
* privilege escalation
* command injection
* URL validation
* SSRF
* remote image download
* file upload
* archive bombs
* malicious image files
* AI prompt injection
* tool execution boundaries
* provider secrets
* SQL injection
* XSS
* rate limits
* webhook validation
* replay attacks
* duplicated events
* economy exploits
* trading race conditions
* market race conditions

AI tools must use strict allowlists.

The AI must never be able to call:

```text
shell
database SQL
filesystem
arbitrary HTTP
Discord administrative APIs
```

unless explicitly mediated by a safe tool.

---

# 55. TESTING

Build serious automated tests.

Unit tests:

* economy
* XP
* rarity RNG
* element calculations
* card combat
* moderation escalation
* spam detection
* stream idempotency
* giveaway winner selection
* market transactions
* trade transactions
* command parsing
* provider fallback
* image job queues

Integration tests:

* database
* Discord command services
* provider adapters
* OAuth
* dashboard API

E2E:

* dashboard login
* guild selection
* module configuration
* command invocation
* interactive menus
* card collection
* market listing
* economy
* moderation setup

Use deterministic random seeds in tests.

Do not test RNG using flaky probabilistic assertions.

---

# 56. QUALITY GATES

Before considering a milestone complete:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

The exact commands may differ.

CI must enforce the real equivalent.

No feature is considered done merely because TypeScript compiles.

---

# 57. OBSERVABILITY

Add:

* health endpoint
* readiness endpoint
* bot connection status
* database status
* provider health
* job queue health
* error counters
* usage metrics

The dashboard should surface meaningful health indicators.

---

# 58. RATE LIMITS

Implement rate limits per:

* Discord user
* guild
* channel
* command
* provider
* AI
* image generation
* games
* economy
* card claiming
* market actions

Do not rely only on Discord API rate limits.

---

# 59. CONFIGURATION HIERARCHY

Use a predictable precedence model.

Example:

```text
System defaults
    ↓
Bot-owner defaults
    ↓
Guild settings
    ↓
Channel settings
    ↓
User settings
    ↓
Command invocation
```

Document which layer is allowed to override which.

Never allow ordinary users to override guild security settings.

---

# 60. ANALYTICS

Add lightweight analytics.

Track aggregate metrics such as:

* command usage
* active guilds
* active users
* music usage
* AI requests
* image generation
* games
* economy events
* moderation actions
* stream announcements
* card drops

Respect privacy.

Do not unnecessarily retain complete message content.

---

# 61. DATA RETENTION

Document retention policies.

Examples:

```text
AI conversations
Moderation logs
Economy history
Stream events
Analytics
Audit logs
```

Allow guild administrators to configure retention where appropriate.

---

# 62. FEATURE FLAGS

Every major new system should be disableable.

Examples:

```text
music.enabled
ai.enabled
economy.enabled
waifu.enabled
moderation.enabled
imageGeneration.enabled
```

This is important during 2.0 rollout.

---

# 63. BACKWARD-COMPATIBLE USER EXPERIENCE

Retain recognizable commands.

Where an old command changes:

```text
old command
   ↓
compatibility alias
   ↓
new implementation
```

Do not suddenly break users just because the internal architecture changed.

---

# 64. DEVELOPER DOCUMENTATION

Create documentation:

```text
docs/
  architecture.md
  development.md
  commands.md
  modules.md
  adapters.md
  database.md
  migrations.md
  testing.md
  deployment.md
  dashboard.md
  ai.md
  music.md
  moderation.md
  economy.md
  waifu-tcg.md
  contributing.md
```

Also provide concise module-specific documentation close to the code when useful.

---

# 65. RELEASE VERSION

This project is:

```text
2.0.0
```

Update versioning accordingly.

Use semantic versioning.

Define a release process for:

```text
2.0.x
2.1.x
2.2.x
3.x
```

---

# 66. IMPLEMENTATION ORDER

Do NOT implement all features randomly.

Use this order unless your architecture audit proves another order superior:

## Phase 0

Repository audit.

Deliver:

* legacy feature inventory
* architecture proposal
* migration proposal
* dependency proposal
* risks
* ADRs

## Phase 1

Foundation.

Implement:

* project structure
* configuration
* logging
* database
* migrations
* command registry
* Discord integration
* permissions
* CLI
* test foundation

## Phase 2

Compatibility.

Port existing:

* general commands
* anime/manga
* memes
* reactions
* welcome/farewell
* reaction roles
* reminders
* basic guild functionality

## Phase 3

Core rewritten systems.

Implement:

* music
* moderation
* AI
* image generation
* giveaways
* auto voice
* streamer notifications
* free games

## Phase 4

Central systems.

Implement:

* economy
* EXP
* ranking
* profile
* games

## Phase 5

Waifu TCG.

Implement the complete card pipeline and game system.

## Phase 6

Dashboard.

Expose all configuration.

## Phase 7

Migration and release.

---

# 67. ADRs

Create Architecture Decision Records for major decisions.

Examples:

```text
ADR-001 Runtime
ADR-002 Discord framework
ADR-003 Database
ADR-004 Music architecture
ADR-005 AI provider architecture
ADR-006 Image provider architecture
ADR-007 Stream adapter architecture
ADR-008 Dashboard architecture
ADR-009 Economy model
ADR-010 Waifu TCG architecture
ADR-011 Storage strategy
ADR-012 Job scheduler
```

Do not write meaningless ADRs.

Each ADR should explain:

* problem
* options
* decision
* consequences

---

# 68. DO NOT OVER-ENGINEER

Avoid:

* unnecessary microservices
* unnecessary message brokers
* Kubernetes
* 15 databases
* CQRS everywhere
* event sourcing everywhere
* unnecessary dependency injection frameworks
* abstract factory chains for trivial code
* dozens of packages for tiny utilities

A single modular application is preferred unless scale requirements actually justify splitting it.

---

# 69. DEPLOYMENT

Support:

```text
Docker
Docker Compose
local development
self-hosted
cloud deployment
```

Provide sane defaults for:

```text
bot
dashboard
database
cache
optional object storage
```

Do not require a huge infrastructure stack for a single Discord bot.

---

# 70. CLI

Create a developer/operator CLI.

Potential commands:

```text
ririko dev
ririko start
ririko migrate
ririko migrate:legacy
ririko db:backup
ririko db:restore
ririko command:list
ririko command:sync
ririko module:list
ririko module:enable
ririko module:disable
ririko guild:list
ririko guild:config
ririko provider:list
ririko provider:test
ririko cache:clear
ririko generate
ririko doctor
ririko health
ririko version
```

Create a `ririko doctor` command that checks:

* Node version
* database
* Discord credentials
* optional provider credentials
* filesystem
* FFmpeg/audio requirements
* storage
* migrations
* configuration

---

# 71. RIRIKO DOCTOR

The developer should be able to run:

```bash
ririko doctor
```

and receive:

```text
✓ Node.js
✓ TypeScript
✓ Database
✓ Discord token
✓ Discord application
✓ Database migrations
✓ Image storage

! Twitch API not configured
! Gemini API not configured

2 optional integrations missing
```

---

# 72. DASHBOARD-TO-CLI PARITY

Where practical, configuration available in the dashboard should also be available through the CLI.

Both should use the same application/configuration services.

Do NOT create a separate logic implementation for dashboard configuration.

---

# 73. DISCORD PERMISSIONS

Build a centralized permission service.

For any privileged action, verify:

1. Discord permission
2. configured Ririko permission
3. command/module enabled
4. target hierarchy
5. guild configuration

Avoid permission checks scattered throughout commands.

---

# 74. AI + DISCORD SECURITY

The AI chatbot can suggest actions but the application decides whether they are allowed.

Example:

User:

> Ban Bob.

AI:

```text
tool: moderation.ban
target: Bob
```

The application:

```text
Is the user allowed?
Is the module enabled?
Does the bot have BAN_MEMBERS?
Can the bot act on Bob?
Does policy permit this?
```

Only then execute.

The LLM should never be the security boundary.

---

# 75. MUSIC + AI SECURITY

For:

> Play this song.

AI may call:

```text
music.search()
music.play()
```

For:

> Change the music volume to 500%.

The music service clamps the allowed volume.

For:

> Remove everyone from the voice channel.

This should not even be exposed as an AI tool unless explicitly designed and authorized.

---

# 76. ECONOMY SECURITY

Treat economy operations as financial transactions.

Every transaction should have:

```text
transactionId
userId
guildId
type
amount
currency
balanceBefore
balanceAfter
source
metadata
createdAt
```

Use database transactions.

Never calculate balances only in memory.

---

# 77. TCG SECURITY

Card ownership changes must be transactional.

A card cannot simultaneously:

* be equipped
* be offered in a trade
* be listed on the market
* be transferred elsewhere

Use locking/state checks.

---

# 78. IMAGE STORAGE SECURITY

When downloading user-provided images:

* allow only HTTP (S)
* resolve DNS safely
* prevent SSRF
* restrict redirects
* restrict file size
* detect content type
* validate image
* sanitize filenames
* hash contents
* process safely
* limit dimensions

Do not trust `Content-Type`.

---

# 79. CURRENT WEB RESEARCH

Before selecting libraries/providers, research official documentation.

Prioritize:

1. official vendor documentation
2. official GitHub repositories
3. official API references
4. current package release notes

Do not choose a dependency solely because an old Stack Overflow answer recommends it.

For every external provider document:

* availability
* authentication
* limits
* rate limits
* pricing
* usage restrictions
* data retention
* webhook support
* API stability
* licensing

---

# 80. THIRD-PARTY API FALLBACKS

Every major external API should have:

```text
primary
fallback
disabled
```

where practical.

Examples:

```text
AI:
Gemini
OpenAI
Ollama

Images:
Local
Gemini
Replicate

Music:
Discord Player/extractors
Lavalink where appropriate

Streams:
Twitch
TikTok
Facebook
```

Do not invent fake fallback providers.

Only implement providers that are actually available.

---

# 81. PROVIDER CAPABILITIES

Do not make provider interfaces pretend every provider supports every feature.

Use capability discovery:

```ts
{
  search: true,
    playlists
:
  true,
    stream
:
  true,
    lyrics
:
  false,
    imageEditing
:
  true,
    imageGeneration
:
  true,
    maxImages
:
  4
}
```

UI should hide unsupported functionality.

---

# 82. USER-FACING UX

Ririko should feel like one coherent bot.

Do not make every subsystem look like it was written by a different developer.

Use a consistent style:

* embeds
* colors
* icons
* pagination
* buttons
* select menus
* ephemeral responses where useful
* error messages
* confirmations for dangerous actions

---

# 83. FEATURE DISCOVERY

The dashboard and help command should derive feature availability automatically.

Example:

```text
Enabled:
✓ AI
✓ Music
✓ Economy
✓ Games

Disabled:
○ Image Generation
○ Twitch
○ TikTok
```

---

# 84. MORE MODULES TO CONSIDER

Evaluate adding:

* starboard
* custom embeds
* server statistics
* scheduled announcements
* AFK system
* birthday system
* member milestones
* custom tags
* server counters
* self-assignable roles
* reaction/button roles
* temporary channels
* polls
* suggestion system
* tickets
* logging
* reminders
* birthday reminders
* achievements
* daily/weekly quests
* notification subscriptions
* RSS/news feeds

Only implement these if they fit the architecture and don't distract from the core 2.0 release.

They should be designed as optional modules.

---

# 85. MIGRATION PHILOSOPHY

The old bot is valuable data.

Treat existing:

* user accounts
* XP
* balances
* guild settings
* reaction roles
* music settings
* giveaway state
* Twitch subscriptions
* profile settings

as migration sources.

Never simply say:

> "Users can start over in 2.0."

The goal is to make 2.0 feel like the evolution of Ririko rather than a completely new unrelated bot.

---

# 86. FINAL ACCEPTANCE CRITERIA

Ririko 2.0 is not complete until:

* all significant 1.4.0 features have been inventoried;
* all retained features work;
* migrations are tested;
* slash commands work;
* prefix commands work;
* help is dynamic;
* dashboard authentication works;
* guild administration detection works;
* configuration works from dashboard;
* configuration works from CLI;
* music supports the required platforms;
* AI supports dedicated-channel mode;
* AI context is isolated per user;
* AI can call safe tools;
* moderation escalation works;
* spam does not grant EXP/credits;
* image provider selection works;
* image job concurrency works;
* giveaways survive restart;
* auto voice survives restart;
* streamer announcements are idempotent;
* stream assets are cached/reuploaded;
* free games do not duplicate announcements;
* economy transactions are safe;
* ranking works globally and per guild;
* profile images can be cached;
* TCG card ownership is transactional;
* TCG collection/trading/market works;
* TCG images are cached;
* image attribution is preserved;
* tests cover critical domains;
* Docker deployment works;
* migrations work from a representative 1.4.0 database;
* documentation is present;
* `ririko doctor` works.

---

# 87. HOW YOU SHOULD WORK AS THE MAIN AGENT

For a large task:

1. inspect;
2. delegate research;
3. summarize findings;
4. create plan;
5. write ADRs;
6. implement foundation;
7. test;
8. implement one module;
9. test;
10. integrate;
11. review;
12. continue.

Do not modify hundreds of files in one speculative operation.

Keep changes logically grouped.

After each major phase:

* run tests;
* run typecheck;
* run lint;
* inspect the diff;
* update documentation.

---

# 88. WHEN SOMETHING IS UNCLEAR

Do not ask me a question simply because there are several technically valid options.

Make the best engineering decision.

Record important alternatives in an ADR.

Only stop for decisions that materially affect product direction, security, irreversible data migration, or major
infrastructure cost.

---

# 89. FIRST DELIVERABLE

Your FIRST major task is NOT to build the entire bot.

Your first task is to create:

```text
docs/legacy-feature-inventory.md
docs/architecture.md
docs/migration-1.x-to-2.0.md
docs/dependency-evaluation.md
docs/implementation-roadmap.md

docs/adr/
```

plus:

```text
GEMINI.md
AGENTS.md
.gemini/agents/*
```

Then produce a concise architecture summary identifying:

1. what should be preserved;
2. what should be rewritten;
3. what should be replaced;
4. what should be migrated;
5. what should be deprecated;
6. the proposed new project structure;
7. database strategy;
8. provider strategy;
9. deployment strategy;
10. implementation phases.

After those artifacts exist, begin implementing the foundation.

Do not consider the task complete merely because the new architecture documents have been created.

The goal is a functional **Ririko AI 2.0.0**, with the old feature set retained where appropriate and the new systems
fully implemented.

---

# 90. QUALITY BAR

Act like a senior open-source maintainer.

Prefer:

* boring code
* explicit code
* typed boundaries
* good names
* small modules
* testable services
* predictable data flow
* documented decisions
* stable dependencies
* boring infrastructure

Avoid:

* magic
* hidden globals
* singleton state everywhere
* huge classes
* 3000-line services
* duplicated business logic
* provider-specific business logic
* unsafe AI tools
* untestable Discord handlers
* undocumented migrations
* undocumented environment variables

The ultimate goal is:

**A developer who did not write Ririko 2.0 should be able to open the repository, understand the architecture, create a
new feature, write tests for it, add a new provider, add a new command, and safely deploy it without being afraid to
change the core.**