# STORY-141 Handover Note: Persistent Natural Language Reminders Engine & Chrono Scheduler

- **Ticket ID**: `STORY-141` (tasks `TASK-1411`, `TASK-1412`, `TASK-1413`)
- **Ticket Type**: Story
- **Parent Epic**: `EPIC-014: Server Utilities, AutoRoles & Community Systems`
- **Story Points**: 5 (re-estimated from 3 during grooming: 1 + 2 + 1)
- **Completed On**: 2026-09-22
- **Target Branch**: `develop/2.0.0`

---

## 1. Summary of Work Done
Restores the 1.4.0 `reminder` / `remindme` command on a persistent, timezone-aware engine. It also makes the AI chat `reminders.create` tool real: before this story it answered "scheduled" without saving anything.

1. **TASK-1411, repository and migration fix**
   - `ReminderRepository` (`packages/database/src/repositories/reminder.repository.ts`) works on both databases. It covers create, find, update, delete and count, plus `listActiveByUser`, `countActiveByUser`, `findDue(now, limit)`, `claim(id)`, `reschedule(id, at)` and `deleteForUser(id, userId)`.
   - `claim` is a conditional update (`is_completed = false` → `true`). Only one caller can win it, so a reminder is never delivered twice, even with several schedulers.
   - Legacy migration: 1.4.0 stored the literal `'DM'` as the guild of DM reminders. These now migrate with `guildId: null`.
2. **TASK-1412, service and scheduler** (`packages/services/src/reminders/`)
   - `reminder-time.ts`:
     - `parseReminderTime` (chrono-node 2.10.1, IANA timezone, forward dates) returns the time plus the remaining text as the message.
     - `canonicalTimeZone` accepts only IANA names, matched case-insensitively.
     - `resolveTimeZone` picks the user's zone, then the guild's, then UTC.
     - `addDaysInTimeZone` / `nextOccurrence` produce DST-safe daily and weekly repeats and skip missed slots.
   - `ReminderService`: create (1.4.0 limits: future and within 1 year; new limits: 25 active per user, 500 characters per message), list, and cancel by full id or unique short prefix. It throws `ValidationError` / `BusinessLogicError` with user-facing messages, which the router shows as ephemeral replies.
   - `ReminderScheduler`: sweeps every 15 s (unref'd timer, no overlapping sweeps). For each due reminder it claims, delivers, then completes it or re-arms it. **If delivery fails everywhere, the reminder is dropped for good, repeating ones included**, as decided with the user; the drop is logged.
   - `createDiscordReminderDelivery`: sends a DM first. If that fails, it posts in the original channel, mentioning only the owner (`allowedMentions`), with a note that the DM failed.
3. **TASK-1413, command, AI tool and wiring**
   - `/reminder` (aliases `remindme`, `reminders`; Utility category):
     - It follows the bot's action-option pattern (like `/giveaway`): set, list, cancel and timezone. A time without an action means set; nothing means list.
     - Replies are ephemeral for slash commands.
     - The confirmation shows Discord timestamps (`<t:…:F>` / `<t:…:R>`), the repeat setting, the short id, and the timezone used.
     - The list view has an owner-only menu to cancel a reminder.
     - Prefix parsing keeps the 1.4.0 forms, adds `daily` / `weekly` as a leading word for repeats, and supports `cancel <id>` and `tz <zone>`.
   - Timezone: it reuses the existing `ai_user_preferences.timezone` column (already read by AI chat) through `conversationManager.setUserPreferences`. **No schema change.**
   - AI `reminders.create` now takes an injected `ReminderToolScheduler`. The bot wires it to `ReminderService` using the AI context's user, guild, channel and timezone. The tool's own duration parser is gone. Without a scheduler it never claims success. The formatter shows "Reminder not set" with the reason.
   - Bot wiring: `services.reminderService`, `services.reminderScheduler` (null without a Discord client) and `services.resolveUserTimeZone`. The scheduler starts on gateway READY. `attachOwnerCollector` moved to `apps/bot/src/commands/shared/`.
   - Docs: `docs/commands.md` §7 and `docs/ai.md`.

## 2. Verification
- `pnpm build`, `pnpm typecheck`: pass. `pnpm lint`: 0 errors, 534 warnings (unchanged), and none in changed files.
- `pnpm exec vitest run`: 1416/1418 pass. The 2 failures are live-network music tests that time out (Spotify album bridge, extractor health summary). They are unrelated; both passed in the preceding full run (1418/1418).
- New tests:
  - `reminder.repository.test.ts`: create, list, count, due-by-time, claim race, reschedule, owner-only delete.
  - `migration.test.ts`: `'DM'` guild becomes null.
  - `reminder-time.test.ts`: legacy shorthand, natural language, KL and UTC wall clock, message extraction, IANA canonicalisation, DST fall-back, missed-slot skipping.
  - `reminder.service.test.ts`: all limits, short-id cancel, scheduler deliver/complete/re-arm/drop, DM-then-channel delivery.
  - `tools.test.ts`: injected scheduler, failure reason, no false success.
  - `reminder.command.test.ts`: slash set, 4 prefix forms, list with owner-only cancel, prefix cancel, timezone show/validate/save.
- End-to-end on SQLite with the real service, command and scheduler (fake Discord client):
  - Setting `Asia/Kuala_Lumpur` worked. "call mom tomorrow at 6pm" became 10:00 UTC; "daily 9am take pills" became 01:00 UTC daily; "in 2 minutes to stretch" gave the message "stretch"; "yesterday" was rejected.
  - The list rendered, and the sweep delivered 3 DMs and re-armed the daily reminder to its next slot.

## 3. Gotchas
- **Drop-on-failure is intentional.** If the user blocks DMs and the original channel is gone or unwritable, the reminder, including a repeating one, is gone. Only a log line remains.
- Users with an `ai_user_preferences` row but no chosen zone have the column default `UTC`, which wins over the guild zone. They can fix it with `/reminder action:timezone`.
- Repeats keep the local clock time using the user's **current** zone at delivery time. Changing your zone moves future repeats with you.
- No guild setting exists yet to set the guild timezone (`guild_settings.timezone` defaults to UTC). That belongs with the STORY-143 or dashboard work.
- chrono reads "next friday" as Friday of next week (from Tuesday 2026-09-22 it gives Oct 2); plain "friday" gives the coming Friday.

## 4. Next Steps
- EPIC-014 remaining: **STORY-143** (utility commands and custom prefix wiring). Consider adding a guild timezone setting there.
- The dashboard (EPIC-011) can list and cancel reminders through `ReminderService`.
