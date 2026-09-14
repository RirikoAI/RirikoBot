# Ririko AI 2.0.0 — Live Scrum Kanban Board

> **Board Invariant**: Only **EXACTLY ONE** ticket may be in `⚡ In Progress` at any time across all agents and subagents.
> If a new ticket must be started while one is active, the agent must **STOP AND ASK THE USER** whether to `PAUSE` or `ABANDON` the current ticket.

---

## ⚡ In Progress (WIP Limit: 1)
*No tickets currently in progress.*

---

## ⏸️ Paused (On Hold)
*No paused tickets currently on the board.*

---

## 🎯 To Do (Groomed & Estimated)
| ID | Type | Title | Pts | Epic / Parent | Requires |
|---|---|---|---|---|---|
| `EPIC-001` | Epic | Monorepo Workspace, Toolchain & Core Contracts | 13 | Self | `EPIC-000` |
| `STORY-010` | Story | Workspace Configuration & Root Monorepo Tooling | 5 | `EPIC-001` | `EPIC-000` |
| `STORY-011` | Story | `packages/core` Contracts, Errors, EventBus & Config | 5 | `EPIC-001` | `STORY-010` |
| `STORY-012` | Story | `apps/cli` Scaffolding & `ririko doctor` Diagnostics | 5 | `EPIC-001` | `STORY-011` |

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

---

## ❌ Abandoned
*No abandoned tickets.*

---

## 📋 Product Backlog (Future Epics)
| ID | Title | Est. Pts | Prerequisites | Target Phase |
|---|---|---|---|---|
| `EPIC-002` | Dual-Dialect Drizzle ORM & Data Access Layer | 21 | `EPIC-001` | Phase 2 |
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
