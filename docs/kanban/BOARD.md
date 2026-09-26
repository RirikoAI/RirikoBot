# Ririko AI 2.0.0 — Live Scrum Kanban Board

> **Board Invariant**: Only **EXACTLY ONE** ticket may be in `⚡ In Progress` at any time across all agents and subagents.
> If a new ticket must be started while one is active, the agent must **STOP AND ASK THE USER** whether to `PAUSE` or `ABANDON` the current ticket.

---

## ⚡ In Progress (WIP Limit: 1)
| ID | Type | Title | Pts | Epic / Parent |
|---|---|---|---|---|
| | | | | |

---

## 🔍 In Review
| ID | Type | Title | Pts | Epic / Parent | Handover Note |
|---|---|---|---|---|---|
| | | | | | |

---

## ⏸️ Paused (On Hold)
*No paused tickets currently on the board.*

---

## 🎯 To Do (Groomed & Estimated)
Ready tickets are listed once, in their epic section at the bottom of the board.

- `EPIC-011` Next.js 16 Web Dashboard & Management Portal (21 pts, children 75): see **Groomed Stories & Tasks for EPIC-011**
- `EPIC-012` Quality Gates, Docker Rootless & Production Verification (13 pts): see **Groomed Stories & Tasks for EPIC-012**

---

## 🔍 Review / Quality Gate
*No tickets currently in review.*

---

## ✅ Done
| ID | Type | Title | Pts | Parent | Handover Note |
|---|---|---|---|---|---|
| `BUG-0022` | Bug | Reminder Times Were Read in the Host's Time Zone Instead of the User's IANA Zone | 2 | `STORY-123` | [BUG-0022.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0022.md) |
| `BUG-0021` | Bug | Auto Voice Deleted Every Empty Voice Channel in a Join-to-Create Hub's Category, Including Permanent Server Channels | 3 | `STORY-091` | [BUG-0021.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0021.md) |
| `BUG-0020` | Bug | Passkey Sign-In Check Rejected Authenticators Without the User-Verification Flag; Failures Were Unlogged and Escaped as Unhandled Errors | 2 | `STORY-117` | [BUG-0020.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0020.md) |
| `BUG-0019` | Bug | Fix Replicate Provider Timeout from Prefer: wait Header and Discord WebP Attachment Extension | 2 | `STORY-132` | [BUG-0019.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0019.md) |
| `CHORE-1321` | Chore | CLI Command to Configure Image Generation Providers & Keys (image-configure) | 2 | — | [CHORE-1321.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/CHORE-1321.md) |
| `STORY-161` | Story | Unified Configurable Reset Boundary & Consecutive-Miss Streak Forgiveness | 5 | `EPIC-004` | [STORY-161.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-161.md) |
| `BUG-0012` | Bug | Daily Energy Replenishment Never Fires: EnergyLifecycleService Is Unwired | 3 | `EPIC-015` | [BUG-0012.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0012.md) |
| `BUG-0018` | Bug | Persist and Restore Guild Default Volume Across Music Sessions | 3 | `EPIC-005` | [BUG-0018.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0018.md) |
| `EPIC-013` | Epic | Media Synthesis, Anime Reactions & AI Image Generation | 21 | Self | [TASK-1332.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1332.md) |
| `EPIC-014` | Epic | Server Utilities, AutoRoles & Community Systems | 21 | Self | [STORY-143.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-143.md) |
| `TASK-1411` | Task | Reminder Repository (Dual-Dialect, Atomic Claim) & Legacy DM Guild Migration Fix | 1 | `STORY-141` | [STORY-141.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-141.md) |
| `TASK-1412` | Task | ReminderService & Scheduler: chrono-node Parsing in User Timezone, Limits, DST-Safe Repeats, DM-then-Channel Delivery | 2 | `STORY-141` | [STORY-141.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-141.md) |
| `TASK-1413` | Task | /reminder Command (Set, List, Cancel, Timezone) with Prefix Parity & Real AI reminders.create Tool | 1 | `STORY-141` | [STORY-141.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-141.md) |
| `TASK-1441` | Task | Move WaifuImClient to Shared anime Module on fetchWithRetry & /waifu Command | 1 | `STORY-144` | [STORY-144.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-144.md) |
| `TASK-1442` | Task | WallHaven REST Client (SFW Anime Wallpapers) & /wallpaper Command Replacing Legacy Scrapers | 2 | `STORY-144` | [STORY-144.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-144.md) |
| `TASK-1421` | Task | Jikan v4 Client (Anime, Manga, Characters: Search & Full Details, SFW, Rate-Limited) | 2 | `STORY-142` | [STORY-142.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-142.md) |
| `TASK-1422` | Task | AnimeSearchService: Source-Neutral Models, Jikan-to-AniList Fallback, TTL Cache & AniList Detail Queries | 2 | `STORY-142` | [STORY-142.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-142.md) |
| `TASK-1423` | Task | /anime, /manga, /anime-character Commands: Search Select Menu, Detail Embeds & Prefix Parity | 1 | `STORY-142` | [STORY-142.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-142.md) |
| `CHORE-1401` | Chore | Shared AniList Client & HTTP Rate-Limit Layer (Decouple from Waifu TCG) | 2 | `EPIC-014` | [CHORE-1401.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/CHORE-1401.md) |
| `BUG-0009` | Bug | Fix Tutorial Floor T4 Defeat Counter Card Grant & Stale Metadata Recovery | 2 | `STORY-104` | [BUG-0009.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0009.md) |
| `TASK-1046` | Task | Interactive Combat Items Dropdown, Battle Collector Fixes, Tutorial Floor Lock & Potion Grants, and Interactive Town Shop & Inventory Menus | 5 | `STORY-104` | [TASK-1046.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1046.md) |
| `TASK-1045` | Task | Tutorial Floor T4 Dynamic Elemental Disadvantage, Real Common Card Grant on Defeat & Direct Climb Gate Prompt | 3 | `STORY-104` | [TASK-1045.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1045.md) |
| `TASK-1044` | Task | Interactive Card Album, Pagination, Inspection & Equip Menu Suite (/cards) | 3 | `STORY-101` | [TASK-1044.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1044.md) |
| `TASK-1043` | Task | Interactive Real-Time Dungeon Tower Battles with Card Rendering, Manual & Auto Combat | 5 | `STORY-104` | [TASK-1043.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1043.md) |
| `EPIC-010` | Epic | Waifu TCG Gameplay, Ingestion, Trading & Marketplace | 21 | Self | [EPIC-010.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/EPIC-010.md) |
| `TASK-0803` | Task | Multi-Platform Stream Watcher Engine Reinforcement, Resilient Adapters, CLI Stream Configuration & General Stream Commands | 3 | `STORY-080` | [TASK-0803.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0803.md) |
| `EPIC-009` | Epic | Giveaways 2.0, Auto Voice 2.0 & Mini-Games Suite | 13 | Self | [TASK-0922.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0922.md) |
| `TASK-0812` | Task | Dual-Dispatch Stream & Free Game Commands Suite & Quality Gate | 1 | `STORY-081` | [TASK-0812.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0812.md) |
| `EPIC-008` | Epic | Streamer Notifications & Free Games Announcer | 8 | Self | [TASK-0812.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0812.md) |
| `TASK-0811` | Task | Free Games Repository, Multi-Provider Fetchers (Epic Games & Steam) & Announcer Engine | 2 | `STORY-081` | [TASK-0811.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0811.md) |
| `TASK-0802` | Task | Stream Notification Dispatcher, Idempotency Deduplication, Thumbnail Cache & CDN Attachment Uploader | 2 | `STORY-080` | [TASK-0802.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0802.md) |
| `TASK-0801` | Task | Stream Repository, Multi-Platform Stream Adapters & Watcher Engine Core | 3 | `STORY-080` | [TASK-0801.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0801.md) |
| `BUG-0007` | Bug | Wire Real Music Player Execution to MusicPlayTool in AI Chatbot | 2 | `STORY-060` | [BUG-0007.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0007.md) |
| `BUG-0006` | Bug | Ignore Prefix Commands in AI Chat & Wire Real Database Values in EconomyBalanceTool | 2 | `STORY-060` | [BUG-0006.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0006.md) |
| `BUG-0005` | Bug | Duplicate Tool Execution and Unrendered Raw JSON Tool Responses in AI Chat | 2 | `STORY-060` | [BUG-0005.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0005.md) |
| `BUG-0004` | Bug | Unfulfilled Assistant Tool Calls in Historical Context Causing OpenAI 400 Error | 2 | `STORY-060` | [BUG-0004.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0004.md) |
| `BUG-0003` | Bug | OpenAI & LLM Providers Function Name Schema Validation & Sanitization | 2 | `STORY-060` | [BUG-0003.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0003.md) |
| `CHORE-0601` | Chore | CLI Command to Configure AI Chat Functions & Provider Keys | 2 | `EPIC-006` | [CHORE-0601.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/CHORE-0601.md) |
| `STORY-073` | Story | Dual-Dispatch Moderation Commands Suite & Gateway Listeners | 2 | `EPIC-007` | [TASK-0732.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0732.md) |
| `EPIC-007` | Epic | Moderation 2.0 with Escalation & AutoMod | 13 | Self | [TASK-0732.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0732.md) |
| `STORY-072` | Story | Real-Time Automated Defense & Auto-Moderation Pipeline | 3 | `EPIC-007` | [TASK-0722.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0722.md) |
| `STORY-071` | Story | Configurable Dynamic Warning Escalation Engine & Anti-Spam Expirations | 3 | `EPIC-007` | [TASK-0712.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0712.md) |
| `STORY-070` | Story | Centralized Permission & Role Hierarchy Service, Punitive Discord Actions Core | 5 | `EPIC-007` | [TASK-0702.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0702.md) |
| `STORY-063` | Story | Dedicated #ririko-ai Channel Gateway Listener & Dual-Dispatch Commands Suite | 2 | `EPIC-006` | [TASK-0632.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0632.md) |
| `EPIC-006` | Epic | AI Chatbot 2.0 with Context Isolation & Safe Tools | 13 | Self | [TASK-0632.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0632.md) |
| `STORY-062` | Story | Deterministic Utility Tools, Explicit Clock & Application Security Interceptor | 3 | `EPIC-006` | [TASK-0622.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0622.md) |
| `STORY-061` | Story | Persistent Memory, Strict Per-User Context Isolation & Personality Engine | 3 | `EPIC-006` | [TASK-0612.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0612.md) |
| `STORY-060` | Story | Multi-Provider AI Core, Fallback Chain & Tool Calling Engine | 5 | `EPIC-006` | [TASK-0602.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0602.md) |
| `TASK-0530` | Task | Lavalink v4 Backend Integration, Autoinstall Script & LavaSrc Setup | 8 | `STORY-050` | [TASK-0530.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0530.md) |
| `BUG-0002` | Bug | Spotify Audio Mirroring Hard Artist Gate & Blind Fallback Elimination | 3 | `STORY-050` | [BUG-0002.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0002.md) |
| `TASK-0507` | Task | LavaSrc Precision Audio Mirroring (ISRC, Duration Guard & Candidate Scoring) | 3 | `STORY-050` | [TASK-0507.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0507.md) |
| `BUG-0001` | Bug | Fix Silent Audio Player Failure & Implement Real Multi-Source Extractors | 5 | `STORY-050` | [BUG-0001.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0001.md) |
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
| `STORY-041` | Story | Transactional Banking, Daily Streak Engine & Double-Entry Ledger | 5 | `EPIC-004` | [STORY-041.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-041.md) |
| `STORY-042` | Story | Leveling 2.0, Karma & High-Performance Materialized Leaderboards | 5 | `EPIC-004` | [STORY-042.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-042.md) |
| `STORY-043` | Story | Shop Catalog, Inventory Bags & SSRF-Protected Profile Customization | 5 | `EPIC-004` | [STORY-043.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-043.md) |
| `STORY-044` | Story | Profile Card 2.0 Graphics Canvas & Discord Economy Commands Suite | 5 | `EPIC-004` | [STORY-044.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-044.md) |
| `EPIC-004` | Epic | Centralized Transactional Economy & Banking Engine | 21 | Self | [EPIC-004.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/EPIC-004.md) |
| `STORY-050` | Story | Multi-Source Audio Extractors & Stream Resolvers | 5 | `EPIC-005` | [STORY-050.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-050.md) |
| `STORY-051` | Story | Voice Lifecycle, Audio Player Core & Queue Engine | 5 | `EPIC-005` | [STORY-051.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-051.md) |
| `STORY-052` | Story | Reactive Embed Controller & Dual-Dispatch Music Commands Suite | 3 | `EPIC-005` | [STORY-052.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-052.md) |
| `EPIC-005` | Epic | Multi-Source Music 2.0 Audio Engine | 13 | Self | [STORY-052.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-052.md) |

---

## ❌ Abandoned
*No abandoned tickets.*

---

### 📋 Groomed Stories & Bugs for EPIC-015 (TCG Progression, Equipment & Bosses)
| ID | Type | Title | Pts | Epic / Parent | Status | Prerequisites |
|---|---|---|---|---|---|---|
| `BUG-0010` | Bug | Grant TCG Items by Catalog Code, Auto-Equip Starter Blade & Repair Legacy Item Rows | 3 | `EPIC-015` | ✅ Done · [BUG-0010.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0010.md) | — |
| `BUG-0011` | Bug | Persist Crafting Dust and Charge It for Equipment Enhancement | 3 | `EPIC-015` | ✅ Done · [BUG-0011.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0011.md) | — |
| `STORY-150` | Story | Card EXP from Dungeon Wins & Real Skill MP Cost in Combat | 3 | `EPIC-015` | ✅ Done · [STORY-150.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-150.md) | `BUG-0010` |
| `STORY-151` | Story | DB-Driven Season Curves & Floor Boss Definitions (dungeon_bosses table) | 8 | `EPIC-015` | ✅ Done · [STORY-151.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-151.md) | `STORY-150` |
| `STORY-152` | Story | Dungeon Balance Simulator CLI & CI Win-Rate Bands | 5 | `EPIC-015` | ✅ Done · [STORY-152.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-152.md) | `STORY-151` |
| `STORY-153` | Story | tcg:boss-builder Script & BossSynthesizer Rendering | 8 | `EPIC-015` | ✅ Done · [STORY-153.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-153.md) | `STORY-151` |
| `STORY-154` | Story | Season 1 Infernal Crucible Boss Roster & Floor Seed Data | 5 | `EPIC-015` | ✅ Done · [STORY-154.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-154.md) | `STORY-152`, `STORY-153` |
| `STORY-155` | Story | Boss Artwork in Dungeon Battle Screen | 2 | `EPIC-015` | ✅ Done · [STORY-155.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-155.md) | `STORY-154` |
| `STORY-156` | Story | Equipment Acquisition: Drop Tables, Boss Signature Drops & Gear Power Budget | 8 | `EPIC-015` | ✅ Done · [STORY-156.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-156.md) | `STORY-152` |
| `STORY-157` | Story | Interactive Equipment Menu (/card gear) | 8 | `EPIC-015` | ✅ Done · [STORY-157.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-157.md) | `BUG-0010` |
| `STORY-158` | Story | Town Shop Revamp: Categories, Compare, Buy & Equip, Daily Rotation | 5 | `EPIC-015` | ✅ Done · [STORY-158.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-158.md) | `STORY-157` |
| `STORY-159` | Story | Early-Floor Tuning, Pity Blessing & Floor Star Ratings | 8 | `EPIC-015` | ✅ Done · [STORY-159.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-159.md) | `STORY-152`, `STORY-156` |
| `STORY-160` | Story | Equipment Crafting with Dust | 5 | `EPIC-015` | ✅ Done | `STORY-156` |
| `TASK-1601` | Task | CraftingService & Recipe Table: Floor-Gated Recipes, Dust/Credit/Ingredient Costs, Atomic Craft | 2 | `STORY-160` | ✅ Done | `STORY-156` |
| `TASK-1602` | Task | Interactive /item craft Menu (Slash & Prefix Parity) & Bot Service Wiring | 2 | `STORY-160` | ✅ Done | `TASK-1601` |
| `TASK-1603` | Task | Crafting Docs, Catalog Copy & Help Center Entry | 1 | `STORY-160` | ✅ Done | `TASK-1602` |
| `BUG-0014` | Bug | Equipped Gear Leaks Across Card Sales, Trades & Dismantles; Add Unequip All | 3 | `EPIC-015` | ✅ Done | — |
| `BUG-0015` | Bug | Catalog Seed Is Insert-Only, So Item Copy and Stat Changes Never Reach Existing DBs | 2 | `EPIC-015` | ✅ Done · [BUG-0015.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0015.md) | — |
| `BUG-0016` | Bug | Gear, Craft and Shop Dropdowns Silently Drop Entries Past 25 | 3 | `EPIC-015` | ✅ Done · [BUG-0016.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0016.md) | — |
| `BUG-0017` | Bug | Unknown /card Prefix Action Silently Opens the Collection & Card ID / Serial Number Overhaul | 2 | `EPIC-010` | ✅ Done · [BUG-0017.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0017.md) | — |
| `CHORE-0602` | Chore | Boot-Time Repair for Gear Stranded on Deleted or Transferred Cards | — | `EPIC-015` | ❌ Dropped | `BUG-0014` |
| `CHORE-0603` | Chore | Align Default Prefix: Code Fallback `!` vs .env.example and Guide Text `$` | 1 | — | ✅ Done · [CHORE-0603.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/CHORE-0603.md) | — |
| `BUG-0013` | Bug | player_energy.bonus_energy Is Read as Capacity but Never Granted (Daily Incremental Bonus Energy & Configurable Admin Cap) | 3 | `EPIC-015` | ✅ Done · [BUG-0013.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0013.md) | — |

### 📋 Groomed Stories & Tasks for EPIC-010 (Waifu TCG)
| ID | Type | Title | Pts | Epic / Parent | Status | Prerequisites |
|---|---|---|---|---|---|---|
| `STORY-100` | Story | Waifu Ingestion Pipeline, Asset Validation, Deduplication & Attribution | 3 | `EPIC-010` | ✅ Done · [TASK-1002.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1002.md) | `EPIC-002` |
| `TASK-1001` | Task | waifu.im Ingestion Client, Image Validation, SHA-256 Deduplication & Asset Repository | 2 | `STORY-100` | ✅ Done · [TASK-1001.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1001.md) | `EPIC-002` |
| `TASK-1002` | Task | Section 24 Attribution Footer, Soft-Delete Silhouette Fallback & Ingestion Unit Tests | 1 | `STORY-100` | ✅ Done · [TASK-1002.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1002.md) | `TASK-1001` |
| `STORY-101` | Story | 8-Tier Rarity Math, Card Attribute Generation & Automated Drops Engine | 5 | `EPIC-010` | ✅ Done · [TASK-1012.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1012.md) | `STORY-100` |
| `TASK-1011` | Task | 8-Tier Rarity Math Engine, Dynamic Stats Generation, Skills/Passives & Card Leveling | 3 | `STORY-101` | ✅ Done · [TASK-1011.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1011.md) | `STORY-100` |
| `TASK-1012` | Task | Chat Drops Engine, Anti-Sniping Cooldown, Card Dismantling & Collection Commands Suite | 2 | `STORY-101` | ✅ Done · [TASK-1012.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1012.md) | `TASK-1011` |
| `STORY-102` | Story | 7-Element Combat Engine & Tactical Status Effects (Including Ice) | 3 | `EPIC-010` | ✅ Done · [TASK-1022.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1022.md) | `STORY-101` |
| `TASK-1021` | Task | 7-Element Affinity Matrix (Including Ice), Tactical Status Effects, Dynamic Battle Perks & Combat Simulator | 2 | `STORY-102` | ✅ Done · [TASK-1021.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1021.md) | `STORY-101` |
| `TASK-1022` | Task | PvP Duels (`/game pvp`), Timed Expeditions (`/game explore`), Boss Raids (`/game boss`) & Quests | 1 | `STORY-102` | ✅ Done · [TASK-1022.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1022.md) | `TASK-1021` |
| `STORY-103` | Story | Equipment, Accessories, Consumables & Daily Energy Lifecycle Engine | 3 | `EPIC-010` | ✅ Done · [TASK-1032.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1032.md) | `STORY-102` |
| `TASK-1031` | Task | 6-Slot Combat Loadouts, Tier-Scaled Battle Perks, +0 to +10 Enhancement & Consumables Catalog | 2 | `STORY-103` | ✅ Done · [TASK-1031.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1031.md) | `STORY-102` |
| `TASK-1032` | Task | Level-Based Energy Lifecycle, Anti-Abuse 3/Day Potion Ceiling, Town Shop & Dual-Dispatch Commands | 1 | `STORY-103` | ✅ Done · [TASK-1032.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1032.md) | `TASK-1031` |
| `STORY-104` | Story | PvE Seasonal Dungeon Tower: Tutorial, Seasons & Exponential Scaling | 5 | `EPIC-010` | ✅ Done · [TASK-1042.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1042.md) | `STORY-103` |
| `TASK-1041` | Task | PvE Dungeon Progression Core, Multi-Layer Elemental Wards, 4 Scaling Models & Seasonal Environmental Affixes | 3 | `STORY-104` | ✅ Done · [TASK-1041.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1041.md) | `STORY-103` |
| `TASK-1042` | Task | Tutorial Prologue (T1–T4), Floor Energy Scaling, Loot Drops Engine & Dual-Dispatch `/dungeon` Suite | 2 | `STORY-104` | ✅ Done · [TASK-1042.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1042.md) | `TASK-1041` |
| `BUG-0008` | Bug | Fix Waifu TCG Tutorial False Completion, Missing Starter Card Seed & $climb Route | 3 | `STORY-104` | ✅ Done · [BUG-0008.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/BUG-0008.md) | None |
| `STORY-105` | Story | Atomic Trading, Marketplace, WaifuGuilds & Achievements Dispatch | 5 | `EPIC-010` | ✅ Done · [TASK-1061.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1061.md) | `STORY-104` |
| `TASK-1051` | Task | Atomic P2P Trading, State Locking & Community Marketplace Engine with Tax & Expiration | 3 | `STORY-105` | ✅ Done · [TASK-1051.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1051.md) | `STORY-104` |
| `TASK-1052` | Task | WaifuGuilds Factions, Multi-Asset Achievement Reward Dispatch, TCG Admin & Dual-Dispatch Commands Suite | 2 | `STORY-105` | ✅ Done · [TASK-1052.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1052.md) | `TASK-1051` |
| `TASK-1053` | Task | Waifu TCG Info Hub, Onboarding Guide & Type Advantage Tutorial (/tcg-info) | 2 | `STORY-105` | ✅ Done · [TASK-1053.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1053.md) | `TASK-1052` |
| `TASK-1061` | Task | Waifu TCG Visual Card Synthesis, Holographic Foil Engine & Card Builder CLI | 5 | `STORY-105` | ✅ Done · [TASK-1061.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1061.md) | `TASK-1053` |

### 📋 Groomed Stories & Tasks for EPIC-009 (Giveaways, AutoVoice & Mini-Games)
| ID | Type | Title | Pts | Epic / Parent | Status | Prerequisites |
|---|---|---|---|---|---|---|
| `STORY-090` | Story | Giveaways 2.0 Database Engine & Resilient Lifecycle | 5 | `EPIC-009` | ✅ Done · [TASK-0902.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0902.md) | `EPIC-002`, `EPIC-003` |
| `TASK-0901` | Task | Giveaways Repository, Lifecycle Scheduler & Crash-Resistant Rollover Engine | 3 | `STORY-090` | ✅ Done · [TASK-0901.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0901.md) | `EPIC-002`, `EPIC-003` |
| `TASK-0902` | Task | Dual-Dispatch Giveaway Commands Suite, Interactive Buttons & Gateway Listeners | 2 | `STORY-090` | ✅ Done · [TASK-0902.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0902.md) | `TASK-0901` |
| `STORY-091` | Story | Auto Voice Channels 2.0 (Join to Create & Orphan Cleanup) | 3 | `EPIC-009` | ✅ Done · [TASK-0912.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0912.md) | `EPIC-002`, `EPIC-003` |
| `TASK-0911` | Task | Voice State Gateway Handler, Join-To-Create Dynamic Channel Generator & Auto-Cleanup | 2 | `STORY-091` | ✅ Done · [TASK-0911.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0911.md) | `EPIC-002`, `EPIC-003` |
| `TASK-0912` | Task | Dual-Dispatch Auto-Voice Configuration & Control Commands | 1 | `STORY-091` | ✅ Done · [TASK-0912.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0912.md) | `TASK-0911` |
| `STORY-092` | Story | Interactive Mini-Games Suite (Minimax Tic-Tac-Toe, RPS, HighLow, CoinFlip, Dice) | 5 | `EPIC-009` | ✅ Done · [TASK-0922.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0922.md) | `EPIC-002`, `EPIC-004` |
| `TASK-0921` | Task | Minimax Tic-Tac-Toe AI, RPS Session Engine & State Machine | 3 | `STORY-092` | ✅ Done · [TASK-0921.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0921.md) | `EPIC-002`, `EPIC-004` |
| `TASK-0922` | Task | HighLow, Dice, CoinFlip & Dual-Dispatch Mini-Games Commands with Optional Economy Wagers | 2 | `STORY-092` | ✅ Done · [TASK-0922.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0922.md) | `TASK-0921` |

### 📋 Groomed Stories & Tasks for EPIC-008 (Streamer Notifications & Free Games Announcer)
| ID | Type | Title | Pts | Epic | Status | Prerequisites |
|---|---|---|---|---|---|---|
| `STORY-080` | Story | Multi-Platform Stream Watcher Engine & Thumbnail CDN (Twitch, YouTube Live, TikTok) | 5 | `EPIC-008` | ✅ Done · [TASK-0802.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0802.md) | `EPIC-002`, `EPIC-003` |
| `STORY-081` | Story | Free Games Announcer Engine (Epic Games Store & Steam Feed) | 3 | `EPIC-008` | ✅ Done · [TASK-0812.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0812.md) | `EPIC-002`, `EPIC-003` |

### 📋 Groomed Stories & Tasks for EPIC-011 (Web Dashboard)
> Groomed 2026-09-24, re-groomed 2026-09-25. Children total 75 pts (STORY-119 parked in the backlog, not counted). Delivery order: STORY-110, CHORE-1101, STORY-111, STORY-117, STORY-118, STORY-113, STORY-115, STORY-114, STORY-116, STORY-112 (security hardening first because owner-console and step-up writes depend on it). Pages expose only settings the bot actually reads (no placeholder UI). STORY-114 was re-groomed on 2026-09-25 after an audit of the bot: Command Overrides moved to STORY-163 (nothing read `command_settings`), and the Reaction Roles builder, Auto Roles and Auto Voice moved to STORY-164; both follow STORY-114.

| ID | Type | Title | Pts | Epic / Parent | Status | Prerequisites |
|---|---|---|---|---|---|---|
| `STORY-110` | Story | Next.js 16 App Router Scaffold, Discord OAuth2 & Guild Authorization | 8 | `EPIC-011` | ✅ Done · [STORY-110.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-110.md) | `EPIC-001` |
| `TASK-1101` | Task | apps/web Workspace Scaffold: Next.js 16, React 19, Tailwind, Strict TS, Env Schema & Server-Only Service Bootstrap | 3 | `STORY-110` | ✅ Done · [STORY-110.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-110.md) | `EPIC-001` |
| `TASK-1102` | Task | Discord OAuth2 (identify, guilds) Login/Callback/Logout & Revocable Server-Side Sessions (Hashed Session IDs, Encrypted Discord Tokens) | 3 | `STORY-110` | ✅ Done · [STORY-110.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-110.md) | `TASK-1101` |
| `TASK-1103` | Task | Guild Discovery & requireGuildAccess Guard (ManageGuild/Administrator, Bot Membership, Per-Request Re-Verification) & Server Selector | 2 | `STORY-110` | ✅ Done · [STORY-110.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-110.md) | `TASK-1102` |
| `CHORE-1101` | Chore | Cross-Process Guild Config Change Feed (guild_config_versions Table, Bot Watcher & Cache Invalidation Events) | 2 | `EPIC-011` | ✅ Done · [CHORE-1101.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/CHORE-1101.md) | `STORY-110` |
| `STORY-111` | Story | Shared Zod Config Schemas, Audit Trail, Dashboard Shell & CLI Parity | 8 | `EPIC-011` | ✅ Done · [STORY-111.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-111.md) | `STORY-110` |
| `TASK-1111` | Task | Shared Zod Guild Config Schemas in @ririko/core, GuildConfigService & audit_logs Field-Diff Writer | 3 | `STORY-111` | ✅ Done · [STORY-111.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-111.md) | `STORY-110`, `CHORE-1101` |
| `TASK-1112` | Task | Dashboard Shell: Guild Layout & Module Nav, Channel/Role Pickers, Server Action Form Kit & General Tab | 3 | `STORY-111` | ✅ Done · [STORY-111.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-111.md) | `TASK-1111` |
| `TASK-1113` | Task | `ririko guild:config <guild_id> [key] [value]` CLI Parity (get, set, list) on the Same Schemas & Service | 2 | `STORY-111` | ✅ Done · [STORY-111.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-111.md) | `TASK-1111` |
| `STORY-114` | Story | Settings Infrastructure, Logging, Moderation Escalation & AutoMod Pages | 8 | `EPIC-011` | ✅ Done · [STORY-114.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-114.md) | `STORY-111`, `STORY-117` |
| `TASK-1141` | Task | Typed Settings & Step-Up Settings Forms (Toggle, Number, Role/Channel Lists, Row Editor), CLI Typed Values & Logging Page (Log Channel, Case Log Wiring) | 3 | `STORY-114` | ✅ Done · [STORY-114.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-114.md) | `STORY-111`, `STORY-117` |
| `TASK-1142` | Task | Moderation Escalation Policy Builder (guild_settings.escalation_steps, Step-Up) & AutoMod Page (Per-Rule Toggle, Action, Limit, Exemptions) with Real AutoMod Actions | 5 | `STORY-114` | ✅ Done · [STORY-114.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-114.md) | `TASK-1141` |
| `TASK-1143` | Task | Reaction Roles Message Builder & Role Mapping, Auto Roles & Auto Voice Pages | 3 | `STORY-114` | ❌ Abandoned (re-groomed into `STORY-164` before work started) | `TASK-1142` |
| `STORY-163` | Story | Command Overrides Engine & Page (command_settings Enable/Disable, Channel Overrides, Allowed/Blocked Roles) | 5 | `EPIC-011` | ✅ Done · [STORY-163.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-163.md) | `STORY-114` |
| `TASK-1631` | Task | CommandSettingsRepository, Web-Readable Command Catalog & Override Middleware (Guild/Channel Precedence, Allowed/Blocked Roles, Cached with guild:configChanged) | 3 | `STORY-163` | ✅ Done · [STORY-163.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-163.md) | `STORY-114` |
| `TASK-1632` | Task | Command Overrides Page & guild:config Keys | 2 | `STORY-163` | ✅ Done · [STORY-163.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-163.md) | `TASK-1631` |
| `STORY-164` | Story | Reaction Roles Builder (Buttons & Select Menus), Auto Roles & Auto Voice Pages | 8 | `EPIC-011` | 🎯 To Do | `STORY-114` |
| `TASK-1641` | Task | Guild Resources (Voice Channels, Role Positions & Bot Top Role, Boost Tier) & Auto Roles and Auto Voice Pages | 3 | `STORY-164` | 🎯 To Do | `STORY-114` |
| `TASK-1642` | Task | Reaction Role Message Builder: Publish Buttons & Select Menus via Bot REST (Step-Up, Audit) | 3 | `STORY-164` | 🎯 To Do | `TASK-1641` |
| `TASK-1643` | Task | Edit & Remove Reaction Role Bindings (Strip Removed Components from the Message) | 2 | `STORY-164` | 🎯 To Do | `TASK-1642` |
| `STORY-115` | Story | Economy & Banking, XP & Ranking, Games & Giveaways Pages | 5 | `EPIC-011` | 🎯 To Do | `STORY-111`, `STORY-117` |
| `TASK-1151` | Task | Economy & Banking Page (Rewards, Interest, Item Shop Manager) & XP & Ranking Page (Multipliers, Voice XP, Level-Up Channel) | 3 | `STORY-115` | 🎯 To Do | `STORY-111` |
| `TASK-1152` | Task | Games Page (Enable/Disable, Wager Limits, Cooldowns) & Giveaways Page (Active List, End, Reroll, History) | 2 | `STORY-115` | 🎯 To Do | `TASK-1151` |
| `STORY-116` | Story | Music, AI Chatbot, Image Generation, Stream Alerts, Free Games, Welcome & Integrations Pages | 8 | `EPIC-011` | 🎯 To Do | `STORY-111`, `STORY-133`, `STORY-117` |
| `TASK-1161` | Task | Music Page (Volume, DJ Role, Music Channel), AI Chatbot Page (Persona, Provider/Model, Tool Toggles) & Image Generation Page (Provider, Quotas, Presets) | 3 | `STORY-116` | 🎯 To Do | `STORY-111` |
| `TASK-1162` | Task | Stream Alerts Page (Streamer Subscriptions, Templates, Mention Roles) & Free Games Page (Channels, Ping Roles) | 2 | `STORY-116` | 🎯 To Do | `TASK-1161` |
| `TASK-1163` | Task | Welcome & Farewell Live Canvas Preview Editor (SSRF-Safe Background Upload) & Integrations Status Page (Zero Secret Exposure) | 3 | `STORY-116` | 🎯 To Do | `TASK-1162`, `STORY-133` |
| `STORY-117` | Story | Passkey Sign-In Gate, Step-Up Re-Verification & Owner Guard | 5 | `EPIC-011` | ✅ Done · [STORY-117.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-117.md) | `STORY-111` |
| `TASK-1171` | Task | WebAuthn Passkeys: web_passkeys Table, Security Page (Add/Remove), Sign-In Gate for Enrolled Users & requireStepUp | 3 | `STORY-117` | ✅ Done · [STORY-117.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-117.md) | `STORY-111` |
| `TASK-1174` | Task | BOT_OWNER_ID Owner Guard (Passkey + Fresh Step-Up) & `ririko passkeys:reset` Recovery CLI | 2 | `STORY-117` | ✅ Done · [STORY-117.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-117.md) | `TASK-1171` |
| `STORY-118` | Story | Session Management, Sign-In & Change Alerts, Browser Hardening & Authorization Coverage | 5 | `EPIC-011` | ✅ Done · [STORY-118.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-118.md) | `STORY-117` |
| `TASK-1172` | Task | Active Sessions Page (Revoke, Sign Out Everywhere), New-Device Sign-In & Passkey Removal DMs, Dashboard Change Notices to the Guild Log Channel | 2 | `STORY-118` | ✅ Done · [STORY-118.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-118.md) | `STORY-117` |
| `TASK-1173` | Task | Strict Nonce CSP & Security Headers, React Taint & server-only Secret Guards, Server Action Authorization Coverage Test | 3 | `STORY-118` | ✅ Done · [STORY-118.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-118.md) | `TASK-1172` |
| `STORY-119` | Story | Chrome Device Bound Session Credentials (DBSC) for Dashboard Sessions | 3 | `EPIC-011` | 📥 Backlog (estimate provisional) | `STORY-118` |
| `STORY-112` | Story | Waifu TCG Web Management, Album Viewer & Dungeon Tower Visualizer | 8 | `EPIC-011` | 🎯 To Do | `STORY-111`, `STORY-117` |
| `TASK-1121` | Task | TCG Settings: Guild Drop Settings, TCG Manager Role & Owner-Gated Global Rules (Market Tax, Listing Expiry, Energy Governance) | 3 | `STORY-112` | 🎯 To Do | `STORY-111` |
| `TASK-1122` | Task | Owner-Only Dungeon Season Editor, Difficulty Curve Visualizer & Boss Enrage/Shield/Loot Configurator | 3 | `STORY-112` | 🎯 To Do | `TASK-1121` |
| `TASK-1123` | Task | Card Album Viewer (CardSynthesizer Renders), Shop Catalog Manager & Achievement Manager | 2 | `STORY-112` | 🎯 To Do | `TASK-1122` |
| `STORY-113` | Story | Server Analytics Overview, Moderation Case Log Inspector & Dashboard Audit Viewer | 5 | `EPIC-011` | ✅ Done · [STORY-113.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-113.md) | `STORY-111` |
| `TASK-1131` | Task | Command Usage Daily Counters (Dual-Dialect Table & Router Hook), Bot Status Heartbeat & Overview Tab | 3 | `STORY-113` | ✅ Done · [STORY-113.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-113.md) | `STORY-111` |
| `TASK-1132` | Task | Moderation Case Log Inspector (Filters, Pagination, Case Detail) & Dashboard Audit Log Viewer | 2 | `STORY-113` | ✅ Done · [STORY-113.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-113.md) | `TASK-1131` |

### 📋 Groomed Stories & Tasks for EPIC-012 (Quality Gates & Production Deployment)
> Scope gap from the regrooming: the original STORY-120 targeted 80%+ test coverage and the original STORY-122 included GitHub Actions CI/CD. CI/CD and coverage tracking were pulled forward on 2026-09-26 as STORY-123 (CircleCI + Codecov instead of GitHub Actions); the 80%+ coverage target is still open. TASK-1221 can reuse the bot status record from TASK-1131 (EPIC-011).

| ID | Type | Title | Pts | Epic / Parent | Status | Prerequisites |
|---|---|---|---|---|---|---|
| `STORY-120` | Story | E2E Integration Tests & Quality Gates Setup | 5 | `EPIC-012` | 🎯 To Do | — |
| `TASK-1201` | Task | Setup Playwright for Web Dashboard E2E Tests | 2 | `STORY-120` | 🎯 To Do | — |
| `TASK-1202` | Task | Setup Discord API Mock Harness & Integration Test Suite | 3 | `STORY-120` | 🎯 To Do | — |
| `STORY-121` | Story | Rootless Dockerfile & Containerization | 5 | `EPIC-012` | 🎯 To Do | `STORY-120` |
| `TASK-1211` | Task | Multi-stage Rootless Dockerfile for Web Dashboard | 2 | `STORY-121` | 🎯 To Do | — |
| `TASK-1212` | Task | Multi-stage Rootless Dockerfile for Bot | 3 | `STORY-121` | 🎯 To Do | — |
| `STORY-122` | Story | Production Orchestration & Health Probes | 3 | `EPIC-012` | 🎯 To Do | `STORY-121` |
| `TASK-1221` | Task | Implement `/health` and `/ready` probes for Bot and Web | 1 | `STORY-122` | 🎯 To Do | — |
| `TASK-1222` | Task | docker-compose.production.yml with Redis, PostgreSQL, and App Services | 2 | `STORY-122` | 🎯 To Do | — |
| `STORY-123` | Story | CI Pipeline: CircleCI Quality Gates, Codecov Coverage & Vercel Status Site | 5 | `EPIC-012` | ✅ Done · [STORY-123.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-123.md) | — |
| `TASK-1231` | Task | One-Time Prettier Baseline & CircleCI Pipeline (Lint, Typecheck, Test, Web Build, Gitleaks) | 2 | `STORY-123` | ✅ Done · [STORY-123.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-123.md) | — |
| `TASK-1232` | Task | Vitest v8 Coverage with Ratchet Thresholds, JUnit Test Results & Codecov Upload | 2 | `STORY-123` | ✅ Done · [STORY-123.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-123.md) | `TASK-1231` |
| `TASK-1233` | Task | Vercel Project Status Site Generated from the Kanban Board | 1 | `STORY-123` | ✅ Done · [STORY-123.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-123.md) | — |

### 📋 Groomed Stories for EPIC-013 (Media Synthesis, Reactions & AI Images)
| ID | Type | Title | Pts | Epic | Status | Prerequisites |
|---|---|---|---|---|---|---|
| `STORY-130` | Story | Unified `/react` Command (68 Reactions, Autocomplete & Legacy Prefix Aliases) & OtakuGIFs Cache | 5 | `EPIC-013` | ✅ Done · [STORY-130.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-130.md) | `EPIC-002`, `EPIC-003` |
| `TASK-1301` | Task | Command Framework: Autocomplete Option Flag, `ctx.invokedName` Alias Resolution, REACTIONS Category & 68-Entry Reaction Catalog | 2 | `STORY-130` | ✅ Done · [STORY-130.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-130.md) | — |
| `TASK-1302` | Task | ReactionGifService (OtakuGIFs Client, TTL URL Pool, Offline Fallback) & Unified `/react` Command with 67 Legacy Prefix Aliases | 3 | `STORY-130` | ✅ Done · [STORY-130.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-130.md) | `TASK-1301` |
| `STORY-131` | Story | 11 Meme Template Canvas Synthesizers with @napi-rs/canvas | 5 | `EPIC-013` | ✅ Done · [STORY-131.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-131.md) | `EPIC-003` |
| `TASK-1311` | Task | Meme Synthesis Engine: 11-Template Catalog, @napi-rs/canvas Renderer (Auto-Wrap, Font Scaling & Shadows) & Vitest Suite | 3 | `STORY-131` | ✅ Done · [TASK-1311.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1311.md) | — |
| `TASK-1312` | Task | Dual-Dispatch /meme Command Suite with Autocomplete, 11 Legacy Prefix Aliases & Attachment Delivery | 2 | `STORY-131` | ✅ Done · [TASK-1312.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1312.md) | `TASK-1311` |
| `STORY-132` | Story | Multi-Backend AI Image Generation Service (/imagine, Gemini Imagen, ComfyUI, Replicate) | 5 | `EPIC-013` | ✅ Done · [STORY-132.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-132.md) | `EPIC-003` |
| `TASK-1321` | Task | Image Generation Engine: Dual-Dialect Repository, Multi-Backend Adapters (Gemini, ComfyUI, Replicate, Mock), Anime Presets & Concurrency Job Queue | 3 | `STORY-132` | ✅ Done · [TASK-1321.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1321.md) | `EPIC-003` |
| `TASK-1322` | Task | Dual-Dispatch /imagine Command Suite, Discord Attachment Delivery, Interactive Action Row & Legacy Configuration Parity | 2 | `STORY-132` | ✅ Done · [TASK-1322.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1322.md) | `TASK-1321` |
| `STORY-133` | Story | Welcomer & Farewell Dynamic Card Canvas with SSRF Verification | 3 | `EPIC-013` | ✅ Done · [TASK-1332.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1332.md) | `EPIC-003` |
| `TASK-1331` | Task | Database schema (guild_welcomer / guild_farewell), WelcomerService with @napi-rs/canvas renderer, Background SSRF & DNS validation, and unit tests | 2 | `STORY-133` | ✅ Done · [TASK-1331.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1331.md) | — |
| `TASK-1332` | Task | guildMemberAdd / guildMemberRemove Discord Gateway listeners and dual-dispatch configuration commands (/welcomer, /farewell) | 1 | `STORY-133` | ✅ Done · [TASK-1332.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1332.md) | `TASK-1331` |


### 📋 Groomed Stories for EPIC-014 (Server Utilities, AutoRoles & Community)
| ID | Type | Title | Pts | Epic | Status | Prerequisites |
|---|---|---|---|---|---|---|
| `STORY-140` | Story | Automatic Role System & Interactive Reaction Roles (Buttons & Select Menus) | 5 | `EPIC-014` | ✅ Done · [STORY-140.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-140.md) | `EPIC-002`, `EPIC-003` |
| `STORY-141` | Story | Persistent Natural Language Reminders Engine & Chrono Scheduler | 5 | `EPIC-014` | ✅ Done · [STORY-141.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-141.md) | `EPIC-002`, `EPIC-003` |
| `STORY-142` | Story | Anime & Manga Search Service (Jikan v4 & AniList API) | 5 | `EPIC-014` | ✅ Done · [STORY-142.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-142.md) | `EPIC-003`, `CHORE-1401` |
| `STORY-143` | Story | Server Utility, Identity & Timezone Commands Parity (/get-avatar, /guild-info, /member-info, /prefix, /timezone) | 5 | `EPIC-014` | ✅ Done · [STORY-143.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-143.md) | `EPIC-002`, `EPIC-003` |
| `STORY-144` | Story | Anime Image Commands Parity (/waifu & /wallpaper) on REST APIs | 3 | `EPIC-014` | ✅ Done · [STORY-144.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-144.md) | `CHORE-1401` |

### 🛠️ Completed Tasks for STORY-143 (Server Utility, Identity & Timezone Commands Parity)
| ID | Type | Title | Pts | Parent | Status | Prerequisites |
|---|---|---|---|---|---|---|
| `TASK-1431` | Task | GuildSettingsService & In-Memory Cache (Prefix & Timezone) with CommandRouter.resolvePrefix Integration | 2 | `STORY-143` | ✅ Done · [STORY-143.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-143.md) | `EPIC-002`, `EPIC-003` |
| `TASK-1432` | Task | Dual-Dispatch /prefix and /timezone Commands Suite with Slash & Prefix Parity | 2 | `STORY-143` | ✅ Done · [STORY-143.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-143.md) | `TASK-1431` |
| `TASK-1433` | Task | Dual-Dispatch /get-avatar, /guild-info, and /member-info Commands Suite with Timezone-Aware Formatting | 1 | `STORY-143` | ✅ Done · [STORY-143.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/STORY-143.md) | `TASK-1431` |

### 🛠️ Completed Tasks for STORY-140 (Automatic Role System & Reaction Roles)
| ID | Type | Title | Pts | Parent | Status | Prerequisites |
|---|---|---|---|---|---|---|
| `TASK-1401` | Task | Database Schemas & Dual-Dialect Repositories (AutoRoles, ReactionRoles, TempRoles) | 1 | `STORY-140` | ✅ Done · [TASK-1401.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1401.md) | `EPIC-002` |
| `TASK-1402` | Task | AutoRole Engine: Join Roles (Humans & Bots), Verification Gateway & Temp Role Sweeper | 1 | `STORY-140` | ✅ Done · [TASK-1402.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1402.md) | `TASK-1401` |
| `TASK-1403` | Task | ReactionRole Engine: Multi-Mode Emoji, Button & Select Menu Handlers | 2 | `STORY-140` | ✅ Done · [TASK-1403.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1403.md) | `TASK-1401` |
| `TASK-1404` | Task | Dual-Dispatch Commands (/autorole, /create-reaction-role, /reaction-roles, /temprole) with Slash & Prefix Parity | 1 | `STORY-140` | ✅ Done · [TASK-1404.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1404.md) | `TASK-1402`, `TASK-1403` |
| `TASK-1405` | Task | Gateway Listener Wiring, Component Routing & Comprehensive Vitest Suites | 1 | `STORY-140` | ✅ Done · [TASK-1405.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-1405.md) | `TASK-1404` |

### 🛠️ Completed Tasks for EPIC-007 (Moderation 2.0)
| ID | Type | Title | Pts | Parent | Status | Prerequisites |
|---|---|---|---|---|---|---|
| `TASK-0701` | Task | PermissionService & Discord Punitive Actions Core (Kick, Ban, Softban, Timeout, Lock) | 3 | `STORY-070` | ✅ Done · [TASK-0701.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0701.md) | `EPIC-002`, `EPIC-003` |
| `TASK-0702` | Task | Sequential Case Audit Logger, Staff Notes Manager & Disciplinary History | 2 | `STORY-070` | ✅ Done · [TASK-0702.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0702.md) | `TASK-0701` |
| `TASK-0711` | Task | Dynamic Warning Escalation Engine & Sliding-Window Warning Expirations | 2 | `STORY-071` | ✅ Done · [TASK-0711.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0711.md) | `STORY-070` |
| `TASK-0712` | Task | Disciplinary Purge & Bulk Message Sanitizer with Multi-Filter Support | 1 | `STORY-071` | ✅ Done · [TASK-0712.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0712.md) | `TASK-0711` |
| `TASK-0721` | Task | AutoMod Rule Pipeline & High-Speed Pattern Engine (Invites, Phishing, Mentions, Spam) | 2 | `STORY-072` | ✅ Done · [TASK-0721.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0721.md) | `STORY-070` |
| `TASK-0722` | Task | Anti-Raid Mass Join Monitor & Automated Server Verification Gate | 1 | `STORY-072` | ✅ Done · [TASK-0722.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0722.md) | `TASK-0721` |
| `TASK-0731` | Task | Dual-Dispatch Moderation Commands Suite (/warn, /timeout, /kick, /ban, /purge, /lock, etc.) | 1 | `STORY-073` | ✅ Done · [TASK-0731.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0731.md) | `STORY-071`, `STORY-072` |
| `TASK-0732` | Task | Gateway Moderation Listeners, AutoMod Message Pipeline Wiring & Integration Tests | 1 | `STORY-073` | ✅ Done · [TASK-0732.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0732.md) | `TASK-0731` |

### 🛠️ Groomed Tasks for EPIC-006
| ID | Type | Title | Pts | Parent | Status | Prerequisites |
|---|---|---|---|---|---|---|
| `TASK-0601` | Task | packages/ai Scaffolding, Core Types, Provider Interfaces & Fallback Chain Manager | 3 | `STORY-060` | ✅ Done · [TASK-0601.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0601.md) | `EPIC-002`, `EPIC-003` |
| `TASK-0602` | Task | Google Gemini (@google/genai), OpenAI & Ollama Model Adapters with Native Tool Calling | 2 | `STORY-060` | ✅ Done · [TASK-0602.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0602.md) | `TASK-0601` |
| `TASK-0611` | Task | AI Conversation Repository, Multi-Dialect Schemas & Strict Per-User Isolation Engine | 2 | `STORY-061` | ✅ Done · [TASK-0611.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0611.md) | `STORY-060` |
| `TASK-0612` | Task | Personality Engine, System Safety Prompts & Sanitized Identity Ingestion | 1 | `STORY-061` | ✅ Done · [TASK-0612.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0612.md) | `TASK-0611` |
| `TASK-0621` | Task | Explicit Time Tool (get_current_time) with Multi-Tier Timezone Resolution & Utility Tools | 1 | `STORY-062` | ✅ Done · [TASK-0621.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0621.md) | `STORY-061` |
| `TASK-0622` | Task | Application Security Interceptor & Discord Permission-Mediated Tool Calling | 2 | `STORY-062` | ✅ Done · [TASK-0622.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0622.md) | `TASK-0621` |
| `TASK-0631` | Task | Dedicated #ririko-ai Channel Gateway Listener & Debounced Streaming Message Controller | 1 | `STORY-063` | ✅ Done · [TASK-0631.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0631.md) | `STORY-062` |
| `TASK-0632` | Task | Dual-Dispatch AI Commands Suite (/ai chat, /ai model, /ai channel, /ai persona, /ai clear) & Tests | 1 | `STORY-063` | ✅ Done · [TASK-0632.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0632.md) | `TASK-0631` |

### 🛠️ Groomed Tasks for EPIC-005
| ID | Type | Title | Pts | Parent | Status | Prerequisites |
|---|---|---|---|---|---|---|
| `TASK-0501` | Task | Extractor Interfaces, Pattern Matchers & Source Adapters | 3 | `STORY-050` | ✅ Done · [TASK-0501.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0501.md) | `EPIC-002`, `EPIC-003` |
| `TASK-0502` | Task | Session Cookie Rotation, Client Spoofing & Health Checks | 2 | `STORY-050` | ✅ Done · [TASK-0502.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0502.md) | `TASK-0501` |
| `TASK-0503` | Task | YouTube PO-Token Automation: CLI Generator & In-Process Background Provider | 3 | `STORY-050` | ✅ Done · [TASK-0503.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0503.md) | `TASK-0502` |
| `TASK-0504` | Task | Playwright Firefox YouTube Credential Harvester (Cookies, PO-Token, VisitorData & Client Spoofing) | 3 | `STORY-050` | ✅ Done · [TASK-0504.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0504.md) | `TASK-0503` |
| `TASK-0505` | Task | Chrome/Chromium Browser Harvester (Playwright Chrome, Anti-Detection & Interactive Google Login) | 2 | `STORY-050` | ✅ Done · [TASK-0505.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0505.md) | `TASK-0504` |
| `TASK-0506` | Task | Spotify Web API Integration & Bridge Overhaul (Scrap go-librespot) | 3 | `STORY-050` | ✅ Done · [TASK-0506.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0506.md) | `TASK-0505` |
| `TASK-0511` | Task | Audio Queue State Machine, Loop Modes, Audio Filters & Volume Clamping | 3 | `STORY-051` | ✅ Done · [TASK-0511.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0511.md) | `STORY-050` |
| `TASK-0512` | Task | Voice Connection Lifecycle, Idle Auto-Disconnect & Playlists Repo | 2 | `STORY-051` | ✅ Done · [TASK-0512.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0512.md) | `TASK-0511` |
| `TASK-0521` | Task | Dual-Dispatch Music Commands Suite (17 Commands) | 2 | `STORY-052` | ✅ Done · [TASK-0521.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0521.md) | `STORY-051` |
| `TASK-0522` | Task | Reactive Embed Controller & Interactive Button Matrix (Zero Polling) | 1 | `STORY-052` | ✅ Done · [TASK-0522.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0522.md) | `TASK-0521` |

### 🛠️ Groomed Tasks for EPIC-004
| ID | Type | Title | Pts | Parent | Status | Prerequisites |
|---|---|---|---|---|---|---|
| `TASK-0412` | Task | Banking Service (Deposit, Withdraw, Capacity Scaling, Interest Yield & Deadlock-Free Transfers) | 3 | `STORY-041` | ✅ Done · [TASK-0412.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0412.md) | `TASK-0411` |
| `TASK-0421` | Task | Leveling Progression Formula (5L^2 + 50L + 100), Level-Up Events & Karma Controls | 2 | `STORY-042` | ✅ Done · [TASK-0421.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0421.md) | `STORY-041` |
| `TASK-0422` | Task | Materialized Leaderboard Snapshot Engine, Cron Calculation & O(1) Dense Rank Queries | 3 | `STORY-042` | ✅ Done · [TASK-0422.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0422.md) | `TASK-0421` |
| `TASK-0431` | Task | Item Catalog Repository, Inventory Bags & Usable Consumables (Anti-Abuse Daily Potion Ceilings) | 3 | `STORY-043` | ✅ Done · [TASK-0431.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0431.md) | `TASK-0412` |
| `TASK-0432` | Task | Custom Profile Background Manager with DNS/SSRF IP Verification, Dimension Bounds & Cache | 2 | `STORY-043` | ✅ Done · [TASK-0432.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0432.md) | `TASK-0431` |
| `TASK-0441` | Task | Profile Card 2.0 Renderer with @napi-rs/canvas (Avatar, Ranks, XP Bar, Balances, Card Slot) | 3 | `STORY-044` | ✅ Done · [TASK-0441.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0441.md) | `TASK-0422`, `TASK-0432` |
| `TASK-0442` | Task | Dual-Dispatch Discord Commands & Gateway Event Listeners | 2 | `STORY-044` | ✅ Done · [TASK-0442.md](file:///Z:/Projects/ririko-v2-2026/docs/kanban/handovers/TASK-0442.md) | `TASK-0441` |


