# Handover Notes: [STORY-183] Owner Console Server List with Inviters and Cross-Server Command Usage

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-09T14:58:10Z · claude-opus-5-5 (coordinator)

**Approach**
- Maintainer request (2026-10-09): in the owner console, list every server the bot is in, with the server name and the member who invited the bot, for bot owners only. Also show the most used commands, as on the server Overview, so the owner can see when a server sends an unrealistic number of commands.
- Order: TASK-1831 (the bot records servers and inviters), then TASK-1832 (the page). The page needs the data, so TASK-1832 requires TASK-1831.

**Decisions made while grooming**
- **Where the server list comes from:** the existing `guilds` table (`packages/database/src/schema/pg/identity.ts:26`). Nothing writes it today. The bot fills it, so the page needs no Discord call per server and keeps servers the bot has left.
- **Who invited the bot:** Discord does not tell a bot who added it. The audit log has a `BotAdd` entry with the executor. The invite asks for View Audit Log (`BOT_INVITE_PERMISSIONS` includes bit 7), but Discord keeps entries for 45 days only, and a server can deny the permission. So the inviter can be unknown; the page always shows the server owner as well.
- **Command counts:** `command_usage_daily` stores counts per server, day and command, kept 90 days (`CommandUsageRecorder`). That is enough to see a server or a command spike on a day. It does not record who ran a command or the time of day; per-user or per-minute rate tracking is out of scope.
- **Access:** `requireOwner` already gives non-owners a 404 and requires a passkey check from the last five minutes. The owner layout checks first; the page checks again with its own path, like the other owner pages.

**Out of scope**
- Automatic abuse flags or thresholds, blocking or leaving a server from the page, per-user usage, member counts per server (one Discord call per server).

---

## REVIEW · 2026-10-09T16:45:00Z · claude-opus-5-5 (coordinator) · DONE

**Acceptance**
- [x] TASK-1831 (DONE): the bot records its servers, owners and inviters in `guilds`, with an additive upgrade for existing databases.
- [x] TASK-1832 (DONE): the owner console Servers tab, owner-only, with the server list and cross-server command usage.

**Worker tier**
- Executed through its two tasks on the `medium` tier; the story itself was not run as one unit.
