# STORY-198 · Support Tickets: Open-Ticket Panel, Private Ticket Channels, Claim and Close with Transcripts

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-21T15:45:00Z · claude-opus-5-5 (coordinator)

**Asked by the maintainer** (2026-10-21), picked from the EPIC-021 gap list.

**How it works for a server**
1. An admin turns tickets on at Dashboard › Members › Tickets, and picks a category, the staff roles and (optionally) a transcript channel.
2. The admin posts a panel with `/ticket action:panel channel:#support`. It is an embed with one **Open Ticket** button.
3. A member presses it, types a subject in a modal, and gets `#ticket-0042` under the category. Only the member, the staff roles and Ririko can see it. The welcome embed has **Claim** and **Close** buttons.
4. Staff claim it, and can add or remove a member with `/ticket`.
5. The opener or staff close it with an optional reason. Ririko posts a `.txt` transcript to the transcript channel (or the log channel), then deletes the ticket channel.

**Design decisions** (made during grooming, KISS)
- **Channels, not threads.** A category with permission overwrites is what server admins know from other ticket bots, and staff roles see every ticket without being added one by one.
- **No panel table.** The Open Ticket button's custom id is the constant `ticket:open`, so any panel works, and deleting a panel message needs no cleanup. The panel is posted by command only, like `/autorole action:send-verify`. Posting from the dashboard (the reaction-role REST flow with passkey step-up) is a possible follow-up, not part of this story.
- **One ticket type per server.** Several panels with their own categories and staff ("Support", "Appeals") are a follow-up.
- **Transcripts are not stored.** The transcript goes to a channel in the server as a file. The database keeps only ticket metadata. This keeps message content out of Ririko's data and the privacy policy simple.
- **Numbering** uses `ticket_settings.next_number`, incremented in the same transaction as the insert, with a unique index on (guild_id, number) as the backstop.
- **Close order:** post the transcript first, then mark closed and delete the channel. If the post fails, nothing is lost.

**Task order:** TASK-1981 (schema) → TASK-1982 (config module) → TASK-1983 (service) → TASK-1984 (bot), and TASK-1985 (dashboard) after TASK-1982. TASK-1986 (docs) is last.

**CodeGraph note.** This container had no CodeGraph CLI or MCP tool, so the queries in each ticket were written from a grep and read pass over develop at dbe22fe, not run. A worker whose query returns nothing useful falls back to the files and symbols listed, and records the query that worked in its PROGRESS entry.

**Out of scope for the whole story:** ticket types or multiple panels, dashboard panel posting, an HTML transcript, auto-closing idle tickets, ticket ratings, and DM notifications.

---

## REVIEW · 2026-10-21T18:05:00Z · claude-opus-5-5 (coordinator) · DONE

**verify_cmd rerun**
- Pass: `pnpm db:check`, `pnpm typecheck`, `pnpm lint --quiet`, `pnpm format:check`, and `pnpm test:coverage`. The coverage run had 452 files and 5,398 tests passing, with 525 skipped (PostgreSQL cases, since this container has no server). Coverage is statements 81.74%, branches 72.02%, functions 84.97% and lines 82.93%, all above the thresholds.

**Acceptance**
- [x] TASK-1981 to TASK-1986 are DONE.

**Decisions made with the maintainer during the story**
- Terms notice version raised to 2026-10-21, with AI consent left at 2026-10-15 (decision card "Bump terms only").

**Open for CI**: the PostgreSQL behaviour tests of TicketRepository run only in CircleCI's test-postgres job.

**Possible follow-ups (not groomed)**: several ticket types or panels, posting the panel from the dashboard, an open-ticket list on the dashboard, auto-closing idle tickets, a conditional claim.
