# STORY-200 · Level Role Rewards: Roles Given Automatically at Chosen Levels

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-22T04:40:00Z · claude-opus-5-5 (coordinator)

**Asked by the maintainer** (2026-10-22): "Lets do the next essential feature." This is item 3 of the EPIC-021 gap list.

**How it works for a server**
1. On Dashboard › XP & Ranking, a "Level role rewards" form lists rows of level and role, for example 5 → @Regular and 20 → @Veteran, plus a "Keep lower reward roles" switch. Staff can do the same with `/levelroles add|remove|list`.
2. When a member levels up (chat, voice or an item, all of which go through `LevelingService.addExperience` and emit `leveling:levelUp`), Ririko gives the reward roles for the new level.
3. A member who leaves and comes back keeps their XP (it is per guild), so on guildMemberAdd Ririko gives the rewards for their level again.
4. `/levelroles sync` gives the rewards to members who already had the level before the reward was added.

**Design decisions** (KISS)
- **Own module `levelroles` and table `level_role_settings`** (rewards JSON list plus keep_previous_roles), the same shape as `event_log_settings`. No new columns on `guild_settings`.
- **Role for a level is worked out from the level, not from the levels crossed.** A jump of several levels and a rejoin both work, and a reward added later is picked up at the member's next level-up.
- **Keep lower roles (default on)** stacks every reward at or below the level. Off means only the highest reward's role is held, and other reward roles are removed. Ririko never removes a role that is not in the reward list, and it does not take roles away when a reward is deleted from the list.
- **Hook on the event bus**, not in message.listener.ts, so chat, voice and items are all covered. The announcement settings do not affect rewards.
- **Safe assignment**: the same checks as AutoRoleService (exists, not @everyone, not managed, below Ririko's highest role, Manage Roles). Errors are logged and never thrown.
- **Sync on request only.** Changing the rewards does not start a sync by itself, because a big server could mean thousands of role calls. One sync per server at a time; discord.js queues the rate limits.
- **Privacy:** only role IDs and levels per server are stored. XP is already covered by the policy, so TASK-2007 only checks this.
- Limits: 25 rewards, levels 1 to 1000.

**Task order:** TASK-2001 (table) → TASK-2002 (config module) → TASK-2003 (service) → TASK-2004 (listener and wiring) and TASK-2005 (command). TASK-2006 (dashboard) needs only TASK-2002. TASK-2007 (docs) is last.

**CodeGraph note:** this container has no CodeGraph, as for STORY-198 and STORY-199. The queries were written from reading the code at 89912fd, not run. Fall back to ranged Reads and Grep.

**Out of scope:** role rewards for levels lost (XP never goes down today), a reward announcement in the level-up message, per-channel XP multipliers, and an automatic sync after a settings change.

---

## REVIEW · 2026-10-22T06:50:00Z · claude-opus-5-5 (coordinator) · DONE

**Story gates rerun** (`pnpm build && pnpm db:check && pnpm typecheck && pnpm lint --quiet && pnpm format:check && pnpm docs:build && pnpm test:coverage`)
- Pass, exit 0.
- 465 test files passed (1 skipped). 5658 tests passed and 538 were skipped; the PostgreSQL tests skip locally and run in CircleCI test-postgres.
- Coverage: statements 82.03%, branches 72.36%, functions 85.48% and lines 83.18%. All are above the thresholds.

**Acceptance**
- [x] TASK-2001 to TASK-2007 are DONE, and each has a REVIEW entry.
- [x] The schema change ships both 0008 migrations, which only create the table, and `pnpm db:check` passes.
- [x] No privacy policy change is needed (TASK-2007).
