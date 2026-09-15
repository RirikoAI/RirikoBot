# Ririko AI 2.0.0 — Live Scrum Kanban Board

> **Board Invariant**: Only **EXACTLY ONE** ticket may be in `⚡ In Progress` at any time across all agents and subagents.
> If a new ticket must be started while one is active, the agent must **STOP AND ASK THE USER** whether to `PAUSE` or `ABANDON` the current ticket.

---

## ⚡ In Progress (WIP Limit: 1)
| ID | Type | Title | Pts | Parent | Target Package |
|---|---|---|---|---|---|
| `TASK-0412` | Task | Banking Service (Deposit, Withdraw, Capacity Scaling, Interest Yield & Deadlock-Free Transfers) | 3 | `STORY-041` | `packages/services` |

---

## ⏸️ Paused (On Hold)
*No paused tickets currently on the board.*

---

## 🎯 To Do (Groomed & Estimated)
| ID | Type | Title | Pts | Parent | Status |
|---|---|---|---|---|---|
| `EPIC-004` | Epic | Centralized Transactional Economy & Banking Engine | 21 | Self | Active |
| `STORY-041` | Story | Transactional Banking, Daily Streak Engine & Double-Entry Ledger | 5 | `EPIC-004` | Active |
| `STORY-042` | Story | Leveling 2.0, Karma & High-Performance Materialized Leaderboards | 5 | `EPIC-004` | Queued |
| `STORY-043` | Story | Shop Catalog, Inventory Bags & SSRF-Protected Profile Customization | 5 | `EPIC-004` | Queued |
| `STORY-044` | Story | Profile Card 2.0 Graphics Canvas & Discord Economy Commands Suite | 5 | `EPIC-004` | Queued |

---

## 🔍 Review / Quality Gate
*No tickets currently in review.*

---

## ✅ Done
| ID | Type | Title | Pts | Parent | Handover Note |
|---|---|---|---|---|---|
| `EPIC-000` | Epic | Planning, Audits, Architectural Specifications & Agent Design | 13 | Self | [docs/](file:///Z:/Projects/ririko-v2-2026/docs/) |
| `STORY-001` | Story | Legacy 1.4.0 Codebase Audit & Feature Inventory | 5 | `EPIC-000` | [legacy-feature-inventory.md](file:///Z:/Projects/ririko-v2-2026/docs/legacy-feature-inventory.md) |
| `STORY-002` | Story | Architecture Specification & ADR-001 to ADR-012 | 5 | `EPIC-000` | [architecture.md](file:///Z:/Projects/ririko-v2-2026/docs/architecture.md) |
| `STORY-003` | Story | Specialist Agent Roster & Execution Protocols | 3 | `EPIC-000` | [AGENTS.md](file:///Z:/Projects/ririko-v2-2026/AGENTS.md) |
| `STORY-004` | Story | Complete Subsystem Documentation Catalog (16 Docs) | 5 | `EPIC-000` | [docs/](file:///Z:/Projects/ririko-v2-2026/docs/) |
| `STORY-005` | Story | Scrum Kanban & Sub-Agent Knowledge Transfer System | 3 | `EPIC-000` | [TASK-0051.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0051.md) |
| `TASK-0051` | Task | Initialize Kanban Board, Protocol & WIP Limit Invariant | 3 | `STORY-005` | [TASK-0051.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0051.md) |
| `EPIC-001` | Epic | Monorepo Workspace, Toolchain & Core Contracts | 13 | Self | [TASK-0122.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0122.md) |
| `STORY-010` | Story | Workspace Configuration & Root Monorepo Tooling | 5 | `EPIC-001` | [TASK-0103.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0103.md) |
| `TASK-0101` | Task | pnpm Workspace Topology, Root Package.json, pnpm-workspace.yaml & Strict TSConfigs | 2 | `STORY-010` | [TASK-0101.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0101.md) |
| `TASK-0102` | Task | Shared TypeScript Base Configs & Package Reference Harness | 1 | `STORY-010` | [TASK-0102.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0102.md) |
| `TASK-0103` | Task | Root Linting, Formatting & Vitest Configuration | 2 | `STORY-010` | [TASK-0103.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0103.md) |
| `STORY-011` | Story | `packages/core` Contracts, Errors, EventBus & Config | 5 | `EPIC-001` | [TASK-0113.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0113.md) |
| `TASK-0111` | Task | Zod Schema Environment Validation & Config Loader | 2 | `STORY-011` | [TASK-0111.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0111.md) |
| `TASK-0112` | Task | Standardized Error Hierarchy & Error Codes | 1 | `STORY-011` | [TASK-0112.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0112.md) |
| `TASK-0113` | Task | Strongly-Typed Asynchronous EventBus & Lifecycle Hooks | 2 | `STORY-011` | [TASK-0113.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0113.md) |
| `STORY-012` | Story | `apps/cli` Scaffolding & `ririko doctor` Diagnostics | 5 | `EPIC-001` | [TASK-0122.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0122.md) |
| `TASK-0121` | Task | CLI Subcommand Architecture, Global Options & Runner Harness | 2 | `STORY-012` | [TASK-0121.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0121.md) |
| `TASK-0122` | Task | ririko doctor Comprehensive Diagnostics Engine | 3 | `STORY-012` | [TASK-0122.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0122.md) |
| `STORY-020` | Story | Dual-Dialect Connection Factory & Client Harness | 5 | `EPIC-002` | [TASK-0202.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0202.md) |
| `TASK-0201` | Task | Dependencies, Dual-Dialect Connection Factory & Client Interfaces | 2 | `STORY-020` | [TASK-0201.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0201.md) |
| `TASK-0202` | Task | SQLite WAL/Foreign Key Pragmas, PG Pooling, Health Check & Integration Tests | 3 | `STORY-020` | [TASK-0202.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0202.md) |
| `STORY-021` | Story | 70+ Normalized Table Schemas & Unified TypeScript Models | 8 | `EPIC-002` | [TASK-0212.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0212.md) |
| `TASK-0211` | Task | Core & Service Schemas: Identity, Guilds, Moderation, Economy, XP, Music, AI | 5 | `STORY-021` | [TASK-0211.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0211.md) |
| `TASK-0212` | Task | Specialized Schemas: Waifu TCG (20 tables), Streams, Giveaways, Games, Utilities & Inferred Models | 3 | `STORY-021` | [TASK-0212.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0212.md) |
| `TASK-0221` | Task | Base Repository Pattern & Dialect-Agnostic Query Abstraction | 3 | `STORY-022` | [TASK-0221.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0221.md) |
| `STORY-022` | Story | Dialect-Agnostic Repositories & ACID Transaction Abstractions | 5 | `EPIC-002` | [TASK-0222.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0222.md) |
| `TASK-0222` | Task | Core Domain Repositories (Users, GuildSettings, Economy Ledger) & Tests | 2 | `STORY-022` | [TASK-0222.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0222.md) |
| `TASK-0231` | Task | Legacy SQLite Inspector & 17-Entity Data Transformer | 2 | `STORY-023` | [TASK-0231.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0231.md) |
| `TASK-0232` | Task | ririko migrate:legacy CLI Command with Dry-Run & Verification Harness | 1 | `STORY-023` | [TASK-0232.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0232.md) |
| `STORY-023` | Story | Legacy 1.4.0 SQLite Migration Engine & CLI | 3 | `EPIC-002` | [STORY-023.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-023.md) |
| `EPIC-002` | Epic | Dual-Dialect Drizzle ORM & Data Access Layer | 21 | Self | [STORY-023.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-023.md) |
| `TASK-0301` | Task | Discord.js 14 Client Factory with Gateway Intents, Partials & Cache Sweepers | 3 | `STORY-030` | [TASK-0301.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0301.md) |
| `TASK-0302` | Task | Gateway Lifecycle State Machine, Reconnection & Shard Health Monitoring | 2 | `STORY-030` | [TASK-0302.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0302.md) |
| `STORY-030` | Story | Discord Client Gateway Lifecycle, Sharding & REST V10 Harness | 5 | `EPIC-003` | [STORY-030.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-030.md) |
| `TASK-0311` | Task | Command Interfaces, Option Parsers & Unified CommandContext Abstraction | 3 | `STORY-031` | [TASK-0311.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0311.md) |
| `TASK-0312` | Task | O(1) Hash Map Command Registry, Prefix Tokenizer & Dual Dispatcher | 5 | `STORY-031` | [TASK-0312.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0312.md) |
| `STORY-031` | Story | O(1) Dual-Dispatch Command Router (Slash & Prefix Parity) | 8 | `EPIC-003` | [STORY-031.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-031.md) |
| `TASK-0321` | Task | Middleware Runner, Execution Chain Engine & Error Boundary Interceptor | 2 | `STORY-032` | [TASK-0321.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0321.md) |
| `TASK-0322` | Task | Built-in Middlewares: PermissionBitfield, MaintenanceMode, ModuleToggle, Per-User Cooldown & TokenBucket RateLimit | 3 | `STORY-032` | [TASK-0322.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0322.md) |
| `STORY-032` | Story | Composable Middleware Pipeline (Permissions, Rate Limits, Cooldowns & Maintenance) | 5 | `EPIC-003` | [STORY-032.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-032.md) |
| `TASK-0331` | Task | Component-driven Interactive Help Menu with Category Selectors, Pagination & Detailed Command Inspector | 2 | `STORY-033` | [TASK-0331.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0331.md) |
| `TASK-0332` | Task | Discord REST v10 Global / Guild Command Synchronization & Auto-Registration Engine | 1 | `STORY-033` | [TASK-0332.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0332.md) |
| `STORY-033` | Story | Interactive Dynamic Help Center & Command Auto-Registration | 3 | `EPIC-003` | [STORY-033.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-033.md) |
| `EPIC-003` | Epic | Discord.js 14 Gateway & O(1) Command Router | 21 | Self | [EPIC-003.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/EPIC-003.md) |
| `CHORE-0301` | Chore | Discord Bot Dev Entrypoint, Ping Command & Environment Compatibility | 2 | `EPIC-003` | [CHORE-0301.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/CHORE-0301.md) |
| `TASK-0401` | Task | EconomyEvent Pipeline, Anti-Spam Evaluator & Core Service | 3 | `STORY-040` | [TASK-0401.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0401.md) |
| `TASK-0402` | Task | Voice XP / Economy Accumulator, Quorum Verification & Anti-AFK State Machine | 2 | `STORY-040` | [TASK-0402.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0402.md) |
| `STORY-040` | Story | Event-Driven Economy Core & Anti-Spam / Anti-AFK Engine | 5 | `EPIC-004` | [TASK-0402.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0402.md) |
| `TASK-0411` | Task | Daily Streak Engine (+5%/day up to 30d, 36h reset grace) & Account State | 2 | `STORY-041` | [TASK-0411.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0411.md) |

---

## ❌ Abandoned
*No abandoned tickets.*

---

## 📋 Product Backlog (Future Epics & Stories)
| ID | Title | Est. Pts | Prerequisites | Target Phase |
|---|---|---|---|---|
| `STORY-042` | Leveling 2.0, Karma & High-Performance Materialized Leaderboards | 5 | `STORY-041` | Phase 4 |
| `STORY-043` | Shop Catalog, Inventory Bags & SSRF-Protected Profile Customization | 5 | `STORY-041` | Phase 4 |
| `STORY-044` | Profile Card 2.0 Graphics Canvas & Discord Economy Commands Suite | 5 | `STORY-042`, `STORY-043` | Phase 4 |
| `EPIC-005` | Multi-Source Music 2.0 Audio Engine | 13 | `EPIC-002`, `EPIC-003` | Phase 4 |
| `EPIC-006` | AI Chatbot 2.0 with Context Isolation & Safe Tools | 13 | `EPIC-002`, `EPIC-003` | Phase 4 |
| `EPIC-007` | Moderation 2.0 with Escalation & AutoMod | 13 | `EPIC-002`, `EPIC-003` | Phase 4 |
| `EPIC-008` | Streamer Notifications & Free Games Announcer | 8 | `EPIC-002`, `EPIC-003` | Phase 4 |
| `EPIC-009` | Giveaways 2.0, Auto Voice 2.0 & Mini-Games Suite | 13 | `EPIC-002`, `EPIC-003` | Phase 4 |
| `EPIC-010` | Waifu TCG Gameplay, Ingestion, Trading & Marketplace | 21 | `EPIC-002`, `EPIC-004` | Phase 5 |
| `EPIC-011` | Next.js 16 Web Dashboard & Management Portal | 21 | `EPIC-002`, `EPIC-004`.. | Phase 6 |
| `EPIC-012` | Quality Gates, Docker Rootless & Production Verification | 13 | `EPIC-001`..`EPIC-011` | Phase 7 |

### 🛠️ Groomed Tasks for EPIC-004
| ID | Type | Title | Pts | Parent | Status | Prerequisites |
|---|---|---|---|---|---|---|
| `TASK-0412` | Task | Banking Service (Deposit, Withdraw, Capacity Scaling, Interest Yield & Deadlock-Free Transfers) | 3 | `STORY-041` | ⚡ In Progress | `TASK-0411` |
| `TASK-0421` | Task | Leveling Progression Formula (5L^2 + 50L + 100), Level-Up Events & Karma Controls | 2 | `STORY-042` | 📋 Backlog | `TASK-0411` |
| `TASK-0422` | Task | Materialized Leaderboard Snapshot Engine, Cron Calculation & O(1) Dense Rank Queries | 3 | `STORY-042` | 📋 Backlog | `TASK-0421` |
| `TASK-0431` | Task | Item Catalog Repository, Inventory Bags & Usable Consumables (Anti-Abuse Daily Potion Ceilings) | 3 | `STORY-043` | 📋 Backlog | `TASK-0412` |
| `TASK-0432` | Task | Custom Profile Background Manager with DNS/SSRF IP Verification, Dimension Bounds & Cache | 2 | `STORY-043` | 📋 Backlog | `TASK-0431` |
| `TASK-0441` | Task | Profile Card 2.0 Renderer with @napi-rs/canvas (Avatar, Ranks, XP Bar, Balances, Card Slot) | 3 | `STORY-044` | 📋 Backlog | `TASK-0422`, `TASK-0432` |
| `TASK-0442` | Task | Dual-Dispatch Discord Commands & Gateway Event Listeners | 2 | `STORY-044` | 📋 Backlog | `TASK-0441` |
