# RIR-800 — documentation corpus review plan

User explicitly approved one stacked documentation epic and then its five-point RIR-808 prerequisite/bootstrap repair. The prior PR #557 and all remote branches are preserved. Gemini baseline: `1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33`. Initial corpus: **40 files**, including **13 ADRs**, two immutable source manifests and one generated requirement manifest/ledger pair. No depth claim is based on word count alone.

## Sequential ownership and depth criteria

| Ticket | Points | Files / purpose | Required additional depth |
|---|---:|---|---|
| RIR-808 | 5 | Minimal prerequisite in workboard types/model/Git and workflow guidance | Distinct fresh stack consent after published parent closure, safe mutation flow and regression evidence; not the separate RIR-005 integration fix |
| RIR-801 | 13 | architecture, summary, development, contributing, commands, modules, dependencies, roadmap, work-management; ADR-001/002/013 | Actual package/contract map; end-to-end request sequences; implemented versus planned command APIs; permission/config conflict examples; full module lifecycle and shared job interactions; extension walkthroughs; decision alternatives and reversal criteria |
| RIR-802 | 8 | database, migrations, 1.x migration, legacy inventory/manifests; ADR-003 | Field/constraint/index/transaction catalog by domain; dual-dialect edge cases; migration checkpoints, reconciliation, crash recovery and rollback; preserve all verified source facts and explain both JSON manifest formats |
| RIR-803 | 13 | adapters, AI, music, moderation; ADR-004/005/006/007/012 | Request/result/error contracts; bounded retries, quotas, cancellation and ambiguous delivery; source capability matrix including Deezer/Facebook; image job/cache security; AI isolation/tool mediation; moderation actions and state transitions |
| RIR-804 | 13 | economy, TCG; ADR-009/010 | Worked conserved ledger flows and reward abuse cases; detailed ingestion/catalog/ownership; complete battle order/formulas/replays; rarity/element candidates; equipment, consumables, energy, seasons/floors, loot/achievements and guilds; transaction boundaries, admin policy and deterministic acceptance |
| RIR-805 | 8 | dashboard; ADR-008/011 | OAuth/session/CSRF authorization lifecycle; route and per-module form/validation catalog; error/conflict/empty/loading flows; accessible navigation; secret envelope/rotation/recovery and redaction tests |
| RIR-806 | 8 | deployment, testing | Verified commands separated from planned operations; backup/restore and incident runbooks; readiness/limits/rollout criteria; domain failure-injection matrix, fixture design and reproducible evidence |
| RIR-807 | 8 | requirements JSON/Markdown, comparison, new documentation-review | Review every original file, check links/source/JSON integrity and cross-document contracts; update evidence without claiming feature implementation; provide per-file comparison and unresolved decision map |

Parent RIR-800 is an 89-point planning estimate; leaves total 76 points. Do not count parent points again. Each leaf remains <=13 and only one may be in-progress/review/blocked. Dependencies order the original seven documentation leaves; coordinator explicitly finishes RIR-808 before RIR-801. Do not start another epic or execute product features.

## Writing and evidence contract

Read each assigned local document and its actual Gemini counterpart via `git show BASE:path`, plus relevant blueprint sections and code. Main documents carry detailed runnable/current guidance or explicit future service designs; ADRs explain concrete tradeoffs, rejected options, consequences, validation and conditions for revisiting, linking to the main contract rather than duplicating every rule. A short summary stays a useful navigational decision map while gaining evidence and operational implications.

Use illustrative TypeScript/SQL as explicitly proposed contracts when no implementation exists; do not invent paths or callable CLI/API endpoints. Prefer stable domain terms across files: Discord guild versus player guild, global legacy coins/karma versus new guild projections, provider job versus application delivery, source metadata versus playable audio, durable job acceptance versus external confirmation. Proposed defaults need labels, limits and a reason; game balance is a candidate needing simulation/playtesting, not an accepted performance fact.

Use official primary sources for external API/framework claims; verify current availability instead of copying Gemini's confidence. Do not update installed packages or claim provider/free-tier availability from an interface. Keep secret values and raw private prompts out of docs. Preserve blueprint bytes and legacy-source hashes. Review JSON manifests as source artifacts and deepen their explanatory contracts, never fabricate entries merely to make them longer. Requirements Markdown must be regenerated from its manifest/tool, not edited independently.

Each specialist gets a recorded same-ticket assignment with disjoint paths, acknowledges boundaries and returns source/comparison findings, changed files, exact checks, remaining decisions and next steps. Persist/accept every return before transition. The coordinator reconciles cross-file terminology and final evidence. Local epic commits are permitted to preserve progress; publication requires the final single-epic PR checkpoint.
