# Handover Notes: [STORY-162] Craft & Equip Button and Card Name on Worn Gear in Inventory

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## PROGRESS · 2026-10-09T12:37:08Z · claude-opus-5-5 (coordinator) · ABANDONED

**Files changed**
- None. The story never left BACKLOG and was never groomed.

**Verification**
- Not applicable.

**Decisions & gotchas**
- Abandoned by user decision after a review of the current code.
- Craft & Equip: `/loadout` already equips gear in a few clicks, so the button saves one step. The case players would want it for is upgrading worn gear, and `CraftingService` consumes only IDLE ingredients (`packages/services/src/waifu-tcg/equipment/crafting.service.ts:108`). The button would have to swap the equipped piece out mid-craft. Crafting is rare, so the cost is not worth it.
- The real gap was that no screen shows inventory item IDs. `/card action:equip-gear`, `/card action:unequip-gear`, `/item action:enhance id:` and `/item action:use id:` all need one. That gap, together with the card name on worn gear, moved to BUG-0039 (1 pt).

**Next steps**
- None. Work continues in BUG-0039.
