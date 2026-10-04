# AGENTS.md — Ririko AI 2.0.0 Project Context & Agent Guidelines
Rules for every AI agent on this project: Claude Code, Gemini CLI, Codex, opencode, and others. `CLAUDE.md` and `GEMINI.md` import this file.
Based on the blueprint in [BLUEPRINT.md](BLUEPRINT.md) and [docs/kanban/protocol.md](docs/kanban/protocol.md).

Sections 1–3 come from the [Scrum-Kanban-Template](https://github.com/earnestangel/Scrum-Kanban-Template). The template's `upgrade` command replaces the text between the `scrum-kanban` markers; edit project rules in sections 4 and up.

<!-- scrum-kanban:start -->
## Scrum Kanban Governance & Standing Operating Rules
All agents and subagents follow the **Scrum Kanban Protocol** in [docs/kanban/protocol.md](docs/kanban/protocol.md). Summary:

### 1.1. Agent Invariants
These are hard lines for every agent, on every provider (protocol section 1.3).

**Every agent MUST NOT:**
- Start a ticket that is not a groomed `TODO` with every `requires` ticket `DONE`.
- Let a second ticket be `IN_PROGRESS`.
- Read code, edit files, or run commands for a ticket before claiming it on the board.
- Edit `BOARD.md` by hand, or delete handover entries.
- Weaken, skip, or delete tests to make `verify_cmd` pass.
- Search code before running the ticket's `context.codegraph_queries`, when `.codegraph/` exists.
- Commit, push, or open PRs without the user's confirmation. Workers never do.
- Execute a ticket on a model tier other than the ticket's `model`, unless the user approved it for that ticket.

**The coordinator MUST NOT:**
- Execute a ticket itself. It dispatches a worker on the ticket's tier (protocol section 6.3.1), whatever its own model is.
- Edit files outside `docs/kanban/` and the `coordinator_paths` globs in `board.json` while a ticket is `IN_PROGRESS`.

**The coordinator MUST:**
- Keep `board.json` authoritative and `BOARD.md` rendered.
- Groom a ticket before it enters `TODO`.
- Reconcile orphaned `IN_PROGRESS` claims at session start (protocol section 5.3).
- Resolve or escalate every `BLOCKED` ticket.
- Check the Definition of Done (protocol section 3.3) before it sets `DONE`.
- Stop and ask the user when an Epic or Story completes.

### 1.2. Roles
The workflow is provider-agnostic. Claude Code, Gemini CLI, Codex, opencode, and any other agent that reads `AGENTS.md` run the same steps.

- **Coordinator** (main session, strongest available model): grooms tickets, writes `GROOMING` handovers, dispatches the worker, reviews, talks to the user. It never executes a ticket.
- **Worker**: executes one groomed ticket with the **Worker Procedure** (protocol section 6.5), on the model that the ticket's tier maps to, one at a time, in the main checkout with no worktree. How to start it on each provider: protocol section 6.3.1.
  - Claude Code: Agent tool, `subagent_type: "ticket-worker"`, `model` = `haiku` (small), `sonnet` (medium), or `opus` (large). A hook denies other dispatches.
  - Gemini CLI, Codex, opencode: a subagent or a headless run of the CLI on the tier's model, with the worker prompt from protocol section 6.3.1.
  - No way to change the model: stop and ask the user to run the worker prompt in a new session on the tier's model. Run it inline only with the user's approval.

### 1.3. WIP Limit & Escalation
- At most **one** ticket is `IN_PROGRESS` on the whole board (`wip_limit` in `board.json`). The work is serial by design, so every AI provider can run it in one checkout.
- To start a ticket while another is active: **stop and ask the user** whether to `PAUSE` or `ABANDON` the active one.
- A worker that cannot go on (missing dependency, failure outside its files, unclear or conflicting acceptance, ticket too large) sets `BLOCKED` with a `blocked_reason` and a `PROGRESS · … · BLOCKED` entry, then stops. `BLOCKED` frees the WIP slot. The coordinator resolves it or asks the user.
- At session start, if a ticket is `IN_PROGRESS` and this session did not claim it, ask the user whether its agent is still running. If not, record the leftover edits and set it to `PAUSED` (protocol section 5.3).

### 1.4. Grooming, Review, Done
- Fibonacci points (1, 2, 3, 5, 8, 13, 21). 13+ must be split; a Story split into Tasks may total 13+, but each Task stays under 13. Nothing leaves `BACKLOG` without an estimate.
- `model` is a provider-neutral tier: `small`, `medium`, or `large` (protocol section 1.2 maps tiers to models).
- A ticket enters `TODO` only when it has `model`, `context` (files, symbols, and codegraph_queries when CodeGraph is installed), `acceptance`, `verify_cmd`, and a `GROOMING` handover entry (protocol section 3.1).
- A ticket enters `REVIEW` only when `verify_cmd` passes, every `acceptance` item is met, and every `FLAG` on it is addressed in a `PROGRESS · … · REVIEW` entry (protocol section 3.2).
- A ticket enters `DONE` only after the coordinator reruns `verify_cmd`, checks acceptance against the diff, writes a `REVIEW · … · DONE` entry, and removes its `HANDOVERS.md` rows (protocol section 3.3).

### 1.5. Handover Notes
- `docs/kanban/handovers/<ID>.md` is an append-only log per ticket, story, or epic. Template: `_TEMPLATE.md`.
- Entry types: `GROOMING` (coordinator), `PROGRESS` (worker, on PAUSED/BLOCKED/REVIEW/ABANDONED), `REVIEW` (coordinator, DONE or REWORK), `FLAG` (any agent, written into the **target** ticket's note, and indexed in `HANDOVERS.md`).
- Before starting work, read the epic note, the story note, every note in the ticket's `handovers` field, then the last `PROGRESS` entry of each `requires` ticket.

### 1.6. Board Files
- `docs/kanban/board.json` is the only source of truth.
- `docs/kanban/BOARD.md` is generated. After every `board.json` change, run `node scripts/kanban/render-board.mjs`. Never edit `BOARD.md` by hand.
- **Board first, work second.** Every agent and subagent sets its ticket to `IN_PROGRESS` (with `assignee` and `claimed_at`) and regenerates `BOARD.md` **before** it reads code, edits files, or runs commands for that ticket. Humans must see what agents are working on while the work happens, not after. Every later status change is rendered the moment it happens.

### 1.7. Git & PRs
- Branches `feature/|fix/|chore/<TICKET-ID>-<slug>`, PRs target `develop/2.0.0`.
- When an Epic or Story completes, **stop and ask the user** before committing, pushing, or opening a PR. Workers never commit or push.

---

## 2. Documentation Catalog
- docs/kanban/protocol.md — Full governance & knowledge transfer protocol.
- docs/kanban/board.json — Ticket registry (source of truth). `_ticket_template` shows every field.
- docs/kanban/BOARD.md — Generated human-readable board.
- docs/kanban/handovers/ — Handover notes, `_TEMPLATE.md`, and `HANDOVERS.md` (open flags).
- [Scrum-Kanban-Template README](https://github.com/earnestangel/Scrum-Kanban-Template#readme) — Setup, upgrade, CodeGraph install, hooks.
<!-- scrum-kanban:end -->

<!-- CODEGRAPH_START -->
## 3. CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. Pass `projectPath` = repository root. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.
- On a ticket, run **all** of its `context.codegraph_queries` before any other code search. This applies on every provider. Use Grep/Glob/shell search only for non-code text or when CodeGraph returns nothing. In Claude Code, a hook also denies the first code search per agent until CodeGraph is used, as a safety net.
- Before Edit, Read only the needed line range (`offset`/`limit`), not the whole file.
- The index re-syncs on save while a daemon runs; hooks sync at session start and after git checkout/merge/rebase. If results look stale, run `codegraph sync` and retry.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

---

## 4. Project Overview & Scope
**Ririko AI 2.0.0** is the next-generation, production-grade overhaul of the Ririko Discord bot (originally version 1.4.0).
- **Production Target Date**: 2026-08-14
- **Core Philosophy**: Modernize the architecture, eliminate technical debt, enhance scalability, and implement modern flagship systems (Waifu TCG, Next.js 16 Web Dashboard, Multi-Provider AI with safe tool calling) while strictly preserving all existing functionality and user familiarity from 1.4.0.
- **Reference Legacy Codebase**: `.local/RirikoBot` (strictly **READ-ONLY**, never modify).

This document governs how AI agents collaborate, divide responsibilities, maintain quality, and execute tasks under the **Scrum Kanban Governance System** (sections 1–2) across the redevelopment of Ririko AI 2.0.0.

---

## 5. Absolute Engineering Rules
1. **Understand Before Modifying**: Never rewrite or delete functionality based on surface impressions. Audit legacy behavior first.
2. **Feature & Command Parity**: Preserve all 141 commands across all categories (with full Slash and Prefix command parity), 60 reaction animations, 11 meme generators, badge graphics, profile rank cards, AVC, reminders, and giveaways.
3. **Zero Data Loss Migration**: Legacy SQLite databases from 1.4.0 must migrate safely and idempotently to 2.0 schemas (PostgreSQL in production, SQLite in development).
4. **No Enterprise Bloat (KISS)**: Do not introduce redundant microservices, message brokers, or deep inheritance hierarchies. Prefer modular composition, small services, and explicit types.
5. **No Placeholders**: Never write stub functions or mock placeholders in place of real working business logic.
6. **Strict Security**: Never store plaintext API keys or OAuth secrets in database tables. Use environment variables or AES-256-GCM encrypted credential vaults.
7. **LLM Security Barrier**: The LLM is never the security boundary. Applications must mediate and enforce Discord permissions before executing any tool call.
8. **Coverage Gate (merge blocker)**: Code that fails any coverage threshold is **NOT MERGED**. `pnpm test:coverage` must pass every threshold in `vitest.config.ts` (lines ≥ 80%, functions ≥ 81%, statements ≥ 79%, branches ≥ 68% as of 2026-10-03). CircleCI's `test` job enforces it. Never lower a threshold to get a build through; write real tests for the code you add or change. See [docs/testing.md §4.1](docs/testing.md).

---

## 6. Technology Stack (2026 Production Baseline)
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

## 7. Agent Roster & Domain Mapping

| Agent Name | Core Domain | Primary Responsibilities | Dedicated Subsystem Doc |
|---|---|---|---|
| `legacy-auditor` | Legacy Analysis | Inspect `.local/RirikoBot` (read-only), document entities, commands, and edge cases. | [docs/legacy-feature-inventory.md](docs/legacy-feature-inventory.md) |
| `architecture` | Systems Architecture | Monorepo package boundaries, dependency graphs, ADRs, clean service interfaces. | [docs/architecture.md](docs/architecture.md) |
| `discord` | Discord Bot Core | Discord.js 14, Slash & Prefix parity, interaction routing, autocomplete, components. | [docs/commands.md](docs/commands.md) |
| `database` | Data & Storage | Drizzle ORM schemas, PostgreSQL & SQLite dual-dialect, 40+ tables, transactions. | [docs/database.md](docs/database.md) |
| `music` | Voice & Audio | Audio player core, extractors (YouTube, Spotify, SoundCloud, Deezer), reactive embeds. | [docs/music.md](docs/music.md) |
| `ai` | Generative AI & LLM | Multi-provider adapters (Gemini, OpenAI, Ollama), isolated context, safe tool calling. | [docs/ai.md](docs/ai.md) |
| `moderation` | Safety & Rules | Warning escalations, audit logging, auto-mod filters, contextual staff notes. | [docs/moderation.md](docs/moderation.md) |
| `image-generation` | Graphics & Synthesis | AI image adapters (Gemini, ComfyUI, Replicate), `@napi-rs/canvas` rank cards, memes. | [docs/adapters.md](docs/adapters.md) |
| `stream-platforms` | Stream Ingestion | Twitch, YouTube, TikTok Live watchers, idempotency keys, thumbnail reupload CDN. | [docs/adapters.md](docs/adapters.md) |
| `economy` | Finance & Levels | Atomic balance transfers, double-entry ledger, anti-spam XP, inventory bags. | [docs/economy.md](docs/economy.md) |
| `waifu-tcg` | Trading Card Game | Ingestion pipeline, 8-tier rarity RNG, 7 elemental affinities (including Ice), P2P trading, WaifuGuilds. | [docs/waifu-tcg.md](docs/waifu-tcg.md) |
| `games` | Interactive Games | `MiniGame` interface, Tic-Tac-Toe (Minimax AI), RPS, HighLow, CoinFlip, Dice, wagering. | [docs/modules.md](docs/modules.md) |
| `dashboard` | Web Application | Next.js 16 (App Router), React 19, Discord OAuth2, 20+ module management tabs. | [docs/dashboard.md](docs/dashboard.md) |
| `security` | AppSec & Compliance | AES-256 vault for secrets, permission checks, input validation (Zod), rate limits. | [docs/architecture.md](docs/architecture.md) |
| `testing` | QA & Verification | Vitest test suites, deterministic RNG seeds, Discord API mock harnesses, quality gates. | [docs/testing.md](docs/testing.md) |
| `devops` | Infra & Operations | Multi-stage Docker, Compose, GitHub Actions CI/CD, `/health` and `/ready` probes. | [docs/deployment.md](docs/deployment.md) |
| `code-reviewer` | Code Quality | TypeScript strictness, error boundary enforcement, dead code removal, performance. | [docs/contributing.md](docs/contributing.md) |
| `migration` | Data Migration | TypeORM SQLite -> Drizzle PostgreSQL/SQLite migration CLI (`--dry-run`), verification. | [docs/migrations.md](docs/migrations.md) |

---

## 8. Collaboration & Coordination Protocol

1. **Read-First Handshake**:
   - Before implementing any domain service, the executing agent must review:
     - `BLUEPRINT.md` (the master platform specification)
     - `docs/kanban/protocol.md` (Scrum Kanban & Handover protocol)
     - `docs/kanban/BOARD.md` (confirm that at most one ticket is in progress)
     - `docs/legacy-feature-inventory.md`
     - `docs/architecture.md`
     - The dedicated subsystem specification in `docs/<subsystem>.md`
     - The corresponding agent file in `.gemini/agents/<agent-name>.md`
2. **Contract-Driven Development**:
   - Define TypeScript interfaces in `packages/core` or domain packages before writing implementation code.
   - Database schema changes must be approved against `packages/database` before being consumed by `apps/bot` or `apps/web`.
3. **Quality Gates & Review Hand-off**:
   - Any new command or service must satisfy:
     ```bash
     pnpm lint
     pnpm typecheck
     pnpm test:coverage
     pnpm build
     ```
   - **Coverage gate**: every agent that touches code follows rule 5.8. A PR that fails any threshold is **NOT MERGED**.
   - All tests involving randomness (TCG drops, gambling, giveaways) MUST use deterministic random seeds.
   - The `code-reviewer` agent has the authority to reject PRs for unhandled promises, missing error boundaries, or non-compliant typing.
4. **Zero Legacy Mutation**:
   - The `.local/RirikoBot` repository is strictly immutable. If an agent attempts to edit files inside `.local/`, the action will be rejected.

---

## 9. Conflict Resolution Rules
- If there is a dispute between **legacy behavior** and **modernization requirements**:
  1. User-facing command interfaces, arguments, and outcomes must remain compatible.
  2. Internal implementation must be modernized to modern 2026 standards (e.g. Drizzle over TypeORM, modular TS over monolithic NestJS).
  3. If a legacy feature was fundamentally broken (e.g. plaintext secrets, memory-only state, 10s polling loops), it must be fixed with a backward-compatible upgrade path.

---

## 10. Project Git & PR Rules
These rules add to section 1.7. Where they differ, this section wins.
- **Base branch**: `develop/2.0.0`. Every PR targets it.
- **Branch names**: `feat/|fix/|chore/<TICKET-ID>-<slug>`. This project uses `feat/`, not the template's `feature/`.
- **Grouped batches**: commits and PRs correspond to a complete Story, Bug, or Epic. Standalone chores are the exception.
- **Maintainer merge gate**: agents push branches and open PRs only after the user confirms (section 1.7). The maintainer verifies the PR and merges it after CI passes. Agents never merge PRs.

---

## 11. Project Documentation Catalog
The Scrum Kanban files are listed in section 2.
- [docs/architecture.md](docs/architecture.md) — Monorepo topology, O(1) command router, dual-dialect DB, audio pipeline.
- [docs/development.md](docs/development.md) — Local setup, CLI commands (`ririko doctor`, `ririko generate:*`), engineering rules.
- [docs/commands.md](docs/commands.md) — Dual-dispatch slash & prefix pipeline, middleware chain, interactive help center.
- [docs/modules.md](docs/modules.md) — 20+ module catalog, autoroles, giveaways, auto-voice, mini-games, feature flags.
- [docs/adapters.md](docs/adapters.md) — Provider adapter architecture, capability discovery, fallback chains (AI, Images, Streams, Music, Games).
- [docs/database.md](docs/database.md) — 40+ table schema specifications, indexes, ACID transactions.
- [docs/migrations.md](docs/migrations.md) — 1.4.0 SQLite to 2.0.0 Drizzle migration runbook, CLI dry-run and verification.
- [docs/testing.md](docs/testing.md) — Testing standards, deterministic RNG seeds, quality gates (`pnpm test`, `typecheck`, `lint`).
- [docs/deployment.md](docs/deployment.md) — Docker multi-stage containerization, docker-compose.production.yml, `/health` and `/ready` probes.
- [docs/dashboard.md](docs/dashboard.md) — Next.js 16 App Router, React 19, Discord OAuth2, 20+ module management pages.
- [docs/ai.md](docs/ai.md) — Dedicated `#ririko-ai` channel, per-user isolated memory, `get_current_time()` tool, safe tool allowlist.
- [docs/music.md](docs/music.md) — Music 2.0 multi-source extractors (YouTube/Spotify/SoundCloud/Deezer), reactive UI without polling.
- [docs/moderation.md](docs/moderation.md) — Moderation cases, dynamic warning escalations, centralized permission verification, AutoMod.
- [docs/economy.md](docs/economy.md) — Event-driven economy, double-entry ledger, anti-spam protections, voice XP rules, banking.
- [docs/waifu-tcg.md](docs/waifu-tcg.md) — Flagship Waifu TCG: waifu.im ingestion, 8-tier rarity math, 7 elemental affinities (including Ice), combat, trading, player market, WaifuGuilds.
- [docs/contributing.md](docs/contributing.md) — Engineering guidelines, PR standards, conventional commits.
- [docs/legacy-feature-inventory.md](docs/legacy-feature-inventory.md) — Full audit of all 141 legacy commands and 17 entities.
- [docs/dependency-evaluation.md](docs/dependency-evaluation.md) — 2026 production dependency evaluations and selections.
- [docs/implementation-roadmap.md](docs/implementation-roadmap.md) — Gantt timeline and milestones for Phases 0 through 7.
- [docs/adr/](docs/adr/) — Architecture Decision Records (ADR-001 through ADR-012+).
