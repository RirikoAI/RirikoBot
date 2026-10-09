# Handover Notes: [EPIC-018] Dashboard Usability Improvements

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-09T14:32:04Z · claude-opus-5-5 (coordinator)

**Approach**
- The maintainer asked on 2026-10-09 for usability polish on the dashboard after rc.4, starting with the guild sidebar (STORY-182). More improvements will follow as new stories under this epic.
- Do not start work until the maintainer says so. They want to list the other improvements first.

**Relevant code** (from CodeGraph during grooming)
- `apps/web/src/lib/dashboard-nav.ts` `GUILD_NAV_ITEMS`: the guild pages, in sidebar order.
- `apps/web/src/components/guild-nav.tsx` `GuildNav`: renders the sidebar and the mobile strip.
- `apps/web/src/app/dashboard/[guildId]/layout.tsx` `GuildLayout`: the aside that holds the nav.

**Pitfalls**
- `GUILD_NAV_ITEMS` labels also name modules in dashboard change notices (`apps/web/src/lib/server/discord-notifier.ts:94`), and `GUILD_NAV_ITEMS[0]` is the default page (`apps/web/src/app/dashboard/[guildId]/page.tsx:11`). Keep slugs, labels and the first entry stable unless a story says otherwise.

**Out of scope**
- New dashboard modules or pages.
