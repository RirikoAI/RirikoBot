# Handover Note: STORY-120 E2E Integration Tests & Quality Gates Setup

- **Ticket Type & Points**: Story | 8 pts (`TASK-1203` = 2, `TASK-1202` = 3, `TASK-1201` = 3); regroomed from 5 on 2026-10-01
- **Epic**: `EPIC-012`
- **Author / Agent**: Claude Code (Opus 5.5)
- **Status**: REVIEW (PR #669)
- **Timestamp**: 2026-10-01
- **Branch**: `feat/STORY-120-integration-e2e` (targets `develop/2.0.0`)

## 1. Summary of Work Accomplished

### Regrooming (`7e55abd`)
- STORY-120 grew from 5 to 8 points: nothing existed yet (no Playwright, no shared Discord fake, router wiring inline in `main()`, no Discord API base override on the web app). New TASK-1203; TASK-1201 went from 2 to 3 for the CI job.
- Split out: STORY-124 (5 pts, TODO) for Postgres runs of the repository suites, trade/market concurrency and AI provider fallback through `createBotServices`; STORY-125 (backlog, ungroomed) for the 80% coverage target. Audio playback was dropped from TASK-1202 (the voice gateway is not faked).

### TASK-1203: fake Discord API and web API base seam (`050cae6`)
- [tests/support/fake-discord](file:///Z:/Projects/ririko-v2-2026/tests/support/fake-discord/): dependency-free `node:http` server on loopback.
  - `fixtures.ts`: fixture model and Discord v10 serializers. `defaultFixture()` has the bot, `admin` (owns *Ririko Test Server*), `member` (no permissions there) and *Other Server* where `admin` lacks Manage Server.
  - `server.ts`: OAuth2 authorize and token (PKCE verified, user chosen by the `fake_discord_user` cookie), users, guilds, roles, channels, members, channel messages, interaction callbacks, webhook edits, command registration. Records every request and its response; unknown routes answer 404 and land in `unhandled`.
  - `cli.ts` runs it as a process; `/__fake/*` control routes for other processes.
- `DISCORD_API_URL` (optional, default `https://discord.com/api`) in `WebConfigSchema`. It feeds the dashboard's bot-token REST client and `DiscordOAuthClient` (new `apiBase` option, also used for the authorize URL). Plain http is accepted only for loopback, since the bot token and client secret go to that host.
- Root `tests/tsconfig.json`; root `pnpm typecheck` also runs `tsc -p tests`. Vitest includes `tests/**/*.test.ts`.

### TASK-1202: bot gateway harness and integration suites (`7d613de`)
- Behavior-preserving extraction from [main.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/main.ts): [command-router.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/command-router.ts) (`createCommandRouter`, `createHelpOptions`) and [component-interactions.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/component-interactions.ts) (`registerComponentInteractions`).
- [apps/bot/test/support/bot-harness.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/test/support/bot-harness.ts): real services, router, command set and component handler over in-memory SQLite; REST at the fake; gateway packets through `client.ws.handlePacket`.
- Suites in [apps/bot/test/integration](file:///Z:/Projects/ririko-v2-2026/apps/bot/test/integration/): harness self-test, prefix dispatch, slash and context menu dispatch, components (help center, giveaway create → enter → draw), command sync (startup and guild join).
- `pnpm test:integration`; `apps/bot/test/tsconfig.json` is typechecked by the bot package's `typecheck`.

### TASK-1201: Playwright dashboard E2E and CI job (`db61e58`)
- `@playwright/test` 1.63.0 in `apps/web` (the version whose Chromium the YouTube harvester already uses).
- [apps/web/playwright.config.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/playwright.config.ts): starts the fake Discord API (3199) and `next start` (3100) with `e2e/support/seed.ts` recreating a temp SQLite database with 30 cards for `admin`.
- Specs in [apps/web/e2e](file:///Z:/Projects/ririko-v2-2026/apps/web/e2e/): auth, guild access, settings persistence (prefix, AI channel), card album. An auto fixture fails any test when the dashboard called a route the fake does not implement.
- `pnpm test:e2e` (builds, then runs). CircleCI `e2e` job (fonts, cached Chromium, Next build, Playwright; JUnit results and report as artifacts). `apps/web/e2e-results/` is gitignored and ESLint-ignored.

### Docs
- [docs/testing.md](file:///Z:/Projects/ririko-v2-2026/docs/testing.md) sections 1, 3.2 to 3.4 and 4; [docs/development.md](file:///Z:/Projects/ririko-v2-2026/docs/development.md) 2.3; `.env.example` (`DISCORD_API_URL`); roadmap Phase 7.

## 2. Current State & Verification
- `pnpm lint --quiet`, `pnpm format:check` (changed files), `pnpm typecheck`: clean.
- `pnpm test:coverage`: 273 files passed, 1 skipped; statements 68.71%, branches 58.44%, functions 70.28%, lines 70.05% (thresholds 65/54/69/67 pass).
- `pnpm test:integration`: 6 files, 24 tests.
- `pnpm test:e2e`: 9 Playwright tests pass locally with `next dev` still able to run on port 3000.
- CircleCI: not yet run on this branch (the new `e2e` job runs for the first time on push).

## 3. Roadblocks, Gotchas & Decisions Made
- **Locations differ from the first plan**: bot integration tests live in `apps/bot/test/`, not a root `tests/integration`, because only files under `apps/bot` resolve `discord.js` and the bot's packages. The fake stays at the root because it is dependency-free and shared with `apps/web/e2e`.
- **discord.js internals**: the harness sets `client.ws.status` to Ready and calls `client.ws.handlePacket`. Both are private in 14.27. `apps/bot/test/integration/harness.test.ts` is the canary for upgrades.
- **The unhandled-route check already paid off**: discord.js percent-encodes `@original`, which the fake first did not decode.
- **Sign-in goes through the fake's authorize endpoint**, not a Playwright route intercept, because `DISCORD_API_URL` also sets the authorize URL base. No request in E2E reaches discord.com.
- **Rate limits**: each E2E test sends its own `X-Forwarded-For` (the auth routes allow 20 per minute per IP).
- **Settings specs run serially** (both write the main guild's `guild_settings` row).
- **Album page warning**: `next start` logs "This rendered a large document (>512 kB) without any Suspense boundaries" on `/account/album`, because each page inlines 24 card PNGs as data URLs. Pre-existing (STORY-168); not fixed here.
- **Coverage thresholds were not raised**: local numbers are well above them; raise after the CircleCI `test` job confirms its own numbers.
- The message listener (automod, XP, card drops, AI chat) is not wired in the harness, so prefix tests see only the router's replies.

## 4. Actionable Next Steps for Next Session / Continuing Agent
1. PR #669 targets `develop/2.0.0`: watch the first `e2e` job (Chromium install with `--with-deps`, Next build, Playwright). The maintainer merges.
2. After CI is green, consider raising the coverage ratchet to the CI-measured baseline.
3. Next in EPIC-012: STORY-124 (Postgres integration job) reuses the fake Discord API and harness; STORY-121 (rootless Docker) is unblocked once STORY-120 is DONE.
