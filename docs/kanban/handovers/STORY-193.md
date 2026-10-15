# Handover Notes: STORY-193 Privacy Notice, AI Consent and Data Retention Before the Public Bot Runs 2.0

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-12T16:25:21Z · claude-opus-5-5 (coordinator)

**Why**: the maintainer reviewed the TASK-1923 legal drafts on 2026-10-12/13 and decided how 2.0 treats user data. The texts may only describe behaviour that ships, so this story ships before the public bot runs 2.0 (STORY-191 and TASK-1911 require it).

**Maintainer decisions** (2026-10-13):
- One-time notice on a user's first interaction (not a DM on join): continuing means accepting the terms and the privacy policy, with links.
- AI needs an explicit "I agree" first, on public and self-hosted bots; no switch to turn it off. The prompt names each provider and says they keep data the maintainer cannot control.
- `ai clear` (this channel), `ai clear all`, `ai consent withdraw`.
- Automatic purge: AI chat, music history and image jobs after 90 days; audit entries after a year.
- Stance: follow GDPR and PDPA principles without claiming certified compliance; the maintainer is the DPO at me@angel.net.my; erasure by hand until STORY-194.

**Order**: TASK-1931 and TASK-1932 and TASK-1934 are independent; TASK-1933 needs TASK-1931 and TASK-1932. TASK-1923 (rework) can run in parallel since it is docs only, but its review checks the texts against what this story ships.

**Schema changes**: TASK-1931 and TASK-1934 change the schema. Each ships its generated migration for both dialects (AGENTS.md rule 5.9). The user runs `next dev` from this checkout: tell them to run the migration locally after each.

## GROOMING · 2026-10-12T16:45:05Z · claude-opus-5-5 (coordinator)

**Added TASK-1935** (8 pts): the maintainer decided on 2026-10-13 that a server's data is deleted 90 days after the bot leaves. It needs a `left_at` column and a purge over 41 `guild_id` columns with no foreign keys, so it is its own ticket after TASK-1934. Story points raised to 21. Also decided: the terms require users to be 18 or older, with no lower age.

## GROOMING · 2026-10-14T16:40:42Z · claude-opus-5-5 (coordinator)

**Added TASK-1936** (3 pts): Bahasa Malaysia versions of both legal texts (maintainer decision 2026-10-15, PDPA notice in both languages). Runs after TASK-1923. Also decided: no DPO is named; the maintainer is the privacy contact.
