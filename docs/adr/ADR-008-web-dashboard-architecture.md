# ADR-008: Web Dashboard Architecture

## Status
Accepted. Decision 2 amended by [ADR-013](ADR-013-dashboard-sessions-and-credential-theft-defense.md).

## Context
Ririko 1.4.0 only contained a static placeholder HTML file (`public/index.html`) served by Express. Guild administrators had no visual interface to view analytics, manage server configurations, browse the item shop, or manage card collections.

## Decision
1. **Framework**: Adopt **Next.js 16 (App Router)** with **React 19** located in `apps/web`.
2. **Authentication**: Implement Discord OAuth2 authentication requesting `identify` and `guilds` scopes. Sessions are opaque, revocable and stored server-side, not `iron-session` or JWT cookies (see [ADR-013](ADR-013-dashboard-sessions-and-credential-theft-defense.md)).
3. **Authorization**: Verify `ManageGuild` permission on Discord guilds before granting administrative configuration access.
4. **Code Sharing**: Share Zod validation schemas, domain interfaces, and Drizzle database models directly between `packages/database`, `packages/core`, and `apps/web`.
5. **Styling**: Use Tailwind CSS with dark mode as default and subtle modern anime aesthetics.

## Consequences
### Positive
- Unified fullstack TypeScript monorepo with zero schema drift between bot commands and web dashboard.
- High security: Discord bot token and private database credentials remain strictly on the server side.
- Rich user experience: Web-based Waifu card collection album, marketplace browser, and server analytics.

### Negative
- Requires deploying and maintaining a secondary Node.js web process alongside the Discord bot process.
