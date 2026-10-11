# ADR-012: Job Scheduler and Background Tasks

## Status
Accepted

## Context
Ririko 1.4.0 implemented background scheduling using ad-hoc mechanisms:
- NestJS `@Cron` running every minute or 30 seconds.
- `discord-giveaways` maintaining internal polling loops against a flat `giveaways.json` file.
- `MusicService` creating unmanaged `setInterval(10000)` loops per guild to edit embeds.
When the bot crashed or restarted, pending giveaways or reminders were susceptible to corruption or skipped triggers.

## Decision
1. **Single Source of Truth**: All recurring and scheduled jobs (reminders, giveaways, stream checks, free game polls) derive their state from the database (`reminders`, `giveaways`, `stream_subscriptions`).
2. **Unified Job Scheduler Engine**: Implement a lightweight, resilient job coordinator:
   - For single-node deployments: A precision timer queue that polls due timestamps with sub-second accuracy and marks tasks as completed within atomic transactions.
   - For multi-node cloud deployments: Ready to connect to Redis/PgBoss queues.
3. **Elimination of Message Polling**: Prohibit arbitrary `setInterval` message editing loops. All Discord message edits must be triggered reactively by system events or user interactions.

## Consequences
### Positive
- Reminders and giveaways survive bot restarts and reboots with zero lost events.
- Eliminates Discord API rate limit bans caused by background message editing loops.
- Deterministic, testable background task execution.

### Negative
- Requires maintaining task state transitions (`pending` -> `processing` -> `completed` / `failed`) in database tables.
