# Handover Note: STORY-116 Music, AI Chatbot, Image Generation & Integrations Pages

- **Ticket Type & Points**: Story | 13 pts (`TASK-1161` = 5, `TASK-1162` = 3, `TASK-1163` = 3, `TASK-1164` = 2)
- **Epic**: `EPIC-011`
- **Author / Agent**: Claude Code (Opus 5.5)
- **Status**: REVIEW
- **Timestamp**: 2026-09-27
- **Branch**: `feat/STORY-116-media-ai-pages` (targets `develop/2.0.0`)

## 0. Decisions Made at Story Start (2026-09-27)
- **Re-groomed from 8 to 13 points and split.** The audit found that most settings in dashboard.md §4 items 5, 6, 7, 15, 16, 17 and 20 had nothing behind them that the bot reads:
  - **Music:** the DJ role was never enforced. `auto_leave_empty` was never passed to the player, and nothing reported how many members were in the voice channel.
  - **AI:** `/aimodel` saved `model_override`, but the bot never read it, and there was no per-guild provider.
  - **Images:** there were no per-guild settings. `/stablediffusion-model` wrote junk `image_presets` rows. The quota counted each provider separately.
  - **Stream Alerts, Free Games, Welcome & Farewell:** moved to the new **STORY-166** (13 points, TODO). The audit found a Postgres uuid bug in `/stream`, handle parsing in `apps/bot`, no ping-role column, a weak private SSRF check, and `@napi-rs/canvas`, which the web app cannot load.
- **User's choices:**
  - Wire the per-guild AI provider and model.
  - Build per-guild image settings.
  - Wire the DJ role and auto-leave.
  - Free-games ping role and background upload: done in STORY-166.
- **STORY-165 moved to DONE** (merged in PR #654).
- **Deviation from the plan:** the plan said `/volume` would stop saving the server default. That save is the BUG-0018 fix ("volume survives sessions"), so it stays; the DJ role now gates it instead.

## 1. Summary of Work Accomplished

### TASK-1161: Music (module `music`)
- **Schema:** `defaultVolume` (0 to 150), `musicChannelId`, `djRoleId`, `autoLeaveEmpty`.
- **Store:** writes only these columns in `music_guild_settings`.
  - A changed channel resets `music_channels.last_message_id` to null.
  - An empty channel deletes the row.
- **Bot:**
  - **DJ role:** [dj-role.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/commands/music/dj-role.ts) holds `canControlPlayback` and a command middleware.
    - It gates pause, resume, skip, back, stop, `/volume <level>`, loop, shuffle, seek, filter and leave.
    - It also gates the controller buttons previous, play/pause, skip, stop, mute, loop and shuffle.
    - Members with the DJ role, Manage Server or Administrator pass.
    - It is checked only when a DJ role is set.
  - `/setup-music` needs Manage Server.
  - **Auto-leave:** a `voiceStateUpdate` listener (`registerMusicVoiceListener`) counts the members who are not bots in Ririko's channel. It calls `MusicPlayerService.handleChannelOccupancy`, which stops the player after `idleTimeoutMs` (3 minutes) on both the local player and Lavalink.
  - **On a `music` config change:** `forgetGuildSettings` evicts the cached default volume, and `updateController` posts the controller in a new channel.
- **Web:** `/dashboard/[guildId]/music`.
  - New `MemberRoleSelectField`.
  - New `checkMusicSettings`: the channel must be a text channel of the guild, and the role must exist.

### TASK-1162: AI Chatbot (module `ai`)
- **Core** [ai.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/ai.ts):
  - Provider IDs and labels, `AI_PROVIDER_MODELS` (the providers in `@ririko/ai` now use these lists), `AI_MODEL_CHOICES`, and the speaking styles and tools.
  - Functions: `parseAiModelChoice`, `formatAiModelChoice`, `readAiModelChoice` (Discord input), `preferredAiModel`, `allowedAiTools` and `configuredAiProviders`.
  - New setting types in `guild-config.ts`: `OptionalTextSetting`, `OptionalChoiceSetting` and `ChoiceListSetting`.
- **DB:** `ai_guild_preferences.tools_enabled` (default true) and `provider_override`, on both dialects.
- **Schema:** `channelId`, `speakingStyle`, `personalityPrompt` (1500 characters), `tools` (none means off; every tool is stored as `[]`, so tools added later are allowed too), and `model` (`provider` or `provider/model`).
- **Fallback chain:** `generate/stream(request, preferred?: string | ProviderPreference)`. The model goes only to the preferred provider.
- **Tool allowlist:** an empty list now means no tools in `ToolRegistry.getDefinitions` and in `SecurityInterceptor`. `undefined` still means every tool.
- **Bot:**
  - The command and the chat controller pass `allowedAiTools(prefs)` and `preferredAiModel(prefs)`.
  - `/aimodel` and `/ai action:model` share `handleModelChoice`:
    - Setting a model needs Manage Server.
    - It accepts only listed choices, a provider name, or a model name that belongs to one provider, and `default` to reset.
    - It refuses a provider that is not available.
  - On an `ai` config change, the bot drops its cached AI channel.
- **Web:** `/dashboard/[guildId]/ai`.
  - New `TextAreaField`.
  - The provider select lists only configured providers. A saved choice that has lost its credentials stays selected and is labelled as such.
  - `checkConfiguredProvider` and `checkMessageChannel` run on save.

### TASK-1163: Image Generation (module `images`)
- **Core** [images.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/images.ts): provider IDs (never `mock`), style preset IDs, `imageDailyLimit` and `configuredImageProviders`.
- **DB:**
  - New `image_guild_settings` table (`default_provider`, `member_daily_limit`, `default_preset`) on both dialects.
  - New index `image_jobs(user_id, created_at)`.
  - `ImageRepository` has `getGuildSettings`, `saveGuildSettings` and `countCompletedJobsSince`.
- **Service:**
  - The member's provider and preset come first, then the guild's defaults.
  - Limits count COMPLETED jobs in the last 24 hours. The bot quota (`IMAGE_DAILY_QUOTA`) now counts across providers; before, each provider had its own count, and a job that fell back to mock counted against mock. The guild limit can only be lower.
  - `image_usage` is no longer written.
  - Regenerating passes `preset: 'none'`, because the stored prompt already has its prefix. It used to apply the prefix twice.
- **`/stablediffusion-model`** views and sets the new row. It keeps the member limit, accepts `auto` to reset the provider, refuses unconfigured providers, and no longer writes `image_presets`.
- **Config:**
  - `IMAGE_DEFAULT_PROVIDER`, `IMAGE_DAILY_QUOTA`, `REPLICATE_API_TOKEN`, `COMFYUI_URL`, `COMFYUI_BASE_URL` and `SD_WEBUI_URL` are in `ConfigSchema` and `.env.example`.
  - The ComfyUI provider also reads `COMFYUI_BASE_URL`, which `ririko image-configure` writes.
- **Web:** `/dashboard/[guildId]/images`.

### TASK-1164: Integrations
- **Core:** [integrations.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/integrations.ts) `integrationStatus(env)` returns `{ id, group, label, configured, note? }` and never a value. `LAVALINK_ENABLED` and `LAVALINK_HOST` were added to the schema.
- **Web:** `/dashboard/[guildId]/integrations` is read-only and shows booleans only.
- **CLI:** the `ririko doctor` image check uses `configuredImageProviders`.

### Docs
- [dashboard.md](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md) §4 items 5, 6, 7, 15 and 20, and the §8 table (STORY-116 at 13 points, STORY-166).
- [ai.md](file:///Z:/Projects/ririko-v2-2026/docs/ai.md) §4.2 (tools per server) and the new §6.1 (provider and model).
- [music.md](file:///Z:/Projects/ririko-v2-2026/docs/music.md): the new §9.1 (server settings).

## 2. Current State & Verification
- **Build and lint:**
  - `pnpm build`, `pnpm -r typecheck` and the Next.js production build all pass. The build lists `/dashboard/[guildId]/music`, `/ai`, `/images` and `/integrations`.
  - ESLint: 0 errors, 589 warnings, the same as before the story. `prettier --check` is clean on every changed file.
- **Full `vitest run`:** 234 files, 2077 tests, all passing.
- **New tests:**
  - Core: the AI choices, tools and schema; image limits and schema; integrations (including that no value leaves the helper).
  - `GuildConfigService`: the music, ai and images stores.
  - Music: `canControlPlayback`, the DJ middleware and the DJ buttons; `handleChannelOccupancy`; `forgetGuildSettings`.
  - AI: the fallback model preference (generate and stream); empty allowlists in the registry and the interceptor; `/ai model` saving, refusals and Manage Server.
  - Images: the quota across providers; guild defaults and limit; the `/stablediffusion-model` rewrite; the preset IDs match the service.
  - Web setting checks; the authorization coverage entry points.
- **Real data check, on a backup copy of `data/ririko.sqlite`:**
  - Running `ririko guild:config <guild>` listed the 12 new keys with the guild's real music and AI channels.
  - It set `music.defaultVolume 50`, `ai.model ollama/mistral`, `ai.tools music.play,get_current_time`, `images.memberDailyLimit 10` and `images.defaultPreset none`. Each wrote an audit row with actor `cli:fariz`.
  - It refused a bad role ID, `openai/gpt-9` and `mock`.
  - The live `data/ririko.sqlite` already had the new columns and table when it was copied, so `db:push` had been run on it.
- **Browser check** on a temporary preview page (since deleted; the real pages need a Discord sign-in):
  - On the AI form, removing tools and choosing `ollama/mistral` saved exactly those values.
  - On the image form, a limit of 600 showed the field error and kept the input.
  - The integration booleans rendered.
  - No console errors.
- **Not verified:**
  - The real pages while signed in.
  - In Discord: the DJ gate, auto-leave after 3 minutes (local and Lavalink), `/aimodel`, `/imagine` limits, and the controller appearing in a newly chosen music channel.
  - The new table and columns on Postgres.

## 3. Roadblocks, Gotchas & Decisions Made
- **Existing databases need `pnpm db:push`.** It adds `ai_guild_preferences.tools_enabled` and `provider_override`, the `image_guild_settings` table and the `image_jobs` index.
- **Auto-leave is on by default** (the column default), so bots now leave empty channels after 3 minutes. Before, they never did.
- **The previous music controller message is not deleted** when the channel changes.
- **An old `model_override` without a provider is ignored.** It was never used, and the page shows "Bot default".
- **`image_usage` is no longer written or read.** The table is left in place; dropping it is a separate chore.
- **The CLI can still set a provider that has no credentials** (it cannot know the bot's keys). The bot then falls back.
- **Image limits count completed jobs only,** so a member can start several jobs at once near the limit.
- **Ollama is always registered in the bot** (its URL defaults to localhost). The dashboard offers it only when `OLLAMA_BASE_URL` is set.
- **`apps/web/AGENTS.md`/`CLAUDE.md`** exist from the user's dev server. They are not committed.

## 4. Actionable Next Steps for Next Session / Continuing Agent
1. Run `pnpm db:push` on every existing database. Then check with the real bot and `pnpm dev:web`, signed in as a server manager:
   1. **Music:** set a DJ role and check that a member without it cannot `/skip` or press the controller buttons, but can `/play`. Choose a new music channel and check that the controller appears there. Leave the voice channel and check that Ririko leaves after 3 minutes.
   2. **AI:** choose a provider and model and check the chat answers. Turn tools off and ask for the time; no tool should run.
   3. **Images:** set a limit of 1 and check that the second `/imagine` is refused. Set a default style and check it is applied.
   4. **Integrations:** check the statuses against `.env`.
2. Review and open a PR for `feat/STORY-116-media-ai-pages` into `develop/2.0.0`.
3. Next: STORY-166 (Stream Alerts, Free Games, Welcome & Farewell), then STORY-112.
