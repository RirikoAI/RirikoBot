# AGENTS.md — Multi-Agent Orchestration & Governance
Based on the blueprint in [BLUEPRINT.md](file:///Z:/Projects/ririko-v2-2026/BLUEPRINT.md) and [docs/kanban/protocol.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/protocol.md)

## 1. Purpose & Scope
This document governs how AI agents collaborate, divide responsibilities, maintain quality, and execute tasks under the **Scrum Kanban Governance System** across the redevelopment of **Ririko AI 2.0.0**.

---

## 2. Scrum Kanban Standing Rules for All Agents & Subagents

Every agent (main coordinator and specialized subagent) is bound by these operational rules:

### 2.1. Strict WIP Limit = 1
- **Only EXACTLY ONE ticket may be in `IN_PROGRESS` on the board at any time across the entire project.**
- An agent must NEVER start a second task while another ticket is active.

### 2.2. Interruption Protocol
- If a new task or priority arises while a ticket is currently `IN_PROGRESS`:
  1. **STOP IMMEDIATELY.**
  2. **ASK THE USER** whether to mark the active ticket **`PAUSED`** or **`ABANDONED`**.
  3. Author the handover note in `docs/kanban/handovers/<ticket-id>.md`.
  4. Only then transition the new task to `IN_PROGRESS`.

### 2.3. Fibonacci Story Point Estimation
- All tickets must be estimated ($1, 2, 3, 5, 8, 13, 21$) before transitioning from `BACKLOG` to `TODO` or `IN_PROGRESS`.
- Tasks/stories are groomed in groups by Epic.

### 2.4. Knowledge Transfer & Handover Protocol
- When a subagent finishes work, is interrupted, or transfers context:
  - Update `docs/kanban/board.json` and `docs/kanban/BOARD.md`.
  - Author or update `docs/kanban/handovers/<ticket-id>.md` covering completed files, current state/tests, gotchas/decisions, and exact next steps.

### 2.5. Git & PR Control
- Feature branches target `develop/2.0.0`.
- Commits and PRs are batched by Story or Epic.
- **Anti-Runaway Barrier**: When an Epic or Story finishes, stop and ask the user if they want to create a PR before continuing to the next Epic.

---

## 3. Agent Roster & Domain Mapping

| Agent Name | Core Domain | Primary Responsibilities | Dedicated Subsystem Doc |
|---|---|---|---|
| `legacy-auditor` | Legacy Analysis | Inspect `.local/RirikoBot` (read-only), document entities, commands, and edge cases. | [docs/legacy-feature-inventory.md](file:///Z:/Projects/ririko-v2-2026/docs/legacy-feature-inventory.md) |
| `architecture` | Systems Architecture | Monorepo package boundaries, dependency graphs, ADRs, clean service interfaces. | [docs/architecture.md](file:///Z:/Projects/ririko-v2-2026/docs/architecture.md) |
| `discord` | Discord Bot Core | Discord.js 14, Slash & Prefix parity, interaction routing, autocomplete, components. | [docs/commands.md](file:///Z:/Projects/ririko-v2-2026/docs/commands.md) |
| `database` | Data & Storage | Drizzle ORM schemas, PostgreSQL & SQLite dual-dialect, 40+ tables, transactions. | [docs/database.md](file:///Z:/Projects/ririko-v2-2026/docs/database.md) |
| `music` | Voice & Audio | Audio player core, extractors (YouTube, Spotify, SoundCloud, Deezer), reactive embeds. | [docs/music.md](file:///Z:/Projects/ririko-v2-2026/docs/music.md) |
| `ai` | Generative AI & LLM | Multi-provider adapters (Gemini, OpenAI, Ollama), isolated context, safe tool calling. | [docs/ai.md](file:///Z:/Projects/ririko-v2-2026/docs/ai.md) |
| `moderation` | Safety & Rules | Warning escalations, audit logging, auto-mod filters, contextual staff notes. | [docs/moderation.md](file:///Z:/Projects/ririko-v2-2026/docs/moderation.md) |
| `image-generation` | Graphics & Synthesis | AI image adapters (Gemini, ComfyUI, Replicate), `@napi-rs/canvas` rank cards, memes. | [docs/adapters.md](file:///Z:/Projects/ririko-v2-2026/docs/adapters.md) |
| `stream-platforms` | Stream Ingestion | Twitch, YouTube, TikTok Live watchers, idempotency keys, thumbnail reupload CDN. | [docs/adapters.md](file:///Z:/Projects/ririko-v2-2026/docs/adapters.md) |
| `economy` | Finance & Levels | Atomic balance transfers, double-entry ledger, anti-spam XP, inventory bags. | [docs/economy.md](file:///Z:/Projects/ririko-v2-2026/docs/economy.md) |
| `waifu-tcg` | Trading Card Game | Ingestion pipeline, 8-tier rarity RNG, 7 elemental affinities (including Ice), P2P trading, WaifuGuilds. | [docs/waifu-tcg.md](file:///Z:/Projects/ririko-v2-2026/docs/waifu-tcg.md) |
| `games` | Interactive Games | `MiniGame` interface, Tic-Tac-Toe (Minimax AI), RPS, HighLow, CoinFlip, Dice, wagering. | [docs/modules.md](file:///Z:/Projects/ririko-v2-2026/docs/modules.md) |
| `dashboard` | Web Application | Next.js 16 (App Router), React 19, Discord OAuth2, 20+ module management tabs. | [docs/dashboard.md](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md) |
| `security` | AppSec & Compliance | AES-256 vault for secrets, permission checks, input validation (Zod), rate limits. | [docs/architecture.md](file:///Z:/Projects/ririko-v2-2026/docs/architecture.md) |
| `testing` | QA & Verification | Vitest test suites, deterministic RNG seeds, Discord API mock harnesses, quality gates. | [docs/testing.md](file:///Z:/Projects/ririko-v2-2026/docs/testing.md) |
| `devops` | Infra & Operations | Multi-stage Docker, Compose, GitHub Actions CI/CD, `/health` and `/ready` probes. | [docs/deployment.md](file:///Z:/Projects/ririko-v2-2026/docs/deployment.md) |
| `code-reviewer` | Code Quality | TypeScript strictness, error boundary enforcement, dead code removal, performance. | [docs/contributing.md](file:///Z:/Projects/ririko-v2-2026/docs/contributing.md) |
| `migration` | Data Migration | TypeORM SQLite -> Drizzle PostgreSQL/SQLite migration CLI (`--dry-run`), verification. | [docs/migrations.md](file:///Z:/Projects/ririko-v2-2026/docs/migrations.md) |

---

## 4. Collaboration & Coordination Protocol

1. **Read-First Handshake**:
   - Before implementing any domain service, the executing agent must review:
     - `BLUEPRINT.md` (the master platform specification)
     - `docs/kanban/protocol.md` (Scrum Kanban & Handover protocol)
     - `docs/kanban/BOARD.md` (Confirm only 1 ticket in progress)
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
     pnpm test
     pnpm build
     ```
   - All tests involving randomness (TCG drops, gambling, giveaways) MUST use deterministic random seeds.
   - The `code-reviewer` agent has the authority to reject PRs for unhandled promises, missing error boundaries, or non-compliant typing.
4. **Zero Legacy Mutation**:
   - The `.local/RirikoBot` repository is strictly immutable. If an agent attempts to edit files inside `.local/`, the action will be rejected.

---

## 5. Conflict Resolution Rules
- If there is a dispute between **legacy behavior** and **modernization requirements**:
  1. User-facing command interfaces, arguments, and outcomes must remain compatible.
  2. Internal implementation must be modernized to modern 2026 standards (e.g. Drizzle over TypeORM, modular TS over monolithic NestJS).
  3. If a legacy feature was fundamentally broken (e.g. plaintext secrets, memory-only state, 10s polling loops), it must be fixed with a backward-compatible upgrade path.
