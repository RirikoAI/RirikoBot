# GEMINI.md — Ririko AI 2.0.0 Project Context & Agent Guidelines

## 1. Project Overview
**Ririko AI 2.0.0** is the next-generation, production-grade overhaul of the Ririko Discord bot (originally version 1.4.0).
- **Production Target Date**: 2026-08-14
- **Core Philosophy**: Modernize the architecture, eliminate technical debt, enhance scalability, and add modern flagship features (Waifu TCG, Next.js 16 Web Dashboard, Multi-Provider AI with safe tool calling) while strictly preserving all existing functionality and user familiarity from 1.4.0.
- **Reference Legacy Codebase**: `.local/RirikoBot` (strictly **READ-ONLY**, never modify).

---

## 2. Absolute Engineering Rules
1. **Understand Before Modifying**: Never rewrite or delete functionality based on surface impressions. Audit legacy behavior first.
2. **Feature & Command Parity**: Preserve all 141 commands across all categories (with full Slash and Prefix command parity), 60 reaction animations, 11 meme generators, badge graphics, profile rank cards, AVC, reminders, and giveaways.
3. **Zero Data Loss Migration**: Legacy SQLite databases from 1.4.0 must migrate safely and idempotently to 2.0 schemas (PostgreSQL in production, SQLite in development).
4. **No Enterprise Bloat**: Do not introduce redundant abstraction layers or deep inheritance hierarchies. Follow the KISS principle (Keep It Simple, Stupid) with modular composition.
5. **No Placeholders**: Never write stub functions or mock placeholders in place of real working business logic.
6. **Strict Security**: Never store plaintext API keys or OAuth secrets in database tables. Use environment variables or AES-256-GCM encrypted credential vaults.

---

## 3. Technology Stack (2026 Production Baseline)
- **Runtime**: Node.js 22+ LTS / Node.js 24 LTS, ESM-first (`"type": "module"`).
- **Language**: TypeScript 5.8+ / 6.x in strict mode (`strict: true`, `noImplicitAny: true`, `exactOptionalPropertyTypes: true`).
- **Package Manager**: pnpm 10.x with pnpm workspaces.
- **Database Layer**: Drizzle ORM with dual-dialect abstraction:
  - Production: PostgreSQL (`postgres` / `drizzle-orm/node-postgres`)
  - Development / Self-hosting: SQLite (`better-sqlite3` / `drizzle-orm/better-sqlite3`)
- **Discord Framework**: Discord.js 14.x with REST API v10, Gateway v10, and modern Component Builders.
- **Web Dashboard**: Next.js 16 (App Router), React 19, Tailwind CSS, Discord OAuth2 authentication.
- **Audio Core**: Resilient audio extractor/player core (Discord Player 7 / Lavalink 4 adapter architecture).
- **AI Engine**: Multi-provider adapter (Google Gemini, OpenAI, Ollama) with structured function tool calling and streaming.
- **Graphics & Canvas**: `@napi-rs/canvas` (prebuilt Rust/Skia binaries, eliminating heavy system cairo/pango dependencies).
- **Testing**: Vitest for unit & integration tests, Playwright for E2E web tests.
- **DevOps**: Multi-stage rootless Docker, Docker Compose, GitHub Actions CI/CD.

---

## 4. Monorepo Structure
```text
ririko-v2-2026/
├── apps/
│   ├── bot/                # Discord bot Gateway client & lifecycle
│   ├── web/                # Next.js 16 management dashboard & portal
│   └── cli/                # Developer & admin CLI (ririko doctor, migrate, generate)
├── packages/
│   ├── core/               # Shared domain types, errors, config, event bus
│   ├── database/           # Drizzle ORM schemas, relations, migrations, repositories
│   ├── discord/            # Command dispatcher, interaction router, UI components
│   ├── ai/                 # Multi-provider LLM engine, memory, safe tool calling
│   ├── music/              # Audio player core, extractors, queue management
│   └── services/           # Domain business logic (Economy, TCG, Moderation, etc.)
├── docs/                   # Architecture, ADRs, migration guides, specifications
├── .gemini/
│   └── agents/             # Specialist agent definitions (18 agents)
├── GEMINI.md               # This project guideline
└── AGENTS.md               # Multi-agent coordination and responsibilities
```

---

## 5. Specialist Agents Directory
When performing tasks in this repository, consult the specialized instructions in `.gemini/agents/`:
- `legacy-auditor.md`: Auditing 1.4.0 legacy code and schemas.
- `architecture.md`: Monorepo structure, package decoupling, and design patterns.
- `discord.md`: Discord.js v14 interactions, slash/prefix command routing.
- `database.md`: Drizzle ORM schemas, relations, and dual PostgreSQL/SQLite support.
- `music.md`: Audio extractors, queues, and playback stability.
- `ai.md`: Conversational memory, Gemini/OpenAI adapters, tool calling.
- `moderation.md`: Warning escalations, auto-moderation rules, audit logging.
- `image-generation.md`: Multi-backend AI image generation, meme synthesis, canvas cards.
- `stream-platforms.md`: Twitch, YouTube Live, TikTok Live watcher with thumbnail caching.
- `economy.md`: Double-entry transaction ledger, anti-spam XP, banking, shop.
- `waifu-tcg.md`: Anime card ingestion, 8-tier rarity, combat, trading, and Waifu Guilds.
- `games.md`: MiniGame interface, Tic-Tac-Toe, RPS, HighLow, CoinFlip, Dice.
- `dashboard.md`: Next.js 16 web portal, Discord OAuth2, server settings.
- `security.md`: Encryption at rest, input validation, permission gates, rate limiting.
- `testing.md`: Vitest unit/integration tests, Discord mocks.
- `devops.md`: Docker, Compose, CI/CD pipelines, health probes.
- `code-reviewer.md`: TypeScript strictness, error handling, performance standards.
- `migration.md`: Legacy SQLite to Drizzle PostgreSQL/SQLite migration pipeline.

---

## 6. Execution Guidelines for Agents
1. **Always maintain clickable file links** using github markdown links (`[path/file.ts](file:///path/file.ts)`).
2. **Run verification commands** (`pnpm test`, `pnpm typecheck`, `pnpm lint`) after making changes.
3. **Keep documentation in sync**: Any architectural changes must be reflected in `docs/architecture.md` or a new ADR in `docs/adr/`.
4. **Preserve backward compatibility**: When updating database schemas, ensure existing legacy data fields are mapped without data loss.
