# AGENTS.md — Multi-Agent Orchestration & Governance

## Standing work-control rules — read before every task

The full original request is preserved in [BLUEPRINT.md](BLUEPRINT.md). Read its relevant sections and [the requirement ledger](docs/requirements.md) before grooming/implementation. Link ticket acceptance to those requirements; update implementation/test evidence and remaining gaps when work changes. Run `pnpm board requirements-check`. A design document or passing foundation test does not certify an unimplemented feature. Later explicit user work-control decisions override older broad autonomy in the blueprint.

Read [.workboard/PROTOCOL.md](.workboard/PROTOCOL.md), [.workboard/state.json](.workboard/state.json), the generated board and the active ticket's handoff at the start of **every session and every sub-agent assignment**. This user-requested protocol takes precedence over older instructions to continue autonomously across tasks/phases.

- Only one ticket may be in progress across all agents. Blocked/review work retains the slot; parents are containers. Sub-agents may assist only that ticket within recorded assignments.
- Estimate in Fibonacci points and groom the group before starting. Record parent/child and requires/blocks links, status, acceptance and evidence. Do not fabricate historical estimates.
- If another task is requested while work is active, **stop and ask the user** whether to pause it (revisit) or abandon it (permanent). Never auto-switch or silently reopen abandoned work.
- Preserve durable handoffs and accept worker returns before transitions. Chat history alone is insufficient.
- One epic/story per delivery batch; chores/bugs may stand alone. At its boundary, prepare the reviewable result and **ask the user whether to create a PR before starting the next scope**, even during a long session.
- Verify actual topic/base branches, remote identity, ancestry, owned paths and staged changes. Never guess the target, push directly to protected branches, force/reset/clean, auto-stash or mix scopes. Install/check local hooks with `pnpm board install-hooks` and run `pnpm board check`.
- Sub-agents cannot authorize switches, approvals, Git publication or independent tickets. The coordinator records the user's actual decisions; never invent consent.

## 1. Purpose & Scope
This document governs how AI agents collaborate, divide responsibilities, and maintain quality across the development and modernization of **Ririko AI 2.0.0**.

The verified source snapshot is currently `.audit/RirikoBot` (commit `0d8be25b17e25dfa61812d6e7b5aaf8497687257`), because `.local/RirikoBot` was absent. Both legacy locations are read-only. Implementation status is recorded in `docs/implementation-roadmap.md`; draft decisions and agent definitions are not evidence of feature completion. Use `docs/development.md` for current commands and `docs/dependency-evaluation.md` for exact versions.

---

## 2. Agent Roster & Domain Mapping

| Agent Name | Core Domain | Primary Responsibilities |
|---|---|---|
| `legacy-auditor` | Legacy Analysis | Inspect `.local/RirikoBot` (read-only), document entities, commands, and edge cases. |
| `architecture` | Systems Architecture | Monorepo package boundaries, dependency graphs, ADRs, clean service interfaces. |
| `discord` | Discord Bot Core | Discord.js 14, Slash & Prefix parity, interaction routing, autocomplete, components. |
| `database` | Data & Storage | Drizzle ORM schemas, PostgreSQL & SQLite dual-dialect, relations, migrations. |
| `music` | Voice & Audio | Audio player core, extractors (YouTube, Spotify, SoundCloud), queue managers. |
| `ai` | Generative AI & LLM | Multi-provider adapters (Gemini, OpenAI, Ollama), conversational memory, tool calling. |
| `moderation` | Safety & Rules | Warning escalations, audit logging, auto-mod filters, contextual staff notes. |
| `image-generation` | Graphics & Synthesis | AI image adapters (Gemini, ComfyUI, Replicate), `@napi-rs/canvas` rank cards, memes. |
| `stream-platforms` | Stream Ingestion | Twitch, YouTube, TikTok Live watchers, notification deduplication, thumbnail caching. |
| `economy` | Finance & Levels | Atomic balance transfers, double-entry ledger, anti-spam XP, inventory bags. |
| `waifu-tcg` | Trading Card Game | Ingestion pipeline, 8-tier rarity RNG, elemental affinities, P2P trading, guilds. |
| `games` | Interactive Games | `MiniGame` interface, Tic-Tac-Toe, RPS, HighLow, CoinFlip, Dice, wagering. |
| `dashboard` | Web Application | Next.js 16 (App Router), React 19, Discord OAuth2, guild admin controls. |
| `security` | AppSec & Compliance | AES-256 vault for secrets, permission checks, input validation (Zod), rate limits. |
| `testing` | QA & Verification | Vitest test suites, Discord API mock harnesses, test coverage gates. |
| `devops` | Infra & Operations | Multi-stage Docker, Compose, GitHub Actions CI/CD, health probes. |
| `code-reviewer` | Code Quality | TypeScript strictness, error boundary enforcement, dead code removal, performance. |
| `migration` | Data Migration | TypeORM SQLite -> Drizzle PostgreSQL/SQLite migration CLI and verification. |

---

## 3. Collaboration & Coordination Protocol

1. **Read-First Handshake**:
   - Before implementing any domain service, the executing agent must review:
     - `docs/legacy-feature-inventory.md`
     - `docs/architecture.md`
     - The corresponding agent file in `.gemini/agents/<agent-name>.md`
2. **Contract-Driven Development**:
   - Define TypeScript interfaces in `packages/core` or domain packages before writing implementation code.
   - Database schema changes must be approved against `packages/database` before being consumed by `apps/bot` or `apps/web`.
3. **Quality Gates & Review Hand-off**:
   - Any new command or service must include:
     1. Strict typing with no `any` casts.
     2. Unit test file (`*.spec.ts` or `*.test.ts`) executed via Vitest.
     3. Command documentation in both Slash and Prefix formats.
   - The `code-reviewer` agent has the authority to request revisions for unhandled promises, missing error boundaries, or non-compliant typing.
4. **Zero Legacy Mutation**:
   - The `.local/RirikoBot` repository is strictly immutable. If an agent attempts to edit files inside `.local/`, the action will be rejected.

---

## 4. Conflict Resolution Rules
- If there is a dispute between **legacy behavior** and **modernization requirements**:
  1. User-facing command interfaces, arguments, and outcomes must remain compatible.
  2. Internal implementation must be modernized to modern 2026 standards (e.g. Drizzle over TypeORM, modular TS over monolithic NestJS).
  3. If a legacy feature was fundamentally broken (e.g. plaintext secrets, memory-only state), it must be fixed with a backward-compatible upgrade path.
