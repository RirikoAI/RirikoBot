# Implementation roadmap
Updated 2026-09-14. This replaces the draft schedule, which incorrectly marked unverified work complete. There are no estimated completion dates.

## Current checkpoint
The full original specification is preserved in [BLUEPRINT.md](../BLUEPRINT.md); [requirements.md](requirements.md) maps all sections and final acceptance criteria to evidence and remaining work. [The pinned branch comparison](branch-comparison.md) distinguishes implemented Astra foundation code from Gemini's planning scaffold and explains the RIR-110 improvements. No documentation count certifies product completion.

The source audit and executable foundation are implemented. This is not a complete Ririko 2.0 release. Only ping, prefix/setprefix and help are registered in the new runtime. The authoritative inventory contains all 141 legacy command files; their presence in the inventory is not a claim of working parity. New code never imports the legacy runtime.

| Phase | State | Scope and remaining acceptance evidence |
|---|---|---|
| 0 — Audit and decisions | Source audit complete | 141 command manifests, 17 tables/108 columns/11 FKs, source hashes, assets, providers, deployment, migration risks. Legacy runtime was inspected, not deployed. Representative production data is absent. |
| 1 — Foundation | Implemented; live deployment validation pending | ESM pnpm workspaces; config/logging; PostgreSQL and SQLite repositories; explicit checksummed migrations; transactional revision/audit; permissions; metadata registry; parser/dispatcher; ping/prefix/help; Discord transport; CLI; generators; health/lifecycle; CI/Docker definitions. See testing.md for actual local results. |
| 2 — Compatibility | Pending | get-avatar, guildinfo/memberinfo, anime/manga/wallpaper/waifu, all 68 reactions, 11 meme interfaces/96 meme assets, welcome/farewell, reaction roles, reminders, basic guild behavior. Keep exact aliases/options from manifest; repair broken handlers with documented compatibility behavior. |
| 3 — Rewritten systems | Pending | Music (YouTube, Spotify, Deezer, SoundCloud), moderation, AI, image generation, giveaways, auto voice, Twitch/TikTok/Facebook capability assessments, stream notifications and free games. Persistent recovery, authorization, idempotency and real adapter tests required. |
| 4 — Central systems | Pending | Transactional global/guild economy, bank/ledger, anti-spam rewards, voice XP, rankings, profile/background cache and mini-games. Preserve global legacy balances without multiplying them into guild wallets. |
| 5 — Waifu TCG | Pending | Attribution-preserving ingestion/cache, configurable rarity/elements, transactional claims/equip/trades/market, collection, combat, quests, expeditions/dungeons/bosses, player guilds and achievements. |
| 6 — Dashboard | Pending | Next.js/React, Discord OAuth, fresh guild authorization, sessions/CSRF, shared schema forms, every implemented module's config, diagnostics, user collection/market. Playwright browser E2E required. |
| 7 — Migration and release | Pending | Legacy importer dry-run/apply/verify/rollback; representative DB and giveaway snapshot; restore rehearsal; parity matrix completed; real Discord/provider smoke tests; Docker image build/start; rollout flags and release checklist. |

## Foundation boundary
Implemented CLI commands are documented in development.md. The generator currently creates commands, tests and dual-syntax documentation. Other generator families and operator commands remain pending. No fake legacy importer, provider, game, dashboard, or placeholder command is registered.

The foundation migrator refuses legacy/unrecognized schemas and never imports user data. There is no representative 1.4.0 database or giveaway JSON in this workspace. The compiled bot requires credentials and an explicitly migrated database. Command synchronization is a separate operator action and has not been performed against Discord.

The foundation is now tracked at `801103c0e4c70eca6a380d7d1122b11234695bb1` on `develop/2.0.0-astra`. The independent legacy checkout remains pinned and immutable. [The work board](../.workboard/BOARD.md) is the authoritative execution record; its initial governance chore uses a separate topic branch. PR publication requires the user's delivery checkpoint decision.

## Phase gates
Each phase requires lint, strict typecheck, unit tests, integration tests, applicable E2E and production builds; failures are not hidden by pass-with-no-tests switches. Match tests to failure modes: concurrent writes, permission bypass, cross-user data isolation, provider errors, duplicate events and crash recovery. A passing fake/provider fixture is not evidence that live authentication or streaming works.

Before a feature becomes visible, add its service contract, persistence/migrations if needed, permission rules, metadata, slash/prefix docs and tests. Before legacy cutover, every inventory item must have verified parity or an explicit compatibility/deprecation path. Full release acceptance also includes every new system in the original specification; this checkpoint does not waive those requirements.

## Next implementation slice
This describes backlog order, not permission to start work. Groom estimates and dependencies through the [standing protocol](../.workboard/PROTOCOL.md), then complete the current PR checkpoint before selecting another story or epic.

Port remaining general/guild commands through transport adapters, then anime/reactions/memes with validated cached providers/assets. Add the durable job foundation before reminders, giveaways or notifications. Implement service/schema changes in bounded groups and review before registering features. The source inventory and migration manifests are the continuing checklist.

