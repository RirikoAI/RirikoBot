# Documentation review — RIR-800

All **40 original files in `docs/`** were reviewed in this epic: 38 were deepened or regenerated, and the two factual legacy JSON manifests were independently checked and preserved byte-for-byte. This new review makes the resulting corpus 41 files. Detailed plans remain plans: the runtime still exposes `ping`, `prefix` and `help`, and schema version 1 still manages only three tables.

## Comparison method and scope

The primary comparison pins Gemini at `1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33` and Astra integration at `801103c0e4c70eca6a380d7d1122b11234695bb1`. Each specialist read the corresponding actual files, relevant blueprint requirements and local implementation before writing. Later Gemini advancement to `a117c157024929a1e76ce799c71320f090d35189` was also inspected; [branch comparison](branch-comparison.md) separates that follow-up from historical findings. Its new workspace/CLI scaffold, one version test and corrected roadmap are acknowledged; no tests were executed on Gemini's checkout here.

The review measures concrete contracts, authority, data identity, concurrency, failure/recovery, worked examples and falsifiable acceptance appropriate to each file. It does not rank models by word count. Gemini's broad TCG proposal supplied useful breadth; this epic adds checked arithmetic, lifecycle and transaction boundaries while retaining that coverage. Summaries remain short navigation aids; ADRs explain tradeoffs and reversal conditions instead of duplicating every guide.

The [original blueprint](../BLUEPRINT.md) remains authoritative, together with later user workflow decisions. [The corpus plan](../.workboard/handoffs/RIR-800/002-corpus-plan.md) records estimates and sequential ownership. RIR-808 was the explicitly approved five-point prerequisite for fresh stack consent after a parent batch closes. No new bot feature or dependency upgrade is included.

## Every original file

“Added depth” describes this epic's reviewed result relative to the pinned proposals or, where no counterpart exists, the earlier Astra artifact. No counterpart means there is no like-for-like Gemini file to score. Verification limits are part of acceptance, not hidden footnotes.

| Original file | Added depth and comparison | Evidence boundary / owner |
|---|---|---|
| [architecture.md](architecture.md) | Actual package/import/process map, trusted actor and request traces, transactions, outbox/cache/module interactions and incremental boundaries beyond the package proposal. | Separates current interfaces from proposed services; RIR-801. |
| [architecture-summary.md](architecture-summary.md) | No same-path Gemini counterpart; concise implemented/planned decision map links architecture and ADR consequences. | Navigation does not assert platform completion; RIR-801. |
| [commands.md](commands.md) | Exact parser, alias, option, visibility and help behavior; slash/prefix differences, permission layers, component ownership and extension acceptance. | Three registered roots only; legacy inventory remains a migration contract; RIR-801. |
| [modules.md](modules.md) | Installed/enabled/configured/available/recovering distinctions, essential-core constraints, admission/drain/reconciliation lifecycle and dependency failure policy. | Future registry/job APIs explicitly proposed; RIR-801. |
| [development.md](development.md) | Verified commands, CLI/generator walkthroughs, package boundaries, errors and concrete new-command integration steps. | Does not invent generic CLI editors, generators or installed domain packages; RIR-801. |
| [contributing.md](contributing.md) | Requirement-to-ticket-to-change workflow, compatibility evidence, review checks, branch targets and durable returns. | User checkpoint and exact stack approval remain required; RIR-801. |
| [dependency-evaluation.md](dependency-evaluation.md) | Installed versus selected versus candidate versions, ownership, adoption gates, external capability caveats and reasons to revisit choices. | No dependency upgrades or provider access certification; RIR-801. |
| [implementation-roadmap.md](implementation-roadmap.md) | Acceptance and dependency gates replace an implied completed platform; preserves requested domain breadth with evidence and pending work. | Planning sequence is not a fixed delivery forecast; RIR-801. |
| [work-management.md](work-management.md) | No same-path counterpart; compared Gemini's kanban artifacts. Defines one slot, estimates, relations, worker returns, lock recovery and exact publication semantics. | Repository guardrails are not hosted branch protection; RIR-801/808. |
| [database.md](database.md) | Exact installed fields/checks/history, dual-dialect behavior and proposed domain key/index/constraint/transaction catalog; stable reward/subscriber identities reconciled. | Catalog is not installed DDL; no representative private database supplied; RIR-802/807. |
| [migrations.md](migrations.md) | Current migration recognition/locking limits, future version protocol, reconciliation, diagnostics and crash/rollback cases. | Object names/history do not prove full live DDL equivalence; RIR-802. |
| [migration-1.x-to-2.0.md](migration-1.x-to-2.0.md) | All legacy table mapping decisions, extraction manifest, canonical row checks, secret quarantine, resumable checkpoints and cutover/reversal gates. | No production importer or representative data rehearsal exists; RIR-802. |
| [legacy-feature-inventory.md](legacy-feature-inventory.md) | Traceable command/asset/entity/migration counts, manifest interpretation, source-versus-runtime distinctions and retained compatibility edge cases. | Corrects broad memory-only claims; source audit cannot certify every deployed behavior; RIR-802. |
| [legacy-command-manifest.json](legacy-command-manifest.json) | No counterpart; factual payload preserved. Rechecked unique names/paths, AST metadata, inherited flags, aliases, options and Git-source identity. | 141 commands, 191 assets; explanatory depth added to inventory rather than fabricated records; RIR-802. |
| [legacy-data-manifest.json](legacy-data-manifest.json) | No counterpart; factual payload preserved. Independently replayed static migration SQL and reconciled tables, columns, FK and index metadata. | 17 tables, 108 columns, 11 FK rows, seven index descriptors; declaration audit is not production-row proof; RIR-802. |
| [adapters.md](adapters.md) | Typed request/result/capability boundaries, accepted versus unknown outcomes, bounded retry/fallback, common durable jobs and image/stream/promotion lifecycles and delivery identity. | Required Deezer/Facebook/TikTok capabilities are not asserted available merely from an interface; RIR-803. |
| [ai.md](ai.md) | Scoped memory/generation/reset, provider data destinations, budgets, streaming outcomes, safe tool schema/authority and semantic operation receipts. | Public channels are not private; no chat runtime or live provider test; RIR-803. |
| [music.md](music.md) | Metadata versus playable source, all four required platforms, queue ownership/reconnect/cancellation, legacy commands/playlists and AI mediation. | Source availability and playback remain unverified; RIR-803. |
| [moderation.md](moderation.md) | Durable action/case/attempt/warning state, hierarchy checks, ambiguous and partial effects, escalation episode races and lock restoration. | Audit intent does not prove Discord effect; RIR-803/807. |
| [economy.md](economy.md) | Global COIN/karma compatibility; conserved postings, holds and escrow examples; reward identity, abuse windows, bank/daily/XP/rank/game rules. | Candidate numbers require simulation; no double-entry service or production race proof; RIR-804. |
| [waifu-tcg.md](waifu-tcg.md) | Full rarity/element chart, ordered battle replay, four floor curves, ingestion/credits, equipment/perks, consumables, energy, quests, markets, factions and seasons. | Exact arithmetic is checked; balance, content access and runtime remain open; RIR-804. |
| [dashboard.md](dashboard.md) | OAuth/session/CSRF/authority lifecycle, per-module workflows and forms, revision conflicts, accessible states, secure previews and secret administration. | `apps/web` absent; expected browser revision is a service prerequisite; RIR-805. |
| [deployment.md](deployment.md) | Actual image/Compose/CLI behavior, readiness/shutdown limits, isolated backup/restore, rollout, rollback and incident runbooks. | No local Docker run, operator cutover or restore rehearsal; RIR-806/807. |
| [testing.md](testing.md) | Exact test inventories and run provenance; independent-driver/fixture limits; domain failure-injection matrix and realistic acceptance gates. | Historical PostgreSQL evidence distinguished from current skipped cases; RIR-806. |
| [requirements.json](requirements.json) | No counterpart; maps all 91 sections and 35 exact criteria to specific guide evidence, owning implementation scopes, documentation tickets and remaining gaps. | Statuses unchanged by prose expansion; evidence references do not run tests; RIR-807. |
| [requirements.md](requirements.md) | No counterpart; regenerated checked ledger retains exact original titles, explicit gaps and per-requirement evidence navigation. | Must match JSON/tool output; never independently edited; RIR-807. |
| [branch-comparison.md](branch-comparison.md) | No counterpart; pinned fair source comparison plus later local improvements, fresh Gemini changes, publication history and measurable future criteria. | Separates inspected code, historical tests and current verification; RIR-807. |
| [ADR-001](adr/ADR-001-runtime-and-monorepo-toolchain.md) | Runtime/toolchain alternatives, actual references, supported environment and adoption/reversal criteria. | Selected versions versus installed versions remain explicit; RIR-801. |
| [ADR-002](adr/ADR-002-discord-framework-and-interaction-routing.md) | Framework-independent contracts, ingress-to-dispatch sequence, transport parity, reply/error and registration consequences. | Router foundation does not implement the audited legacy catalog; RIR-801. |
| [ADR-003](adr/ADR-003-database-layer-and-dual-dialect-orm.md) | Driver/ORM/SQL authority, null/JSON/integer/concurrency differences, transaction boundaries and future migration gates. | Dual support does not erase dialect-specific proof obligations; RIR-802. |
| [ADR-004](adr/ADR-004-audio-and-music-engine.md) | Engine alternatives and source separation, voice/session ownership, recovery and capability acceptance. | No library choice proves authenticated playback; RIR-803. |
| [ADR-005](adr/ADR-005-ai-chatbot-and-tool-calling-architecture.md) | Provider-neutral orchestration, memory isolation, tool authority, budgets and refused/uncertain fallback decisions. | Prompt instructions are not an authorization boundary; RIR-803. |
| [ADR-006](adr/ADR-006-image-generation-and-canvas-synthesis.md) | Paid-job ambiguity, quota/cancellation, provider images versus deterministic canvas, cache/asset validation and retention. | No unlimited free tier or successful generation claimed; RIR-803. |
| [ADR-007](adr/ADR-007-stream-platform-notification-architecture.md) | Independent subscriber/target identity, webhook/poll overlap, durable delivery attempts, unknown outcomes and cache provenance. | Unique intent cannot guarantee exactly-once external delivery; RIR-803. |
| [ADR-008](adr/ADR-008-web-dashboard-architecture.md) | Shared services and browser-specific trust boundary, session/CSRF/cache authority, stale forms and operational alternatives. | Local CLI identity cannot authenticate a browser user; RIR-805. |
| [ADR-009](adr/ADR-009-centralized-transactional-economy-engine.md) | Ledger alternatives, conservation and issuance, transaction receipts, hold-to-escrow lifecycle and version-independent reward identity. | Schema consistency is distinct from economic balance; RIR-804/807. |
| [ADR-010](adr/ADR-010-waifu-tcg-pipeline-and-game-design.md) | Versioned content/ownership, reproducible combat, links to checked curve arithmetic, energy overflow/reset and balance-validation gates. | Completes proposal breadth without calling candidates accepted game balance; RIR-804. |
| [ADR-011](adr/ADR-011-secrets-management-and-credential-security.md) | Exact AES-GCM envelope/AAD, key material and rotation/CAS recovery, authority, redaction and backup-key obligations. | No vault implemented, keys read or credentials rotated; RIR-805. |
| [ADR-012](adr/ADR-012-job-scheduler-and-task-queue.md) | Job admission/leases/fences, outbox/delivery reconciliation, module draining, retries/dead letters and storage alternatives. | A lease cannot retract an already submitted external call; RIR-803. |
| [ADR-013](adr/ADR-013-configuration-permissions-and-concurrency.md) | No counterpart; actual settings CAS/cache behavior, permission precedence, stale browser intention and recovery limits. | Repository CAS alone does not enforce caller-displayed revision; RIR-801. |

## Reconciled contracts

The final pass resolved contradictions that would otherwise produce incompatible implementations:

- Economy uses one global legacy currency realm; a player-guild treasury is another owner in that realm. Rule version is evidence, not a new reward identity. Daily rewards use rolling 24-hour eligibility/36-hour continuity; TCG Devotion consumes that same claim streak, while energy and calendar quests use their own UTC periods.
- Both accepted wager stakes are captured into escrow. Pre-admission cancellation releases holds; post-admission settlement pays or refunds escrow. It cannot both release a hold and refund money already captured.
- Energy separates regular E and bonus B, preserves excess across cap reductions, resets at most once per UTC date and does not refill on same-day reads or level changes. Capacity-only level normalization leaves displayed XP level zero intact.
- Equipment ownership/reservation is promoted from equipped to battle/expedition and restored only for the matching generation. Independent simultaneous locks would conflict with the proposed ownership model.
- Stream membership records who requested a subscription; announcement identity remains event/guild/target so multiple subscribers do not duplicate delivery.
- Moderation uses one catalog vocabulary for cases, action attempts, warnings and immutable warning events. Private evidence, notifications and original channel-lock state have separate lifecycles.
- AI provider call IDs are attempt evidence; application operation identity detects repeated semantic actions. A streaming failure with unknown submission outcome maps to the shared unknown result, preventing blind resubmission.
- Dashboard configuration needs an explicit caller-displayed revision contract before browser writes; current fresh-read CAS and cache invalidation are not immediate revocation or stale-form protection.

## Verification and limits

The source manifests and blueprint retain their original SHA-256 values:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| BLUEPRINT.md | 54,943 | `5261a43d6522deccc8a9fe686f700a76867b0aa4a0f3eadb7a22cfb8eb6424c2` |
| legacy-command-manifest.json | 387,790 | `8465eccc3fd33c428c3a4b5bed9454ddcd5f45f0347f13652ab7c14272bed779` |
| legacy-data-manifest.json | 38,918 | `03391bf263fd7f247ce52ce17aa341acdbb6ce826081cfe42bd807606e1f5440` |

The data review independently replayed 85 static SQL statements in disposable in-memory SQLite and reconciled the manifest. It did not execute TypeORM/application startup or import private rows. The command review checked 141 command sources and their metadata against the pinned legacy source. [RIR-802 evidence](../.workboard/handoffs/RIR-802/005-manifest-return.md) records the precise method and normalization limits.

Current runtime verification is **119 unit cases passed** after the prerequisite, then fresh lint, strict typecheck, build and **13 SQLite/CLI cases passed with seven PostgreSQL cases skipped** during RIR-806. See [testing](testing.md) for commands, environments, timings and historical separation. Documentation arithmetic checks include rarity normalization, battle/floor examples and 27,621 energy-state cases; those are design checks, not implemented TCG tests. No live provider, Discord, browser, container, production restore or new remote CI success is claimed.

The final review checks all local links and referenced source objects, generated requirement freshness, board invariants and diff hygiene. External references were inspected during domain research; the final local-link pass is not a new live crawl of every external URL. Specialist returns and exact final counts are persisted with RIR-807. No full-suite rerun is inferred from each documentation edit.

## Decisions before implementation and delivery

Unresolved choices remain explicit in the owning guides: provider account access/terms and measured reliability; retention windows and operator restore evidence; caller-revision and authorization service extensions; representative legacy data; gameplay balance simulations and playtesting; production transaction contention; browser/session implementation; actual release budgets/SLOs. Groom those as new scopes after this epic's checkpoint. Documentation acceptance does not authorize their implementation.

RIR-800 contains seven documentation leaves plus the approved prerequisite: 76 leaf points (71 documentation, five prerequisite). The epic's 89-point planning estimate is not added to those points. Each leaf was estimated before execution; one ticket held the board slot and all workers assisted that ticket through recorded assignments/returns.

The branch preserves PR #557's exact head `a04753a473c8a807892848052cc248cff3695805` and its local publication receipt. A fresh GitHub inspection found #557 was subsequently squash-merged into the governance branch at `7f0fd9ae589ec140adc4ab7f01ec63299ac4a42b`; Astra integration remains unchanged. The approved exact parent topic remains available. This does not authorize silently retargeting to the squash commit or integration branch. Finish this epic at its reviewed publication checkpoint, ask the user about the concrete PR, and start no other story or epic automatically.
