# Chore Handover Note: [CHORE-0301] Discord Bot Dev Entrypoint, Ping Command & Environment Compatibility

- **Ticket Type & Points**: Chore | 2 pts (Fibonacci)
- **Author / Agent**: lead-architect / discord
- **Status**: DONE
- **Timestamp**: 2026-09-15T21:45:00+08:00
- **Parent**: `EPIC-003: Discord.js 14 Gateway & O(1) Command Router`

---

## 1. Executive Summary & Deliverables
`CHORE-0301` enables local development and interactive testing for the Ririko AI 2.0.0 Discord bot:

1. **Environment Compatibility Layer**:
   - Updated [`packages/core/src/config/schema.ts`](file:///z:/Projects/ririko-v2-2026/packages/core/src/config/schema.ts) with `z.preprocess` to seamlessly map legacy 1.4.0 environment variables (`DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`) to 2.0.0 standards (`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`).
   - Updated [`apps/cli/src/doctor/checks.ts`](file:///z:/Projects/ririko-v2-2026/apps/cli/src/doctor/checks.ts) so `ririko doctor` checks both 2.0 and 1.4 naming conventions.
   - Updated [`.env`](file:///z:/Projects/ririko-v2-2026/.env) with normalized credentials and database defaults.
2. **Standalone Executable Entrypoint ([`apps/bot/src/main.ts`](file:///z:/Projects/ririko-v2-2026/apps/bot/src/main.ts))**:
   - Initializes `createBot()` and Gateway lifecycle state machine.
   - Sets up `CommandRouter` with configurable prefix (default: `!`) and bot mention prefix.
   - Implements and registers `/ping` and `!ping` latency & heartbeat diagnostics command.
   - Registers interactive dynamic Help Center (`/help`, `!help`, `!commands`).
   - Binds help menu interactive components (string select menu and pagination buttons).
   - Configures graceful shutdown traps (`SIGINT`, `SIGTERM`) for gateway cleanup.
   - Supports optional Discord REST v10 slash command synchronization via `SYNC_COMMANDS=true`.
3. **Workspace Dev Scripts**:
   - Added `"dev"` and `"start"` scripts to [`apps/bot/package.json`](file:///z:/Projects/ririko-v2-2026/apps/bot/package.json).
   - Added `"dev:bot"` and `"start:bot"` scripts to root [`package.json`](file:///z:/Projects/ririko-v2-2026/package.json).

---

## 2. Quality Gate Verification
| Check | Command | Result |
|---|---|---|
| Build | `pnpm run build` | **PASSED** (`tsc -b` clean across all workspaces) |
| Typecheck | `pnpm run typecheck` | **PASSED** (0 errors across 5 workspaces) |
| Lint | `pnpm run lint` | **PASSED** (0 errors, 0 warnings) |
| Format | `pnpm run format:check` | **PASSED** (Prettier clean) |
| Tests | `pnpm run test` | **PASSED** (141 / 141 tests passing across 19 suites) |
| Diagnostics | `node --env-file=.env ./apps/cli/dist/index.js doctor` | **PASSED** (6 passed, 4 optional warnings, System healthy) |

---

## 3. How to Start the Bot for Testing
- **Development mode (with TypeScript hot reload)**:
  ```powershell
  pnpm dev:bot
  # or
  pnpm --filter @ririko/bot dev
  ```
- **Synchronizing slash commands to Discord**:
  ```powershell
  $env:SYNC_COMMANDS="true"; pnpm dev:bot
  ```
- **Compiled production mode**:
  ```powershell
  pnpm start:bot
  ```
