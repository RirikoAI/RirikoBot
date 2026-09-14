# Ririko work board

Generated from state.json · revision 8 · execution limit **1**.

**Current work:** No occupied ticket.
**Delivery:** BATCH-001 / RIR-001 / `chore/RIR-001-work-governance` → `develop/2.0.0-astra` (checkpoint)

Read [the standing protocol](PROTOCOL.md) and the current handoff before working. A new task while the slot is occupied requires the user’s pause/abandon decision. A new delivery scope requires the PR checkpoint decision.

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
| RIR-004 | chore | Remove historically tracked generated dependency launchers | Ungroomed | RIR-100 | RIR-001 | — | RIR-004 |

## done

| ID | Type | Outcome | Points | Parent | Requires | Blocks | Delivery scope |
|---|---|---|---:|---|---|---|---|
| RIR-001 | chore | Establish work board, agent handoffs and safe Git delivery | 8 | RIR-100 | — | RIR-003, RIR-210, RIR-211, RIR-310, RIR-410, RIR-510, RIR-610, RIR-710, RIR-004 | RIR-001 |

## Agent assignments

| Assignment | Ticket | Agent | Status | Scope |
|---|---|---|---|---|
| A-001 | RIR-001 | workflow-engine | accepted | Implement and test the pure board validator/state transition engine against tools/workboard/types.ts and the standing protocol. Return evidence and design decisions; no Git or status changes. |

## Current handoffs


## Grooming groups

- GR-001: RIR-100 · RIR-100, RIR-001, RIR-003 · Group refinement from the user's standing governance requirements and known Docker verification gap.
- GR-002: RIR-200 · RIR-200, RIR-210, RIR-211, RIR-212, RIR-230, RIR-231 · Initial group estimates from audited general/guild and meme compatibility defects; revisit before scope expands.

Parent estimates are planning sizes; sum leaf tickets only for delivery reporting. Backlog items with unknown estimates cannot start. Inspect full acceptance/ownership/history with `pnpm board show ID`.
