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
- `ririko migrate` — Applies pending database migrations.
- `ririko migrate:legacy` — Migrates data from 1.4.0 SQLite databases.
- `ririko command:sync` — Registers slash commands with Discord Gateway REST API.
- `ririko guild:config <guild_id> <key> <value>` — Inspects or updates guild configuration directly.
- `ririko cache:clear` — Prunes expired stream thumbnails and cached waifu assets.
