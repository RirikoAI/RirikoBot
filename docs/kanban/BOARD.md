# Ririko AI 2.0.0 — Live Scrum Kanban Board

> **Board Invariant**: Only **EXACTLY ONE** ticket may be in `⚡ In Progress` at any time across all agents and subagents.
> If a new ticket must be started while one is active, the agent must **STOP AND ASK THE USER** whether to `PAUSE` or `ABANDON` the current ticket.

---

## ⚡ In Progress (WIP Limit: 1)
*No tickets currently in progress (WIP = 0).*

---

## ⏸️ Paused (On Hold)
*No paused tickets currently on the board.*

---

## 🎯 To Do (Groomed & Estimated)
*No tickets currently in To Do.*

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

---

## ❌ Abandoned
*No abandoned tickets.*

---

## 📋 Product Backlog (Future Epics)
| ID | Title | Est. Pts | Prerequisites | Target Phase |
|---|---|---|---|---|
| `EPIC-003` | Discord.js 14 Gateway & O(1) Command Router | 21 | `EPIC-001` | Phase 3 |
| `EPIC-004` | Centralized Transactional Economy & Banking Engine | 13 | `EPIC-002`, `EPIC-003` | Phase 4 |
| `EPIC-005` | Multi-Source Music 2.0 Audio Engine | 13 | `EPIC-002`, `EPIC-003` | Phase 4 |
| `EPIC-006` | AI Chatbot 2.0 with Context Isolation & Safe Tools | 13 | `EPIC-002`, `EPIC-003` | Phase 4 |
| `EPIC-007` | Moderation 2.0 with Escalation & AutoMod | 13 | `EPIC-002`, `EPIC-003` | Phase 4 |
| `EPIC-008` | Streamer Notifications & Free Games Announcer | 8 | `EPIC-002`, `EPIC-003` | Phase 4 |
| `EPIC-009` | Giveaways 2.0, Auto Voice 2.0 & Mini-Games Suite | 13 | `EPIC-002`, `EPIC-003` | Phase 4 |
| `EPIC-010` | Waifu TCG Gameplay, Ingestion, Trading & Marketplace | 21 | `EPIC-002`, `EPIC-004` | Phase 5 |
| `EPIC-011` | Next.js 16 Web Dashboard & Management Portal | 21 | `EPIC-002`, `EPIC-004`.. | Phase 6 |
| `EPIC-012` | Quality Gates, Docker Rootless & Production Verification | 13 | `EPIC-001`..`EPIC-011` | Phase 7 |
