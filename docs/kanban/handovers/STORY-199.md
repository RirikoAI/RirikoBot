# STORY-199 · Server Event Logs: Message, Member, Server and Voice Logs to Chosen Channels

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-22T02:10:00Z · claude-opus-5-5 (coordinator)

**Asked by the maintainer** (2026-10-22): "lets add another essential features for this bot that is a must have for Discord servers". This is item 2 of the EPIC-021 gap list.

**How it works for a server**
1. On Dashboard › Moderation › **Logging**, below the existing log channel, an "Event logs" form has four channel pickers: Message log, Member log, Server log and Voice log. A category with no channel is off, so nothing changes for a server until an admin opts in.
2. Ririko posts one embed per event to that category's channel.
   - Messages: edited, deleted, bulk deleted.
   - Members: joined, left, nickname, roles added or removed, timeout, ban, unban.
   - Server: channel and role created, deleted or renamed.
   - Voice: joined, left or moved.
3. Admins can ignore channels (staff chats), and bots are ignored by default.

**Design decisions** (KISS)
- **Separate module `eventlogs` and table `event_log_settings`**, not new columns on `guild_settings` or the `logging` module. The existing log channel keeps its meaning (cases, raids and notices), so upgrading servers see no new posts.
- **No storage of message content.** Deleted-message content comes from the discord.js cache only. `DEFAULT_SWEEPERS` (`packages/discord/src/client/factory.ts`) drops messages after one hour, so older deletes show "Content unknown". This is documented, not worked around: keeping a message store would be a privacy and storage change of its own.
- **No audit-log "who did it" lookup** in this story. It needs View Audit Log and is unreliable for message deletes. Possible follow-up.
- **GuildModeration intent** is added for ban and unban events. It is not privileged, so no Developer Portal change is needed.
- **Settings cache** with a 5-minute TTL and invalidate on `guild:configChanged` (module `eventlogs`), the same pattern as `CommandOverrideService`. messageUpdate is high volume, so it must not hit the database every time.
- Mentions in logged content never ping (`allowedMentions: { parse: [] }`).

**Task order:** TASK-1991 (table) → TASK-1992 (config module) → TASK-1993 (service) → TASK-1994 (listener and wiring). TASK-1995 (dashboard) needs only TASK-1992. TASK-1996 (docs) is last.

**Privacy date:** follows the maintainer's rule from STORY-198 (decision card "Bump terms only", 2026-10-21). The policy date and `LEGAL_DOCUMENTS_DATE` move to 2026-10-22, and `AI_CONSENT_VERSION` stays 2026-10-15. The 2026-10-21 version has not been released (tickets are not on master, v2.0.2 is the latest tag), so users see the terms notice only once, at the next release.

**CodeGraph note:** as for STORY-198, this container has no CodeGraph. The queries were written from reading the code at 1c1e7d7, not run.

**Out of scope:** audit-log executors, a message content store, per-event toggles beyond the four categories, webhooks for logging, and log retention.

---

## FLAG · 2026-10-22T05:10:00Z · from TASK-1996 · claude-medium (claude-sonnet-5-5)

**Finding**: The Ignored channels field on the Logging page (`apps/web/src/app/dashboard/[guildId]/logging/page.tsx`, `ChannelListField` with `includeVoice`) says "Events in these channels, and in the threads under them, are not logged" and lets an admin pick voice channels. `EventLogService` applies `ignoredChannelIds` to message events only (`messageAllowed` in `packages/services/src/event-logs/event-log.service.ts`); `voiceStateChanged` and the member and server events never check it. The docs (`docs/dashboard.md` 4.4) say it applies to the message log only.
**Impact on this story**: Before release, either drop `includeVoice` and reword the description to "Messages in these channels...", or make the voice log honour the list. Either way the docs line "Ignored channels apply to the message log only" must match the final behaviour.

---

## GROOMING · 2026-10-22T05:25:00Z · claude-opus-5-5 (coordinator)

The FLAG from TASK-1996 is resolved by keeping the design (ignored channels apply to message events only) and correcting the page and config text in BUG-0052. That bug is a 1-point text fix and runs before the story PR.

---

## REVIEW · 2026-10-22T05:55:00Z · claude-opus-5-5 (coordinator) · DONE

**Story gates rerun** (`pnpm build && pnpm db:check && pnpm typecheck && pnpm lint --quiet && pnpm format:check && pnpm test:coverage`)
- Pass, exit 0. 457 test files passed (1 skipped), 5517 tests passed (531 skipped; the PostgreSQL tests skip here and run in CircleCI test-postgres).
- Coverage: statements 81.89%, branches 72.19%, functions 85.32%, lines 83.05%. All above the thresholds.

**Acceptance**
- [x] TASK-1991..1996 are DONE, each with a REVIEW entry.
- [x] BUG-0052 (the Ignored channels text) is DONE, which resolves the TASK-1996 FLAG.
- [x] The schema change ships both migrations, and `pnpm db:check` passes.
- [x] The privacy date follows the maintainer's "Bump terms only" rule.
