# Ririko work board

Generated from state.json · revision 81 · execution limit **1**.

**Current work:** No occupied ticket.
**Delivery:** BATCH-003 / RIR-800 / `feat/RIR-800-documentation-depth` → `develop/2.0.0-astra` (open)

Read [the standing protocol](PROTOCOL.md) and the current handoff before working. A new task while the slot is occupied requires the user’s pause/abandon decision. A new delivery scope requires the PR checkpoint decision.

**Approved stack:** parent BATCH-002 at `a04753a473c8a807892848052cc248cff3695805`, decision D-003. Run `pnpm board pr-plan` to resolve the immediate PR target; never assume the integration target excludes parent changes.

## ready

| ID | Type | Outcome | Points | Parent | Requires | Blocks | Delivery scope |
|---|---|---|---:|---|---|---|---|
| RIR-100 | epic | Delivery governance and foundation validation | 13 | — | — | — | RIR-100 |
| RIR-200 | epic | Legacy compatibility | 34 | — | — | — | RIR-200 |
| RIR-210 | story | General and guild information command parity | 8 | RIR-200 | RIR-001 | RIR-230, RIR-231 | RIR-210 |
| RIR-211 | task | Port get-avatar with slash and prefix parity | 3 | RIR-210 | RIR-001 | RIR-212 | RIR-210 |
| RIR-212 | task | Port guildinfo and memberinfo through shared adapters | 5 | RIR-210 | RIR-211 | — | RIR-210 |
| RIR-230 | story | Meme rendering and usable prefix commands | 13 | RIR-200 | RIR-210 | — | RIR-230 |
| RIR-231 | bug | Repair the eleven broken legacy meme prefix paths | 8 | RIR-230 | RIR-210 | — | RIR-231 |
| RIR-800 | epic | Implementation-ready documentation across every docs file | 89 | — | RIR-110 | — | RIR-800 |
| RIR-803 | task | Specify provider, AI, music, moderation and durable delivery behavior | 13 | RIR-800 | RIR-802 | RIR-804 | RIR-800 |
| RIR-804 | task | Specify economy and complete TCG progression and transactional rules | 13 | RIR-800 | RIR-803 | RIR-805 | RIR-800 |
| RIR-805 | task | Specify dashboard workflows, authorization and credential lifecycle | 8 | RIR-800 | RIR-804 | RIR-806 | RIR-800 |
| RIR-806 | task | Deepen deployment, incident recovery and acceptance test strategy | 8 | RIR-800 | RIR-805 | RIR-807 | RIR-800 |
| RIR-807 | task | Reconcile every document, requirement and comparison with evidence | 8 | RIR-800 | RIR-806 | — | RIR-800 |

## backlog

| ID | Type | Outcome | Points | Parent | Requires | Blocks | Delivery scope |
|---|---|---|---:|---|---|---|---|
| RIR-003 | chore | Validate the production Docker image and startup | 5 | RIR-100 | RIR-001 | — | RIR-003 |
| RIR-300 | epic | Rewritten provider and durable systems | Ungroomed | — | — | — | RIR-300 |
| RIR-310 | story | Music, AI, images, moderation, reminders and notifications | Ungroomed | RIR-300 | RIR-001 | — | RIR-310 |
| RIR-400 | epic | Economy, XP, rankings and games | Ungroomed | — | — | — | RIR-400 |
| RIR-410 | story | Transactional rewards and anti-spam foundations | Ungroomed | RIR-400 | RIR-001 | — | RIR-410 |
| RIR-500 | epic | Waifu trading card game | Ungroomed | — | — | — | RIR-500 |
| RIR-510 | story | Attribution-preserving ingestion and transactional ownership | Ungroomed | RIR-500 | RIR-001 | — | RIR-510 |
| RIR-600 | epic | Guild administration dashboard | Ungroomed | — | — | — | RIR-600 |
| RIR-610 | story | Discord OAuth and shared configuration controls | Ungroomed | RIR-600 | RIR-001 | — | RIR-610 |
| RIR-700 | epic | Legacy migration and release | Ungroomed | — | — | — | RIR-700 |
| RIR-710 | story | Representative-data import, restore rehearsal and rollout | Ungroomed | RIR-700 | RIR-001 | — | RIR-710 |
| RIR-004 | chore | Remove historically tracked generated dependency launchers | 3 | RIR-100 | RIR-001 | — | RIR-004 |
| RIR-005 | bug | Resolve deferred parent PR validation without rewriting preserved work | Ungroomed | RIR-100 | RIR-110 | — | RIR-005 |

## done

| ID | Type | Outcome | Points | Parent | Requires | Blocks | Delivery scope |
|---|---|---|---:|---|---|---|---|
| RIR-001 | chore | Establish work board, agent handoffs and safe Git delivery | 8 | RIR-100 | — | RIR-003, RIR-210, RIR-211, RIR-310, RIR-410, RIR-510, RIR-610, RIR-710, RIR-004, RIR-110 | RIR-001 |
| RIR-110 | story | Trace release reviews to the blueprint and exact branch changes | 13 | RIR-100 | RIR-001 | RIR-005, RIR-800, RIR-801, RIR-808 | RIR-110 |
| RIR-801 | task | Specify architecture, developer workflows and command contracts | 13 | RIR-800 | RIR-110 | RIR-802 | RIR-800 |
| RIR-802 | task | Deepen data contracts, legacy evidence and migration recovery | 8 | RIR-800 | RIR-801 | RIR-803 | RIR-800 |
| RIR-808 | task | Support fresh stack consent after a published parent closes | 5 | RIR-800 | RIR-110 | — | RIR-800 |

## Agent assignments

| Assignment | Ticket | Agent | Status | Scope |
|---|---|---|---|---|
| A-001 | RIR-001 | workflow-engine | accepted | Implement and test the pure board validator/state transition engine against tools/workboard/types.ts and the standing protocol. Return evidence and design decisions; no Git or status changes. |
| A-002 | RIR-110 | delivery-guard | accepted | Implement and test explicit approved-stack resolution and Git guards against the coordinator types contract. Own git.ts and git-store.test.ts only; no board or Git publication mutations; return exact evidence. |
| A-003 | RIR-110 | delivery-guard | accepted | Finish safe deferred-parent publication from the current child checkpoint: separate parent approval/head/base/scope, no worktree switch, no mixing or bypass of shared board. Own git.ts and git-store.test.ts only; return tested evidence. |
| A-004 | RIR-808 | delivery-guard | accepted | Add a real Git/store regression for a fresh kind=stack decision after an existing parent PR is recorded and closed; retain exact published refs and reject use as parent publication. Own only git-store.test.ts; return evidence, no board/Git workspace mutations. |
| A-005 | RIR-801 | architecture-docs | accepted | Deepen system topology, request/state/security/config contracts and concrete decision tradeoffs against actual source and pinned Gemini; no other files |
| A-006 | RIR-801 | discord-docs | accepted | Deepen actual and planned command/help/module contracts, compatibility, lifecycle, failure and acceptance scenarios beyond Gemini; no other files |
| A-007 | RIR-801 | developer-docs | accepted | Deepen reproducible developer/operator extension workflows and contribution/delivery/handoff recovery, grounded in actual CLI and protocol; no other files |
| A-008 | RIR-802 | architecture-docs | accepted | Deepen actual and proposed data models, dialect/transaction/constraint contracts and ADR alternatives against source and Gemini; documentation only. |
| A-009 | RIR-802 | developer-docs | accepted | Deepen current schema migration and planned legacy importer operations, mapping/reconciliation/crash recovery/restore against source and Gemini; documentation only. |
| A-010 | RIR-802 | discord-docs | accepted | Read-only full audit of both legacy JSON manifests, verify every referenced source/asset/migration hash and structural totals against immutable source; return evidence, preserve both JSON files unless coordinator reviews a proven correction. |

## Current handoffs

- RIR-800: [handoff](handoffs/RIR-800/001-start.md)
- RIR-801: [handoff](handoffs/RIR-801/006-completion.md)
- RIR-802: [handoff](handoffs/RIR-802/006-completion.md)
- RIR-803: [handoff](handoffs/RIR-803/001-start.md)
- RIR-804: [handoff](handoffs/RIR-804/001-start.md)
- RIR-805: [handoff](handoffs/RIR-805/001-start.md)
- RIR-806: [handoff](handoffs/RIR-806/001-start.md)
- RIR-807: [handoff](handoffs/RIR-807/001-start.md)
- RIR-808: [handoff](handoffs/RIR-808/002-completion.md)

## Grooming groups

- GR-001: RIR-100 · RIR-100, RIR-001, RIR-003 · Group refinement from the user's standing governance requirements and known Docker verification gap.
- GR-002: RIR-200 · RIR-200, RIR-210, RIR-211, RIR-212, RIR-230, RIR-231 · Initial group estimates from audited general/guild and meme compatibility defects; revisit before scope expands.
- GR-003: RIR-100 · RIR-110, RIR-004 · Foundation refinement after pinned branch comparison; one approved review-evidence story and deferred dependency cleanup.
- GR-004: RIR-800 · RIR-800, RIR-801, RIR-802, RIR-803, RIR-804, RIR-805, RIR-806, RIR-807 · User approved one stacked documentation epic. Grouped review of all 40 files and 13 ADRs; seven sequential leaves partition ownership and review risk. Parent is a planning estimate, not additional velocity.
- GR-005: RIR-800 · RIR-808 · Explicit user-approved 5-point prerequisite discovered during opening of the already groomed documentation epic

Parent estimates are planning sizes; sum leaf tickets only for delivery reporting. Backlog items with unknown estimates cannot start. Inspect full acceptance/ownership/history with `pnpm board show ID`.
