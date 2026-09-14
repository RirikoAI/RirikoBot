# Blueprint requirement coverage

Generated from [requirements.json](requirements.json) against the preserved [user blueprint](../BLUEPRINT.md). See [the branch comparison](branch-comparison.md) and [work board](../.workboard/BOARD.md).

**These are section/acceptance classifications, not a percentage of product completion.** `documented` means an artifact or rule exists; `partial` means only the stated subset exists; `planned` means implementation is pending. `implemented` needs code and test references, but the validator does not run those tests or prove live behavior. Every gap remains explicit.

Source: User-supplied Full Platform Rework attachment; preserved on 2026-09-14. Later explicit work-control and stacking instructions take precedence.. Original attachment SHA-256: `5261a43d6522deccc8a9fe686f700a76867b0aa4a0f3eadb7a22cfb8eb6424c2`. Validation normalizes CRLF/LF only, so clones preserve text across operating systems. Blueprint amendments need explicit user direction and a reviewed provenance update; do not silently change the source to make a check pass.

**91 sections:** 0 implemented · 12 documented · 32 partial · 47 planned.

| ID | Original requirement | Status | Owning backlog scope | Remaining work / evidence boundary |
|---|---|---|---|---|
| BP-00 | Absolute Rules | documented | RIR-100, RIR-801 | Standing preservation, KISS and compatibility rules exist; future code still needs per-ticket review. |
| BP-01 | FIRST TASK: AUDIT THE EXISTING REPOSITORY | documented | RIR-100, RIR-802 | Source audit inventories 141 commands, 17 tables and assets at the pinned legacy SHA; it does not certify runtime parity or production data. |
| BP-02 | CREATE THE AI ENGINEERING TEAM FIRST | documented | RIR-100 | All 18 specialist definitions exist with ownership and handoffs; definitions do not mean every subsystem is implemented. |
| BP-03 | CREATE PROJECT-LEVEL AGENT INSTRUCTIONS | documented | RIR-100 | Root instructions and modular imports cover development and governance; future sessions must follow them. |
| BP-04 | CREATE A MODERN PROJECT STRUCTURE | partial | RIR-100, RIR-801 | Five working application/library workspaces isolate Discord and persistence; web and provider/domain packages await working implementations. |
| BP-05 | TECHNOLOGY BASELINE | partial | RIR-100, RIR-801 | Pinned Node/TypeScript/Discord/Drizzle/Vitest baseline exists; select dashboard and provider versions when those scopes are implemented. |
| BP-06 | KISS + EXTENSIBILITY PRINCIPLE | partial | RIR-100, RIR-801 | The command generator works and is tested; module, adapter, migration, game and dashboard generators are pending. |
| BP-07 | COMMAND SYSTEM | partial | RIR-200, RIR-801 | Shared slash/prefix registry, aliases, permissions, settings and cooldowns work for ping/prefix/help; remaining legacy commands and all rate-limit dimensions are pending. |
| BP-08 | HELP SYSTEM | partial | RIR-200, RIR-801 | Metadata-driven search, categories, paging and requester-bound controls work for registered commands; dashboard links and full catalog await those features. |
| BP-09 | RIRIKO 2.0 MODULE SYSTEM | partial | RIR-200, RIR-801 | Core module flags/settings and CLI controls exist; the requested non-core modules are not registered. |
| BP-10 | MUSIC 2.0 | planned | RIR-300, RIR-803 | No audio engine/resolver is implemented. Preserve required YouTube, Spotify, Deezer and SoundCloud plus safe AI controls and source capability checks. |
| BP-11 | AI CHATBOT 2.0 | planned | RIR-300, RIR-803 | No AI adapter or conversation store exists. Implement dedicated opt-in channel, per-user context, preferences, personality separation, time tool and safe mediated tools. |
| BP-12 | MODERATION 2.0 | planned | RIR-300, RIR-803 | Moderation commands, configurable warning escalation, audit history, AutoMod and anti-raid rules are pending. |
| BP-13 | AUTOMATIC ROLE SYSTEM | planned | RIR-200, RIR-801, RIR-803 | Join/bot/verified/temporary/activity roles, reaction/button/select roles and dashboard controls are pending. |
| BP-14 | IMAGE GENERATION 2.0 | planned | RIR-300, RIR-803 | Image adapters, actual free/paid capability assessment, guild/user settings, quotas and bounded persistent jobs are pending. |
| BP-15 | DEFAULT ANIME PROMPTS | planned | RIR-300, RIR-803 | Configurable positive/negative anime defaults and administrator-controlled user opt-out are pending. |
| BP-16 | GIVEAWAY 2.0 | planned | RIR-300, RIR-803 | Database-backed entries, scheduling, eligibility, rerolls, winner history and restart recovery are pending. |
| BP-17 | AUTO VOICE 2.0 | planned | RIR-300, RIR-803 | Join-to-create ownership/configuration, channel controls and restart/orphan reconciliation are pending. |
| BP-18 | STREAMER PLATFORM SYSTEM | planned | RIR-300, RIR-803 | Implement only verified platform capabilities; initial required assessments are Twitch, TikTok and Facebook, not a silent YouTube substitution. |
| BP-19 | STREAM SUBSCRIPTION MODEL | planned | RIR-300, RIR-803 | Persist guild/user/streamer subscriptions and idempotent delivery intent; reconcile crashes between external sends and database commits. |
| BP-20 | STREAM THUMBNAIL CACHE | planned | RIR-300, RIR-803 | Validate, hash, cache and reupload stream thumbnails; configurable lifecycle and safe remote downloads are pending. |
| BP-21 | FREE GAMES ANNOUNCER 2.0 | planned | RIR-300, RIR-803 | Promotion adapters, repeated-post suppression, targets/filters and cached/reuploaded assets are pending. |
| BP-22 | WAIFU TCG — MAJOR NEW SYSTEM | planned | RIR-500, RIR-804 | TCG is unimplemented; the complete collection, game, quest and social requirements remain mandatory scope. |
| BP-23 | WAIFU IMAGE INGESTION PIPELINE | planned | RIR-500, RIR-804 | waifu.im ingestion/cache and provenance, refresh, safe image handling and local-first reuse are pending. |
| BP-24 | WAIFU CARD CREDITS | planned | RIR-500, RIR-804 | Persist attribution and render Image source: waifu.im in card footer and response/help, including cached images. |
| BP-25 | CARD RARITIES | planned | RIR-500, RIR-804 | Define a balanced configurable rarity/stat model and deterministic tests; the example tier names/probabilities are not silently fixed final balance. |
| BP-26 | CARD ELEMENTS | planned | RIR-500, RIR-804 | Implement a configurable elemental interaction chart and extension path; blueprint examples are not a mandated hardcoded chart. |
| BP-27 | WAIFU DROP SYSTEM | planned | RIR-500, RIR-804 | Drops/claim cooldowns, spawn rarity, concurrency, claim authorization and persistence are pending. |
| BP-28 | WAIFU CARD GAME MODES | planned | RIR-500, RIR-804 | Training, battles, expeditions, dungeons, bosses, raids and quest/reward loops need bounded designs and tested state machines. |
| BP-29 | CARD COLLECTION | planned | RIR-500, RIR-804 | Persistent inventory, filters, paging, sorting, card details, favorites/equipment and collection progress are pending. |
| BP-30 | CARD TRADING | planned | RIR-500, RIR-804 | Transactional two-party trade proposal/accept/cancel/expiry, locks and history are pending. |
| BP-31 | CARD MARKET | planned | RIR-500, RIR-804 | Listings, purchases, pricing/fees, auctions where justified and transactional ownership/ledger changes are pending. |
| BP-32 | ECONOMY 2.0 | planned | RIR-400, RIR-804 | Central transactional global/guild economy and currency/account services are pending; preserve legacy global balances without multiplying wallets. |
| BP-33 | ECONOMY EVENT ENGINE | planned | RIR-400, RIR-804 | Typed reward events and centrally configured economy/XP awards are pending. |
| BP-34 | ANTI-SPAM REWARD PROTECTION | planned | RIR-400, RIR-804 | Repeated-content, burst and automated-message reward suppression need deterministic anti-spam tests before awards. |
| BP-35 | VOICE XP / ECONOMY | planned | RIR-400, RIR-804 | Voice participation tracking, anti-AFK eligibility and restart-safe XP/economy awards are pending. |
| BP-36 | BANK SYSTEM | planned | RIR-400, RIR-804 | Bank accounts, deposits/withdrawals, interest and exploit prevention are pending. |
| BP-37 | GAMES | planned | RIR-400, RIR-804 | Game interface, Tic-Tac-Toe, RPS, HighLow, CoinFlip, Dice, statistics and safe wagering are pending. |
| BP-38 | RANKING 2.0 | planned | RIR-400, RIR-804 | Global and per-guild leaderboards with pagination, snapshots/cache and privacy choices are pending. |
| BP-39 | PROFILE CARD 2.0 | planned | RIR-400, RIR-804 | Profile/rank card rendering, safe background downloads/cache and customization are pending. |
| BP-40 | ECONOMY + TCG INTEGRATION | planned | RIR-400, RIR-804 | Card rewards, shop/crafting/upgrades and economy transactions must share checked services; integration is pending. |
| BP-41 | GUILD SYSTEM FOR WAIFU TCG | planned | RIR-500, RIR-804 | Player WaifuGuild membership, permissions, bank, XP, quests/bosses and leaderboard remain distinct from Discord guilds. |
| BP-42 | DASHBOARD | planned | RIR-600, RIR-805 | No web application exists. Implement Discord OAuth, secure sessions and fresh guild administration checks. |
| BP-43 | DASHBOARD MODULE CONFIGURATION | partial | RIR-600, RIR-805 | Core settings already share validation across CLI/runtime; web forms and remaining module schemas are pending. |
| BP-44 | DASHBOARD FEATURES TO ADD | planned | RIR-600, RIR-805 | Dashboard audit/health/usage, permissions, presets, maintenance and backup/import views are pending; do not expose secrets. |
| BP-45 | PROVIDER CONFIGURATION | planned | RIR-300, RIR-803 | Provider-neutral design exists; no production AI/image/music/stream/free-game adapter is implemented. |
| BP-46 | SECRETS | partial | RIR-300, RIR-803, RIR-805 | Foundation credentials use validated environment configuration and log redaction; encrypted editable provider secrets and masked web controls are pending. |
| BP-47 | DATABASE | partial | RIR-100, RIR-802 | Separate Drizzle dialect schemas and transactional settings/audit repositories exist; add domain tables only with their services. |
| BP-48 | MIGRATION STRATEGY | partial | RIR-710, RIR-802 | Source field mapping and backup/rollback strategy exist; the actual legacy importer, dry-run/apply/verify/rollback CLI and representative-data rehearsal are pending. |
| BP-49 | EVENT-DRIVEN INTERNAL DESIGN | planned | RIR-100, RIR-801 | Gateway events are handled; shared typed domain events and consumers are pending until the corresponding services exist. |
| BP-50 | SCHEDULING / JOBS | planned | RIR-100, RIR-801 | Persistent jobs, leases, retries, deduplication and restart recovery are not implemented. |
| BP-51 | CACHING | partial | RIR-100, RIR-801 | Settings use a bounded memory cache; shared provider/media caching and lifecycle/retention are pending. |
| BP-52 | LOGGING | partial | RIR-100, RIR-801 | Pino logging and credential redaction exist; per-subsystem operation/duration/correlation fields and future provider instrumentation remain incomplete. |
| BP-53 | ERROR HANDLING | partial | RIR-100, RIR-801 | Gateway/dispatcher error boundaries and bounded health probes exist; provider retries/backoff/fallback/circuit behavior is pending. |
| BP-54 | SECURITY | partial | RIR-700, RIR-806, RIR-805, RIR-803 | Foundation input/permission/generator controls are tested; OAuth/CSRF/SSRF/webhooks and all economy/TCG/provider boundaries still need review and tests. |
| BP-55 | TESTING | partial | RIR-700, RIR-806 | Foundation unit/database/CLI tests exist; critical new-domain and dashboard suites remain pending. |
| BP-56 | QUALITY GATES | partial | RIR-700, RIR-806 | Lint/typecheck/unit/integration/E2E/build scripts and CI definitions exist; real remote CI/container evidence must accompany publication. |
| BP-57 | OBSERVABILITY | partial | RIR-700, RIR-806 | Liveness/readiness, gateway/database probes and CLI diagnostics exist; provider/job health, metrics and dashboard surfacing are pending. |
| BP-58 | RATE LIMITS | partial | RIR-700, RIR-806, RIR-803, RIR-804 | Command cooldowns exist; user/guild/channel/provider/AI/image/economy/claim/market rate limiting remains incomplete. |
| BP-59 | CONFIGURATION HIERARCHY | partial | RIR-100, RIR-801 | Environment/default and guild settings validation exist; per-user/provider/dashboard overrides and full precedence coverage are pending. |
| BP-60 | ANALYTICS | planned | RIR-300, RIR-803 | Aggregate command/domain usage metrics and configurable privacy-preserving retention are pending. |
| BP-61 | DATA RETENTION | planned | RIR-700, RIR-806, RIR-802, RIR-803 | Per-domain retention windows and administrator controls are pending; never infer that indefinite storage is acceptable. |
| BP-62 | FEATURE FLAGS | partial | RIR-100, RIR-801 | Registered command/module flags work; rollout flags for unimplemented systems are pending. |
| BP-63 | BACKWARD-COMPATIBLE USER EXPERIENCE | partial | RIR-200, RIR-801 | Only ping, prefix/setprefix and help are registered; all retained aliases/arguments/outputs need source-backed parity tests. |
| BP-64 | DEVELOPER DOCUMENTATION | documented | RIR-100, RIR-801, RIR-807 | Complete corpus review covers contracts, state, authority, failures, recovery and worked acceptance examples. Domain designs remain unimplemented; each later code scope must update its guide and evidence. |
| BP-65 | RELEASE VERSION | partial | RIR-700, RIR-801 | Workspace versions are 2.0.0 with documented SemVer/release rules; this is not a published or accepted full release. |
| BP-66 | IMPLEMENTATION ORDER | documented | RIR-100, RIR-801 | Roadmap and board preserve phased implementation order; do not skip acceptance gates or cross story/epic checkpoints automatically. |
| BP-67 | ADRs | documented | RIR-100, RIR-801, RIR-807 | All 13 ADRs reviewed with current/proposed boundaries, alternatives, consequences, validation and revisit criteria; proposed decisions still need implementation evidence. |
| BP-68 | DO NOT OVER-ENGINEER | documented | RIR-100, RIR-801 | Small explicitly composed workspaces are used; optional infrastructure remains unjustified until measured need. |
| BP-69 | DEPLOYMENT | partial | RIR-003, RIR-806 | Docker/Compose definitions exist and configuration was validated; live image execution/deployment remains a tracked RIR-003 gate. |
| BP-70 | CLI | partial | RIR-100, RIR-801 | Operator diagnostics, migrations, metadata, config and command generation work; backup/restore, legacy import and provider/cache operators remain pending. |
| BP-71 | RIRIKO DOCTOR | partial | RIR-100, RIR-801 | Doctor probes Node/config/storage/database/migrations/audio and distinguishes configured from live-verified credentials; provider-specific checks and full storage/tool diagnostics are pending. |
| BP-72 | DASHBOARD-TO-CLI PARITY | partial | RIR-600, RIR-805 | CLI uses shared settings services; dashboard parity cannot be claimed before the web application exists. |
| BP-73 | DISCORD PERMISSIONS | partial | RIR-200, RIR-801 | Central member/bot/role/module/channel checks exist; target hierarchy checks need integration with future privileged target commands. |
| BP-74 | AI + DISCORD SECURITY | planned | RIR-300, RIR-803 | AI permission boundaries are specified; no AI tool execution adapter exists to verify them end to end. |
| BP-75 | MUSIC + AI SECURITY | planned | RIR-300, RIR-803 | Safe music tools and service-level volume/voice constraints are pending with the music/AI services. |
| BP-76 | ECONOMY SECURITY | planned | RIR-400, RIR-804 | Atomic ledger/account/idempotency and exploit tests are pending; in-memory balances are not an acceptable implementation. |
| BP-77 | TCG SECURITY | planned | RIR-500, RIR-804 | Card ownership state constraints, locking and transaction/idempotency tests are pending. |
| BP-78 | IMAGE STORAGE SECURITY | planned | RIR-500, RIR-804 | Remote image URL/DNS/redirect/size/content/dimension validation and a bounded processor are pending before image features. |
| BP-79 | CURRENT WEB RESEARCH | partial | RIR-300, RIR-801 | Foundation dependency evidence is recorded; provider availability, pricing, retention, permissions and licensing must be freshly researched per implementation. |
| BP-80 | THIRD-PARTY API FALLBACKS | planned | RIR-300, RIR-803 | Real configured primary/fallback/disabled providers and failure tests are pending; no fake fallback is registered. |
| BP-81 | PROVIDER CAPABILITIES | planned | RIR-300, RIR-803 | Provider capability design exists; actual discovery and UI suppression of unsupported actions are pending. |
| BP-82 | USER-FACING UX | partial | RIR-200, RIR-801 | Shared embeds/help controls and safe errors exist; coherent presentation and confirmations for future modules remain pending. |
| BP-83 | FEATURE DISCOVERY | partial | RIR-600, RIR-805 | Help/CLI derive registered metadata; dashboard availability and remaining module discovery are pending. |
| BP-84 | MORE MODULES TO CONSIDER | planned | RIR-300, RIR-803 | Optional module ideas remain evaluation backlog and must not displace the core release; none is implicitly approved for implementation. |
| BP-85 | MIGRATION PHILOSOPHY | partial | RIR-710, RIR-802 | Legacy source manifests and preservation/mapping strategy exist; real import and verified restore of representative user data are pending. |
| BP-86 | FINAL ACCEPTANCE CRITERIA | partial | RIR-700, RIR-806 | The exact 35 acceptance criteria below remain the release gate; a passing foundation suite is not release completion. |
| BP-87 | HOW YOU SHOULD WORK AS THE MAIN AGENT | documented | RIR-110 | Standing inspect/estimate/delegate/review/test/handoff workflow exists; this story follows one active ticket and one delivery checkpoint. |
| BP-88 | WHEN SOMETHING IS UNCLEAR | documented | RIR-110 | Routine choices use documented engineering judgment; explicit user scope/PR decisions override broad autonomy. |
| BP-89 | FIRST DELIVERABLE | documented | RIR-100, RIR-802, RIR-807 | Audit/architecture/migration/dependency/roadmap/ADR/agent artifacts and summary exist; foundation implementation began, full platform remains incomplete. |
| BP-90 | QUALITY BAR | documented | RIR-110 | Quality rules are documented and foundation has verification; future contributors still need complete modules, provider tests and deployment evidence. |

## Final acceptance checklist (35)

0 implemented · 2 documented · 11 partial · 22 planned

| ID | Original acceptance criterion | Status | Owning backlog scope | Remaining work / evidence boundary |
|---|---|---|---|---|
| AC-01 | all significant 1.4.0 features have been inventoried; | documented | RIR-100, RIR-802 | Source audit inventories 141 commands, 17 tables and assets at the pinned legacy SHA; it does not certify runtime parity or production data. |
| AC-02 | all retained features work; | partial | RIR-200, RIR-801 | Only ping, prefix/setprefix and help are registered; all retained aliases/arguments/outputs need source-backed parity tests. |
| AC-03 | migrations are tested; | partial | RIR-710, RIR-802 | Source field mapping and backup/rollback strategy exist; the actual legacy importer, dry-run/apply/verify/rollback CLI and representative-data rehearsal are pending. |
| AC-04 | slash commands work; | partial | RIR-200, RIR-801 | Shared slash/prefix registry, aliases, permissions, settings and cooldowns work for ping/prefix/help; remaining legacy commands and all rate-limit dimensions are pending. |
| AC-05 | prefix commands work; | partial | RIR-200, RIR-801 | Shared slash/prefix registry, aliases, permissions, settings and cooldowns work for ping/prefix/help; remaining legacy commands and all rate-limit dimensions are pending. |
| AC-06 | help is dynamic; | partial | RIR-200, RIR-801 | Metadata-driven search, categories, paging and requester-bound controls work for registered commands; dashboard links and full catalog await those features. |
| AC-07 | dashboard authentication works; | planned | RIR-600, RIR-805 | No web application exists. Implement Discord OAuth, secure sessions and fresh guild administration checks. |
| AC-08 | guild administration detection works; | planned | RIR-600, RIR-805 | No web application exists. Implement Discord OAuth, secure sessions and fresh guild administration checks. |
| AC-09 | configuration works from dashboard; | partial | RIR-600, RIR-805 | Core settings already share validation across CLI/runtime; web forms and remaining module schemas are pending. |
| AC-10 | configuration works from CLI; | partial | RIR-100, RIR-801 | Operator diagnostics, migrations, metadata, config and command generation work; backup/restore, legacy import and provider/cache operators remain pending. |
| AC-11 | music supports the required platforms; | planned | RIR-300, RIR-803 | No audio engine/resolver is implemented. Preserve required YouTube, Spotify, Deezer and SoundCloud plus safe AI controls and source capability checks. |
| AC-12 | AI supports dedicated-channel mode; | planned | RIR-300, RIR-803 | No AI adapter or conversation store exists. Implement dedicated opt-in channel, per-user context, preferences, personality separation, time tool and safe mediated tools. |
| AC-13 | AI context is isolated per user; | planned | RIR-300, RIR-803 | No AI adapter or conversation store exists. Implement dedicated opt-in channel, per-user context, preferences, personality separation, time tool and safe mediated tools. |
| AC-14 | AI can call safe tools; | planned | RIR-300, RIR-803 | AI permission boundaries are specified; no AI tool execution adapter exists to verify them end to end. |
| AC-15 | moderation escalation works; | planned | RIR-300, RIR-803 | Moderation commands, configurable warning escalation, audit history, AutoMod and anti-raid rules are pending. |
| AC-16 | spam does not grant EXP/credits; | planned | RIR-400, RIR-804 | Repeated-content, burst and automated-message reward suppression need deterministic anti-spam tests before awards. |
| AC-17 | image provider selection works; | planned | RIR-300, RIR-803 | Image adapters, actual free/paid capability assessment, guild/user settings, quotas and bounded persistent jobs are pending. |
| AC-18 | image job concurrency works; | planned | RIR-300, RIR-803 | Image adapters, actual free/paid capability assessment, guild/user settings, quotas and bounded persistent jobs are pending. |
| AC-19 | giveaways survive restart; | planned | RIR-300, RIR-803 | Database-backed entries, scheduling, eligibility, rerolls, winner history and restart recovery are pending. |
| AC-20 | auto voice survives restart; | planned | RIR-300, RIR-803 | Join-to-create ownership/configuration, channel controls and restart/orphan reconciliation are pending. |
| AC-21 | streamer announcements are idempotent; | planned | RIR-300, RIR-803 | Persist guild/user/streamer subscriptions and idempotent delivery intent; reconcile crashes between external sends and database commits. |
| AC-22 | stream assets are cached/reuploaded; | planned | RIR-300, RIR-803 | Validate, hash, cache and reupload stream thumbnails; configurable lifecycle and safe remote downloads are pending. |
| AC-23 | free games do not duplicate announcements; | planned | RIR-300, RIR-803 | Promotion adapters, repeated-post suppression, targets/filters and cached/reuploaded assets are pending. |
| AC-24 | economy transactions are safe; | planned | RIR-400, RIR-804 | Atomic ledger/account/idempotency and exploit tests are pending; in-memory balances are not an acceptable implementation. |
| AC-25 | ranking works globally and per guild; | planned | RIR-400, RIR-804 | Global and per-guild leaderboards with pagination, snapshots/cache and privacy choices are pending. |
| AC-26 | profile images can be cached; | planned | RIR-400, RIR-804 | Profile/rank card rendering, safe background downloads/cache and customization are pending. |
| AC-27 | TCG card ownership is transactional; | planned | RIR-500, RIR-804 | Card ownership state constraints, locking and transaction/idempotency tests are pending. |
| AC-28 | TCG collection/trading/market works; | planned | RIR-500, RIR-804 | Transactional two-party trade proposal/accept/cancel/expiry, locks and history are pending. |
| AC-29 | TCG images are cached; | planned | RIR-500, RIR-804 | waifu.im ingestion/cache and provenance, refresh, safe image handling and local-first reuse are pending. |
| AC-30 | image attribution is preserved; | planned | RIR-500, RIR-804 | Persist attribution and render Image source: waifu.im in card footer and response/help, including cached images. |
| AC-31 | tests cover critical domains; | partial | RIR-700, RIR-806 | Foundation unit/database/CLI tests exist; critical new-domain and dashboard suites remain pending. |
| AC-32 | Docker deployment works; | partial | RIR-003, RIR-806 | Docker/Compose definitions exist and configuration was validated; live image execution/deployment remains a tracked RIR-003 gate. |
| AC-33 | migrations work from a representative 1.4.0 database; | partial | RIR-710, RIR-802 | Source field mapping and backup/rollback strategy exist; the actual legacy importer, dry-run/apply/verify/rollback CLI and representative-data rehearsal are pending. |
| AC-34 | documentation is present; | documented | RIR-100, RIR-801, RIR-807 | All 40 original docs reviewed: 38 deepened/regenerated, two independently checked factual JSON manifests preserved; one new per-file review. Planned guides must become tested operating instructions as implementations land. |
| AC-35 | `ririko doctor` works. | partial | RIR-100, RIR-801 | Doctor probes Node/config/storage/database/migrations/audio and distinguishes configured from live-verified credentials; provider-specific checks and full storage/tool diagnostics are pending. |

Inspect the implementation/test/design file references and notes with `pnpm board requirements-show BP-11` (or an `AC-` ID). Run `pnpm board requirements-check` after changing requirements, evidence paths or the board. The manifest maps sections and the exact final checklist; detailed feature behavior still belongs to each requirement’s full blueprint text, source inventory and groomed ticket acceptance.
