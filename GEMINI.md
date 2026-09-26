# GEMINI.md — Ririko AI 2.0.0 Project Context & Agent Guidelines
Based on the blueprint in [BLUEPRINT.md](file:///Z:/Projects/ririko-v2-2026/BLUEPRINT.md) and [docs/kanban/protocol.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/protocol.md)

## 1. Project Overview
**Ririko AI 2.0.0** is the next-generation, production-grade overhaul of the Ririko Discord bot (originally version 1.4.0).
- **Production Target Date**: 2026-08-14
- **Core Philosophy**: Modernize the architecture, eliminate technical debt, enhance scalability, and implement modern flagship systems (Waifu TCG, Next.js 16 Web Dashboard, Multi-Provider AI with safe tool calling) while strictly preserving all existing functionality and user familiarity from 1.4.0.
- **Reference Legacy Codebase**: `.local/RirikoBot` (strictly **READ-ONLY**, never modify).

---

## 2. Scrum Kanban Governance & Standing Operating Rules

All agents and subagents are governed by the **Scrum Kanban Protocol** documented in [docs/kanban/protocol.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/protocol.md):

### 2.1. Strict Work-In-Progress (WIP) Limit = 1
- **Only EXACTLY ZERO or ONE ticket may be in `IN_PROGRESS` status on the entire board at any time.**
- Multiple concurrent `IN_PROGRESS` tickets are strictly forbidden across all agents and subagents.

### 2.2. Interruption & Task-Switching Protocol
- If a new task or ticket needs to be started while an existing ticket is `IN_PROGRESS`:
  1. **STOP IMMEDIATELY.** Do NOT start the new task.
  2. **ASK THE USER** to decide the disposition of the current active ticket:
     - **`PAUSED`**: The active ticket is put on hold with state preserved in `docs/kanban/handovers/<ticket-id>.md`.
     - **`ABANDONED`**: The active ticket is permanently retired with documented reasons.
  3. Only after the active ticket transitions to `PAUSED` or `ABANDONED` may the new ticket move to `IN_PROGRESS`.

### 2.3. Fibonacci Estimation
- All tickets (`Epic`, `Story`, `Task`, `Chore`, `Bug`) must be estimated in story points using the Fibonacci sequence:
  $$\mathbf{1,\; 2,\; 3,\; 5,\; 8,\; 13,\; 21}$$
- Tickets are groomed in batches grouped by Epic. No ticket enters `TODO` or `IN_PROGRESS` without an approved estimate.
- Items estimated at 13+ points must be split into smaller Stories or Tasks.

### 2.4. Sub-Agent & Cross-Session Knowledge Transfer
- Every ticket transition (`PAUSED`, `REVIEW`, `DONE`, `ABANDONED`) requires updating:
  - Canonical database: [docs/kanban/board.json](file:///Z:/Projects/ririko-v2-2026/docs/kanban/board.json)
  - Visual board: [docs/kanban/BOARD.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/BOARD.md)
  - Dedicated handover note: `docs/kanban/handovers/<ticket-id>.md` (summary, verification, gotchas, actionable next steps).

### 2.5. Git Operations & PR Governance
- **Base Integration Branch**: `develop/2.0.0`. All feature branches (`feat/<ticket-id>-<slug>`) target `develop/2.0.0`.
- **Grouped Batches**: Commits and PR creations must correspond to a complete Story or Epic (except standalone chores or bugs).
- **Anti-Runaway Session Boundary**: An agent session must NEVER silently complete multiple epics without user review checkpoints. When an Epic or Story completes, **STOP AND ASK THE USER** whether they want to create a Pull Request before proceeding.

---

## 3. Absolute Engineering Rules
1. **Understand Before Modifying**: Never rewrite or delete functionality based on surface impressions. Audit legacy behavior first.
2. **Feature & Command Parity**: Preserve all 141 commands across all categories (with full Slash and Prefix command parity), 60 reaction animations, 11 meme generators, badge graphics, profile rank cards, AVC, reminders, and giveaways.
3. **Zero Data Loss Migration**: Legacy SQLite databases from 1.4.0 must migrate safely and idempotently to 2.0 schemas (PostgreSQL in production, SQLite in development).
4. **No Enterprise Bloat (KISS)**: Do not introduce redundant microservices, message brokers, or deep inheritance hierarchies. Prefer modular composition, small services, and explicit types.
5. **No Placeholders**: Never write stub functions or mock placeholders in place of real working business logic.
6. **Strict Security**: Never store plaintext API keys or OAuth secrets in database tables. Use environment variables or AES-256-GCM encrypted credential vaults.
7. **LLM Security Barrier**: The LLM is never the security boundary. Applications must mediate and enforce Discord permissions before executing any tool call.

---

## 4. Technology Stack (2026 Production Baseline)
- **Runtime**: Node.js 22+ LTS / Node.js 24 LTS, ESM-first (`"type": "module"`).
- **Language**: TypeScript 5.8+ / 6.x in strict mode (`strict: true`, `noImplicitAny: true`, `exactOptionalPropertyTypes: true`).
- **Package Manager**: pnpm 10.x with pnpm workspaces.
- **Database Layer**: Drizzle ORM with dual-dialect abstraction (PostgreSQL in production, SQLite in development/self-hosting).
- **Discord Framework**: Discord.js 14.x with REST API v10, Gateway v10, and modern Component Builders.
- **Web Dashboard**: Next.js 16 (App Router), React 19, Tailwind CSS, Discord OAuth2 authentication.
- **Audio Core**: Resilient multi-source extractor/player core (`@discordjs/voice`, with optional Lavalink 4 adapter).
- **AI Engine**: Multi-provider adapter (Google Gemini, OpenAI, Ollama) with structured function tool calling and streaming.
- **Graphics & Canvas**: `@napi-rs/canvas` (prebuilt Rust/Skia binaries, eliminating heavy system cairo/pango dependencies).
- **Testing**: Vitest for unit & integration tests, Playwright for E2E web tests.
- **DevOps**: Multi-stage rootless Docker, Docker Compose, GitHub Actions CI/CD.

---

## 5. Complete Documentation Catalog (`docs/`)
- [docs/kanban/protocol.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/protocol.md) — Scrum Kanban Governance & Knowledge Transfer Protocol.
- [docs/kanban/BOARD.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/BOARD.md) — Live Scrum Kanban Board (WIP = 1).
- [docs/kanban/board.json](file:///Z:/Projects/ririko-v2-2026/docs/kanban/board.json) — Machine-readable ticket registry.
- [docs/architecture.md](file:///Z:/Projects/ririko-v2-2026/docs/architecture.md) — Monorepo topology, O(1) command router, dual-dialect DB, audio pipeline.
- [docs/development.md](file:///Z:/Projects/ririko-v2-2026/docs/development.md) — Local setup, CLI commands (`ririko doctor`, `ririko generate:*`), engineering rules.
- [docs/commands.md](file:///Z:/Projects/ririko-v2-2026/docs/commands.md) — Dual-dispatch slash & prefix pipeline, middleware chain, interactive help center.
- [docs/modules.md](file:///Z:/Projects/ririko-v2-2026/docs/modules.md) — 20+ module catalog, autoroles, giveaways, auto-voice, mini-games, feature flags.
- [docs/adapters.md](file:///Z:/Projects/ririko-v2-2026/docs/adapters.md) — Provider adapter architecture, capability discovery, fallback chains (AI, Images, Streams, Music, Games).
- [docs/database.md](file:///Z:/Projects/ririko-v2-2026/docs/database.md) — 40+ table schema specifications, indexes, ACID transactions.
- [docs/migrations.md](file:///Z:/Projects/ririko-v2-2026/docs/migrations.md) — 1.4.0 SQLite to 2.0.0 Drizzle migration runbook, CLI dry-run and verification.
- [docs/testing.md](file:///Z:/Projects/ririko-v2-2026/docs/testing.md) — Testing standards, deterministic RNG seeds, quality gates (`pnpm test`, `typecheck`, `lint`).
- [docs/deployment.md](file:///Z:/Projects/ririko-v2-2026/docs/deployment.md) — Docker multi-stage containerization, docker-compose.production.yml, `/health` and `/ready` probes.
- [docs/dashboard.md](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md) — Next.js 16 App Router, React 19, Discord OAuth2, 20+ module management pages.
- [docs/ai.md](file:///Z:/Projects/ririko-v2-2026/docs/ai.md) — Dedicated `#ririko-ai` channel, per-user isolated memory, `get_current_time()` tool, safe tool allowlist.
- [docs/music.md](file:///Z:/Projects/ririko-v2-2026/docs/music.md) — Music 2.0 multi-source extractors (YouTube/Spotify/SoundCloud/Deezer), reactive UI without polling.
- [docs/moderation.md](file:///Z:/Projects/ririko-v2-2026/docs/moderation.md) — Moderation cases, dynamic warning escalations, centralized permission verification, AutoMod.
- [docs/economy.md](file:///Z:/Projects/ririko-v2-2026/docs/economy.md) — Event-driven economy, double-entry ledger, anti-spam protections, voice XP rules, banking.
- [docs/waifu-tcg.md](file:///Z:/Projects/ririko-v2-2026/docs/waifu-tcg.md) — Flagship Waifu TCG: waifu.im ingestion, 8-tier rarity math, 7 elemental affinities (including Ice), combat, trading, player market, WaifuGuilds.
- [docs/contributing.md](file:///Z:/Projects/ririko-v2-2026/docs/contributing.md) — Engineering guidelines, PR standards, conventional commits.
- [docs/legacy-feature-inventory.md](file:///Z:/Projects/ririko-v2-2026/docs/legacy-feature-inventory.md) — Full audit of all 141 legacy commands and 17 entities.
- [docs/dependency-evaluation.md](file:///Z:/Projects/ririko-v2-2026/docs/dependency-evaluation.md) — 2026 production dependency evaluations and selections.
- [docs/implementation-roadmap.md](file:///Z:/Projects/ririko-v2-2026/docs/implementation-roadmap.md) — Gantt timeline and milestones for Phases 0 through 7.
- [docs/adr/](file:///Z:/Projects/ririko-v2-2026/docs/adr/) — Architecture Decision Records (ADR-001 through ADR-012+).

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
