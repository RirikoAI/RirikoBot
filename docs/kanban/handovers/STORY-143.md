# Handover Note: STORY-143

**Ticket**: `STORY-143`
**Epic**: `EPIC-014` (Server Utilities, AutoRoles & Community Systems)
**Title**: Server Utility, Identity & Timezone Commands Parity (`/get-avatar`, `/guild-info`, `/member-info`, `/prefix`, `/timezone`)
**Points**: 5
**Status**: DONE
**Branch**: `feat/STORY-143-server-utility-timezone`

---

## 1. Summary of Changes

Delivered the complete dual-dispatch (Slash & Prefix) server utility, identity, and timezone command suite for Ririko AI 2.0.0, fulfilling all parity requirements from legacy 1.4.0 while enhancing performance with in-memory caching and dynamic prefix resolution.

### Delivered Subsystems & Commands:

1. **`GuildSettingsService` with In-Memory Caching (`packages/services/src/guild/guild-settings.service.ts`)**:
   - High-performance caching layer (`Map<string, CachedGuildSettings>`) over `GuildSettingsRepository` with configurable TTL (default 5 minutes).
   - O(1) in-memory prefix lookup (`getPrefix`) and timezone lookup (`getTimezone`).
   - Input validation: prefix (1–5 chars, whitespace/backtick/mention safe), timezone (canonical IANA verification).
   - Immediate cache invalidation & write-through on settings update.

2. **Dual-Dispatch `/prefix` Command (`apps/bot/src/commands/utility/prefix.command.ts`)**:
   - Parity with legacy `!prefix` and `!setprefix`.
   - View mode: Displays current server prefix, execution examples, and permission guidance.
   - Set mode: Gated behind `ManageGuild` permission; validates and persists new prefix; immediately updates router cache.

3. **Dual-Dispatch `/timezone` Command (`apps/bot/src/commands/utility/timezone.command.ts`)**:
   - Parity with legacy `!timezone` and aliases `!tz`, `!settimezone`, `!set-timezone`.
   - Unified multi-tier fallback: **User Personal Preference ➔ Server Timezone ➔ UTC**.
   - View mode: Displays Server Timezone (and local wall-clock time), User Personal Timezone (and personal local time), and the active effective fallback.
   - Set mode (Server): Configures guild-wide default timezone (requires `ManageGuild` permission).
   - Set mode (User): Configures personal timezone override stored in `conversationManager.setUserPreferences`.
   - Strict IANA validation via `canonicalTimeZone()` ensuring Daylight Saving Time (DST) safety.

4. **Dual-Dispatch `/get-avatar` Command (`apps/bot/src/commands/utility/avatar.command.ts`)**:
   - Parity with legacy `!avatar` and `!pfp`.
   - Resolves target user by slash option, mention, user ID, or defaults to command invoker.
   - High-resolution (4096px) download links: PNG, JPG, WebP, and GIF (if animated).
   - Supports server-specific avatar (`server_avatar: true`).

5. **Dual-Dispatch `/guild-info` Command (`apps/bot/src/commands/utility/guild-info.command.ts`)**:
   - Parity with legacy `!guildinfo`, `!serverinfo`, and `!info`.
   - Rich embed with guild owner, server ID, prefix, server timezone, and current local time.
   - Channel breakdown (text, voice, category), member counts (humans, bots), boost level & count, custom assets (roles, emojis, stickers).
   - Formatted Discord timestamp chips `<t:timestamp:F> (<t:timestamp:R>)`.

6. **Dual-Dispatch `/member-info` Command (`apps/bot/src/commands/utility/member-info.command.ts`)**:
   - Parity with legacy `!memberinfo`, `!userinfo`, and `!whois`.
   - Inspects target member or author.
   - Displays identity, user ID, account type (bot/human), account created and server joined timestamps.
   - Effective timezone and current wall-clock local time.
   - Role list sorted by hierarchy, key permissions badges (Administrator, Manage Server, Moderator, etc.).
   - Integrated economy & progression card (Level, Wallet, Bank, Karma) when active in database.

7. **Dynamic Router Prefix Resolution (`apps/bot/src/main.ts`)**:
   - Wired `CommandRouter` with `resolvePrefix: async (msg) => services.guildSettingsService.getPrefix(msg.guildId)`.
   - Messages are routed dynamically with zero database overhead on every message.

8. **Dynamic Server Prefix Across Help Pages (`packages/discord/src/help/`, `apps/bot/src/main.ts`)**:
   - Extended `HelpOptions` with `resolvePrefix?: (guildId?: string | null) => string | Promise<string>`.
   - Category command listings now display `(Prefix: `${prefix}${name}`)` for every command (with aliases if present), even if the command has no aliases.
   - Command inspector examples are dynamically formatted to replace `!` or `$` with the server's configured prefix.
   - Interactive components (buttons and select menus) resolve the active prefix for the guild where the interaction occurred.
   - Dynamic prefix formatting integrated into Waifu TCG guides and timezone configuration embeds.

---

## 2. Verification & Testing

- `packages/discord/src/help/help.test.ts`: 17 tests passing.
- `packages/services/src/guild/__tests__/guild-settings.service.test.ts`: 14 tests passing.
- `apps/bot/src/commands/utility/__tests__/settings.commands.test.ts`: 15 tests passing.
- `apps/bot/src/commands/utility/__tests__/identity.commands.test.ts`: 9 tests passing.
- `apps/bot/src/commands/reminders/__tests__/reminder.command.test.ts`: 8 tests passing.
- Total Vitest tests: 63 passing in domain suites (1,463 passing across entire monorepo).
- Monorepo TypeScript check (`pnpm typecheck`): 8 workspace projects clean with 0 errors.

---

## 3. Decisions & Gotchas

- **Async options in @ririko/discord**: `ctx.options.getUser` is an asynchronous method returning `Promise<User | null>`. Commands must `await ctx.options.getUser()`.
- **XP Account Composite Key**: `XpRepository.findById` accepts an `XpAccountId` object `{ userId, guildId }`, rather than a plain string.
- **DST Protection**: Abbreviations like `EST`, `GMT+8` are rejected in favor of geographic IANA names (e.g. `Asia/Kuala_Lumpur`, `America/New_York`) to avoid DST calculation drift.

---

## 4. Epic Status

With the completion of `STORY-143`:
- All stories under `EPIC-014` (`STORY-140`, `STORY-141`, `STORY-142`, `STORY-143`, `STORY-144`, `CHORE-1401`) are now **DONE**.
- `EPIC-014` is marked **DONE**.
