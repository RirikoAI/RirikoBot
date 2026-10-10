# Developer Guide & Tooling Manual (Ririko AI 2.0.0)

## 1. Overview & Engineering Principles
Ririko AI 2.0.0 is developed as a modular monorepo using pnpm workspaces. The architecture prioritizes the **KISS Principle (Keep It Simple, Stupid)** while maintaining clean extension points:
- **Boring, Explicit Code**: Avoid complex meta-programming, global singletons, and deep inheritance chains.
- **Typed Boundaries**: Strict TypeScript interfaces at all package boundaries.
- **Automated Boilerplate**: Repetitive file creation is handled by code generators rather than manual copy-pasting.

---

## 2. Local Environment Setup

### 2.1. Prerequisites
- **Node.js**: `v22.x` or `v24.x` LTS.
- **pnpm**: `v10.x` (`corepack enable && pnpm --version`).
- **FFmpeg**: Required for audio transcoding and music extraction.
- **Git**: Latest version.

### 2.2. Installation
```bash
git clone https://github.com/RirikoAI/RirikoBot.git ririko-v2-2026
cd ririko-v2-2026
pnpm install
cp .env.example .env
```

### 2.3. Quality Commands
These are the same checks CircleCI runs (see [testing.md](testing.md#4-continuous-integration)):
```bash
pnpm lint            # ESLint
pnpm format:check    # Prettier (pnpm format fixes)
pnpm typecheck       # tsc --noEmit in every workspace package, plus the test-only projects
pnpm test            # Vitest (includes the integration suites)
pnpm test:coverage   # Vitest with v8 coverage, report in coverage/index.html
pnpm test:integration  # Only the bot integration suites and the fake Discord API tests
pnpm test:e2e        # Builds the dashboard, then runs the Playwright E2E suite
```

After you change a Drizzle schema, run `pnpm db:generate`. It writes the versioned SQL migrations for both dialects (`packages/database/migrations/`), embeds them as TypeScript, and regenerates the bootstrap DDL. Commit all of the output, and run `pnpm db:check` (the CI migration gate) before you push. The flow is described in [database.md](database.md#1-overview--dual-dialect-strategy) and [ADR-015](adr/ADR-015-versioned-schema-migrations.md).

`pnpm test:e2e` starts its own fake Discord API on port 3199 and `next start` on port 3100 with a throwaway SQLite database, so it can run while `next dev` is up on port 3000. It uses Playwright's Chromium; run `pnpm --filter @ririko/web exec playwright install chromium` once if it is missing. The report is in `apps/web/e2e-results/report/index.html`.

`pnpm site:build` writes the Vercel status page to `site-dist/index.html` (see [deployment.md](deployment.md#4-current-hosting)).

The Prettier baseline commit is listed in `.git-blame-ignore-revs`. Run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once so local `git blame` skips it.

---

## 3. The Ririko CLI (`ririko`)

The monorepo includes a unified developer and operator CLI in `apps/cli`:

### 3.1. Diagnostic System (`ririko doctor`)
Runs a comprehensive environment check:
```bash
ririko doctor
```
Output:
```text
✓ Node.js (v22.23.2)
✓ TypeScript (v5.8.2)
✓ Database Connection (PostgreSQL 16 / SQLite WAL)
✓ Discord Token & Application Verification
✓ Database Migrations (All Applied)
✓ Image Cache Storage (/assets/cache)
✓ Audio Transcoder (FFmpeg detected)

! Twitch Client ID not configured (Optional)
! Google Gemini API Key not configured (Optional)

Diagnosis: 7 passed, 2 optional integrations missing. System healthy!
```

### 3.2. Code Scaffolding Commands
Eliminate boilerplate errors by generating typed skeletons:
- `ririko generate:command <name> <category>` — Creates slash/prefix dual-dispatch command with typed metadata.
- `ririko generate:module <name>` — Scaffolds a new domain module with config schema and repository.
- `ririko generate:adapter <type> <name>` — Scaffolds a provider adapter (AI, Music, Image, Stream).
- `ririko generate:service <name>` — Scaffolds an application service with dependency injection.
- `ririko generate:game <name>` — Creates a new `MiniGame` implementation with session handling.
- `ririko generate:card <name> <rarity> <element>` — Generates a new collectible card asset definition.
- `ririko generate:migration <name>` — Creates a dual-dialect Drizzle migration.

### 3.3. Management & Maintenance Commands
- `ririko dev` — Starts bot and dashboard with hot-reload.
- `ririko db:migrate [--status|--dry-run]` — Applies the schema migrations this release ships to the database in `DATABASE_URL` (ADR-015). The bot does the same at startup unless `DB_AUTO_MIGRATE=false`. `--status` prints the latest, pending and unknown migration ids, `--dry-run` prints the plan (also what adopting an old database would change) and changes nothing. Exit codes: 0 done or nothing to do, 1 failure, 2 refused by the downgrade guard. In the bot image: `docker exec <bot container> ririko db:migrate`. `pnpm db:push` is a development shortcut only; it never runs against staging or production.
- `ririko migrate:legacy` — Migrates data from 1.4.0 SQLite databases.
- `ririko db:copy --from <sqlite path> [--dry-run|--yes]` — Copies a 2.0 SQLite database into an empty PostgreSQL database. The target URL comes only from `TARGET_DATABASE_URL`. Runbook: [docs/migrations.md section 5](migrations.md).
- `ririko command:sync` — Registers slash commands with Discord Gateway REST API.
- `ririko guild:config <guild_id> <key> <value>` — Inspects or updates guild configuration directly.
- `ririko cache:clear` — Prunes expired stream thumbnails and cached waifu assets.
