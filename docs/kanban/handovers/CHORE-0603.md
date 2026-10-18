# CHORE-0603 — Align Default Prefix & Dynamic Server Prefix Rendering Across All Help & Subcommands

- **Ticket Type & Points**: Chore | 1 pt
- **Parent**: None (Core Architectural Alignment)
- **Branch**: `develop/2.0.0`
- **Status**: DONE
- **Timestamp**: 2026-09-23T21:55:00+08:00

---

## 1. Summary of Work Accomplished

### 1.1. Problem & Discrepancy
1. **Fallback Split (`!` vs `$`)**:
   - The bot router (`apps/bot/src/main.ts`, `services.ts`), utility commands (`prefix`, `timezone`, `react`), and database schema defaults (`guild_settings.prefix`) all defaulted to `'!'` to maintain 100% backward compatibility with legacy Ririko 1.4.0.
   - However, `.env.example`, `SETUP.md`, `docs/music.md`, `docs/tcg-player-guide.md`, and controllers (`ai-chat.controller.ts`, `tcg/info.command.ts`) fell back to `'$'` or hardcoded `$` prefix examples.
2. **Missing Central Constant**:
   - There was no single source of truth for the default fallback prefix. Literal `'!'` and `'$'` strings were scattered across 10+ different files.
3. **Hardcoded or Slash-Only Subcommand Guidance**:
   - Several help views and subcommands (e.g. `/card action:guide`, `/voice` help, `/tcg-info`) did not dynamically resolve the server's current prefix or rendered slash-only / hardcoded examples, preventing users in custom-prefix servers from knowing the valid prefix commands.

### 1.2. Solutions Implemented
1. **Standardized Default Prefix Constant (`DEFAULT_COMMAND_PREFIX = '!'`)**:
   - Exported `DEFAULT_COMMAND_PREFIX = '!'` from `packages/discord/src/command/types.ts` and `@ririko/discord`.
   - Preserves 100% backward compatibility with legacy 1.4.0 database migrations and Drizzle PostgreSQL / SQLite schema defaults.
2. **Shared Context Prefix Resolver (`apps/bot/src/commands/shared/prefix-resolver.ts`)**:
   - Created `resolveContextPrefix(ctx, services?, fallback?)`:
     - Checks `ctx.invokedPrefix` if invoked via message prefix (and not `'/'`).
     - Queries `services.guildSettingsService.getPrefix(ctx.guildId)` with in-memory caching.
     - Falls back to `process.env.DEFAULT_PREFIX || DEFAULT_COMMAND_PREFIX` in DMs or if unconfigured.
3. **Dynamic Prefix in Interactive Help Center (`packages/discord/src/help`)**:
   - **Home View**: Welcomes users with `Prefix: ${prefix}` and suggests `or type /help command:<name> (or ${prefix}help <name>)`.
   - **Category View**: Lists all commands with `/${cmd}` and `(Prefix: ${prefix}${cmd}${aliases})` with footer `Prefix: ${prefix}`.
   - **Command Inspector**: Displays Syntax with active prefix, Aliases with active prefix, **Usage** with `formatPrefixCommand(usage, prefix)`, Arguments & Subcommands choices, Examples with active prefix, and footer `Prefix: ${prefix}`.
   - **Handler Navigation**: Select menus and buttons (home, pagination, return to category) all preserve and pass `resolvedPrefix`.
4. **Command & Subcommand Guide Alignment (`apps/bot/src/commands`)**:
   - **`/tcg-info`**: All 11 topics (`starter`, `elements`, `gear`, `crafting`, `tutorial`, `dungeon`, `trade`, `market`, `guild`, `achievements`, `overview`) dynamically interpolate `${prefix}` for both slash and prefix command instructions.
   - **`/card action:guide`**: Resolved active prefix and passes it into `buildTcgInfoEmbed('overview', prefix)`.
   - **`/card` Unknown Action**: Suggests `Did you mean ${prefix}card <action>?` when invoked via prefix.
   - **`/autovoice` Help**: Formats voice control listing dynamically with `${prefix}voice <action>`.
   - **`/timezone` & `/prefix` & `/react`**: Unified onto `resolveContextPrefix` and `DEFAULT_COMMAND_PREFIX`.
5. **Documentation & Environment Alignment**:
   - Updated `.env.example`, `SETUP.md`, `docs/music.md`, and `docs/tcg-player-guide.md` to use `!` as the documented default prefix.
   - Updated `apps/cli/src/utils/env-editor.test.ts` sample to `DEFAULT_PREFIX=!`.

---

## 2. Verification & Quality Gates

- `pnpm -r run typecheck` — **Exited 0** across all 8 projects.
- `pnpm lint` — **0 errors** (557 pre-existing warnings).
- `pnpm --filter @ririko/discord test` — **All 4 test suites, 28/28 tests passing**, including new tests for:
  - Dynamic `Usage` field formatting in command detail view.
  - Subcommands and choices formatting in inspector.
  - Active prefix rendering in home view description and footer.
  - Active prefix rendering in category view description and footer.
- `pnpm --filter @ririko/bot test` — **All test suites passing**, including:
  - `prefix-resolver.test.ts`: Context prefix precedence and fallbacks.
  - `info.command.test.ts`: Default `!` prefix and dynamic custom prefix rendering across all guide topics.
  - `card.command.test.ts` & `settings.commands.test.ts`: Prefix suggestions and settings updates.
  - `ai-chat.controller.test.ts`: Default `!` prefix ignoring.
- `pnpm --filter @ririko/cli test` — **All tests passing** (`env-editor.test.ts`).
- `pnpm build` — **Exited 0** (`tsc -b`).

---

## 3. Key Decisions & Gotchas

1. **Building `@ririko/discord` Before Typecheck**:
   - When exporting a new constant from a shared monorepo package, run `pnpm --filter @ririko/discord build` so downstream consumers (`apps/bot`) resolve the updated `.d.ts` declaration bundle cleanly.
2. **`resolveContextPrefix` Reliability**:
   - Always wrap `guildSettingsService.getPrefix` in a try/catch falling back to `DEFAULT_COMMAND_PREFIX` so database hiccups or mock environments never crash user interactions.
