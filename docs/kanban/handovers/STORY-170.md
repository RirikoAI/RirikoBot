# STORY-170 — Interactive Branching Adventure RPG

Status: REVIEW (2026-09-27). All implementation tasks TASK-1701–TASK-1704 and follow-ups TASK-1706–TASK-1715 are DONE. TASK-1705 contains local verification results and the remaining live PostgreSQL/Discord checks. No ticket remains IN_PROGRESS.

The feature includes 35 complete scenario graphs with 45 shared-location illustrations, database-enforced global user ownership, persistent RNG/deadlines/receipts, energy and cooldown admission, immediate voluntary payments, atomic rewards/losses/refunds, rarity-safe card grants, a shared serial allocator, public slash/prefix gameplay and restart-safe Discord delivery recovery.

Changes are uncommitted on `codex/adventure-rpg`. No deployed data or `.local` files were changed. Target branch for a future PR is `develop/2.0.0`.

- [Catalog handover](TASK-1701.md)
- [Durable engine handover](TASK-1702.md)
- [Payment/reward handover](TASK-1703.md)
- [Discord handover](TASK-1704.md)
- [Verification results and exact remaining steps](TASK-1705.md)
- [Story presentation, net summaries and shared illustrations](TASK-1706.md)
- [Thirty additional illustrated adventures and catalog search](TASK-1707.md)
- [Requested S+-rank user override](TASK-1712.md)
- [Companion reward rank verification](TASK-1711.md)
- [Tower-benchmarked completion economy, companion XP and verification](TASK-1715.md)
- [Commands, migration audit and runtime guide](../../adventure-runtime.md)

Before another story/epic, observe AGENTS.md's PR checkpoint. A review can use this entire working-tree change; all new files must be included, not just the tracked-file diff.
