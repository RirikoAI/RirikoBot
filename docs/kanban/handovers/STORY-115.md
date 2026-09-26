# Handover Note: STORY-115 XP & Ranking, Games & Giveaways Pages

- **Ticket Type & Points**: Story | 8 pts (`TASK-1151` = 3, `TASK-1152` = 2, `TASK-1153` = 3)
- **Epic**: `EPIC-011`
- **Author / Agent**: Claude Code (Opus 5.5)
- **Status**: REVIEW
- **Timestamp**: 2026-09-27
- **Branch**: `feat/STORY-115-xp-games-giveaways` (targets `develop/2.0.0`)

## 0. Decisions Made at Story Start (2026-09-27)
- **Re-groom after an audit.** The story was estimated at 5 points on the assumption that the bot had per-guild economy settings. It has none:
  - Balances, the daily reward and the bank are global per user.
  - Every economy value is a constant in `apps/bot/src/services.ts`.
  - Per-guild credit settings would let one server mint credits for everyone.

  The user chose to move the economy work to a new **STORY-165** (owner console: global economy values and the item shop manager, 8 points). STORY-115 was re-groomed to 8 points (XP, Games, Giveaways).
- **Bugs found in the audit:**
  - Filed as **BUG-0023**: message credits are never awarded, because anti-spam runs twice.
  - Filed as **BUG-0024**: the Postgres item seed uses slug IDs on a `uuid` column, and the legacy migration reads the wrong karma and welcomer keys.
  - Fixed here: voice rewards never accrued, because nothing called `VoiceSessionAccumulator.tick()`. The Voice XP switch needs it.
- **User's scope choices:**
  - XP page: all four settings (announcements and channel, rate, no-XP channels and roles, voice rewards).
  - Games page: the games' on/off and cooldown rules plus a maximum wager.
  - Giveaways: end and reroll need no passkey check.

## 1. Summary of Work Accomplished

### TASK-1151: XP & Ranking page and voice rewards
- **Schema:** `guild_settings` gains:
  - `level_up_channel_id`
  - `xp_rate_percent` (default 100)
  - `no_xp_channel_ids` and `no_xp_role_ids` (JSON, default `[]`)
  - `voice_xp_enabled` (default **false**: voice pays 35 credits and 40 XP per minute, so guilds opt in)

  The module is `xp` in [guild-config.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/guild-config.ts) (`MAX_XP_RATE_PERCENT = 300`), with an `xp` store in `GuildConfigService`. `levelUpAnnouncements` maps to the existing `karma_notifications_enabled`.
- **Bot cache:** `GuildSettingsService` caches the XP fields and `maxGameWager`. It already drops a guild on every `guild:configChanged`, and cache entries are now built from the saved row in one place.
- **[message.listener.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/listeners/message.listener.ts):**
  - No XP in no-XP channels (a thread follows its parent) or for no-XP roles.
  - The 15 to 25 XP roll is scaled by the rate.
  - Level-ups go to the level-up channel ([level-up.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/listeners/level-up.ts)), or to the current channel when there is none or Ririko cannot post there.
  - Level-up messages ping only the member.
- **[VoiceRewardService](file:///Z:/Projects/ririko-v2-2026/packages/services/src/economy/voice-rewards.ts)** runs the accumulator every 60 s. It pays through `EconomyService.handleEvent` (credits) and `LevelingService.addExperience` (XP at the rate). This happens only in guilds with voice rewards on, and it skips no-XP channels and roles. Voice level-ups are announced only in the level-up channel. It is started on READY (idempotent) and stopped on shutdown. `earnsXp` and `scaleXp` are shared with the listener.
- **Voice listener fixes:**
  - Leaving voice used `onVoiceStateUpdate(null, channel)`, which removed whoever the accumulator found first in that channel. It now calls `handleUserLeave(userId)`.
  - `trackCurrentVoiceMembers` resets and seeds the accumulator from the gateway voice state cache on every READY.
- **Web:** `/dashboard/[guildId]/xp`. `ChannelListField` takes `includeVoice`. Nav entry, audit label and coverage entry added.

### TASK-1152: Games page and maximum wager
- **Schema:** `guild_settings.max_game_wager` (nullable).
- **Core:** [games.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/games.ts) has `WAGER_GAME_COMMANDS`, `GameRulesSchema` (drops rules that change nothing) and `MAX_GAME_WAGER_LIMIT`. `OptionalIntSetting` accepts `''` or `none` as empty.
- **Store:** module `games` (`maxWager`, `rules`). The rules are the five games' server-wide `command_settings` rows. Saving replaces only those rows and keeps their allowed and blocked roles and every channel rule. `toCommandSettingsRows` and `isDefaultOverride` are shared with the `commands` store.
- **Bot:**
  - [wager-limit.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/commands/games/wager-limit.ts) is called in coinflip, dice, highlow, rps and tictactoe before any balance change or escrow.
  - `commandOverrideService` is also invalidated for module `games`.
- **Web:** `/dashboard/[guildId]/games` with [game-rules-field.tsx](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/dashboard/%5BguildId%5D/games/game-rules-field.tsx):
  - Every game is submitted in list order, so a `Row N` error names the listed row.
  - A note appears on games that have role or channel rules.

### TASK-1153: Giveaways page
- **Guard against ending twice:** `GiveawayRepository.endGiveaway` updates only `WHERE is_ended = false`, records winners only when it claimed the row, and returns whether it did. `rollAndEndGiveaway` returns `null` without firing the hook when it lost the race. `/giveaway end` now says "already ended" in that case.
- **[messages.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/giveaways/messages.ts):**
  - `buildEndedMessages` returns the embed and a disabled button as raw API JSON typed with discord.js API types.
  - `buildRerollAnnouncement` and `giveawayMessageUrl`.
  - Announcements carry `mentionUserIds` (the winners only).
  - The bot hook and `/giveaway reroll` use them.
- **[GiveawayManagementService](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/guilds/giveaways.ts):**
  - Owns a `GiveawayEngine` that is never started.
  - `list` returns running giveaways by end time and the last 25 ended ones, with entries and winners in draw order.
  - `end` and `reroll` accept only the guild's own giveaways. Other guilds' IDs read as "no longer exists".
  - The message edit and the announcements go through the bot token. Discord failures are logged and the result stands.
  - Audit actions are `giveaways.end` and `giveaways.reroll`.
- **Web:**
  - `/dashboard/[guildId]/giveaways` has End now and Reroll (optional count up to 20), both with confirm dialogs, change notices and `revalidatePath`.
  - `ActionButtonForm` takes `children` for small inputs.
  - Nav entry, audit labels and coverage entries added.

### Docs
- [dashboard.md](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md) §4 items 8, 9, 11 and 12, and the §8 table (STORY-115 at 8 points, STORY-165 added).
- [economy.md](file:///Z:/Projects/ririko-v2-2026/docs/economy.md) §3.2 (voice rewards switch) and a new §6.2 (per-guild XP settings).

## 2. Current State & Verification
- `pnpm build`, `pnpm -r typecheck`, and the Next.js production build all pass; the build lists `/dashboard/[guildId]/xp`, `/games` and `/giveaways`.
- ESLint reports 0 errors; the warnings were already there. `prettier --check .` is clean.
- **Full `vitest run`:** 224 files, 1991 of 1992 tests pass. The one failure was the network-bound music `cookie-rotator` health summary timing out at 5 s under load. It passes alone.
- **New tests:**
  - `earnsXp` and `scaleXp`.
  - `VoiceRewardService`: switch off, rate, no-XP channel and role, level-up channel, one failure does not stop the others.
  - The listener XP rules: no-XP channel, thread parent, role, rate, level-up channel and fallback.
  - The `xp` and `games` stores, including the merge that keeps roles and channel rules, a role-only row surviving, and row-numbered errors.
  - `GuildSettingsService` XP fields.
  - The core schemas (`games`, the module list).
  - The wager limit in all five games (refused before any credits move).
  - `endGiveaway` claims only once.
  - The engine skips the hook on a lost race.
  - The message builders.
  - `GiveawayManagementService` with a fake REST client: list, end, Discord failure tolerated, wrong state and other guild refused, reroll.
  - CLI round trips for `xp.*` and `games.*`.
  - Audit labels and coverage entries.
- **Real CLI against a copy of the dev database** (after `drizzle-kit push` on the copy):
  - Set `xp.xpRatePercent`, `xp.voiceXpEnabled`, `games.maxWager` and `games.rules`. This wrote the `xp` and `games` feed versions and `cli:<user>` audit entries.
  - `games.rules` showed up in `commands.overrides`.
  - A rate of 900 was refused with `Enter a whole number from 0 to 300.`
- **Browser check on a temporary preview page** (since deleted; the real pages need a Discord sign-in):
  - The game rules field: an invalid wager and a cooldown of 9999 showed `Row 2: Cooldowns can last at most 1 hour.` and kept every input.
  - A valid save dropped unchanged games.
  - The reroll form sent the count.
  - No console errors.
- **Not verified:**
  - The real pages while signed in.
  - Real voice rewards and level-up posts in Discord.
  - A real end or reroll from the dashboard.
  - The wager refusal in Discord.

  See §4.

## 3. Roadblocks, Gotchas & Decisions Made
- **Existing databases need `pnpm db:push`.** It adds six `guild_settings` columns. The shared `next dev` server and the bot fail on `guild_settings` reads until then.
- **Voice rewards are off by default,** so turning them on is a guild decision. At 35 credits a minute they out-earn `/daily` quickly; the reward values are global constants (STORY-165 moves the daily and bank values; the voice rule stays in `DEFAULT_REWARD_RULES`).
- **Message credits are still not paid** (BUG-0023). The XP settings apply to message XP, which does work.
- **The level-up channel has no Discord check on save.** The picker offers only text channels, and the bot falls back to the current channel when it cannot post there. The CLI can set any ID.
- **Games rules live in `command_settings`.** The Commands page can also edit them, and saving the Games page replaces only the five games' server-wide rows. The change feed module is `games`, so the bot clears its override cache for both modules.
- **The TCG `/game` wager is not limited** by the maximum wager.
- **Giveaway end is not in one transaction with its audit row.** The engine's `endGiveaway` has its own transaction and the audit is written right after. A crash between them loses only the audit row.
- **Reroll has no guard against two concurrent rerolls.** The winners table key rejects a duplicate winner, and the second reroll would fail.
- **Giveaways are still created only in Discord.**
- **`AGENTS.md`/`CLAUDE.md` under `apps/web`** are rewritten by `next dev`; they were never staged.

## 4. Actionable Next Steps for Next Session / Continuing Agent
1. Run `pnpm db:push`, then test with the real bot and `pnpm dev:web`, signed in as a guild manager:
   1. **XP:** set a level-up channel and a 200% rate, level up in a text channel, and check the post and the XP gain. Add a no-XP role and check that it earns nothing.
   2. **Voice:** turn voice rewards on, sit in voice with a second unmuted member for 2 minutes, and check credits and XP. Restart the bot while in voice; accrual should continue.
   3. **Games:** set a maximum wager of 50 and try `/coinflip guess:heads wager:100` (it should be refused). Turn `rps` off and check that the Commands page shows the rule. Add a role on the Commands page, save the Games page, and check that the role stays.
   4. **Giveaways:** create a short giveaway with `/giveaway create`, press End now on the dashboard, then Reroll. Check the embed edit, the announcements, the audit log and the change notice. `/giveaway end` on it should answer "already ended".
2. Review and open a PR for `feat/STORY-115-xp-games-giveaways` into `develop/2.0.0`.
3. Next: STORY-165 (owner console economy), then BUG-0023 and BUG-0024, STORY-116 and STORY-112.
