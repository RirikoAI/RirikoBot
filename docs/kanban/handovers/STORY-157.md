# Handover Note: [STORY-157] Interactive Equipment Menu (/card gear)

- **Ticket Type & Points**: Story | 8 pts
- **Parent**: `EPIC-015`
- **Author / Agent**: Claude Code (Opus 5)
- **Status**: DONE
- **Timestamp**: 2026-09-20T02:00:00Z

## 1. Summary of Work Accomplished
- [gear-menu.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/commands/tcg/gear-menu.ts): `/card action:gear` opens an interactive gear manager. `/card action:loadout` is now an alias of it.
  - **Card dropdown**: up to 25 owned cards, with the equipped card starred.
  - **Slot dropdown**: the six slots, each showing what is equipped.
  - **Item dropdown**: owned spare gear for the slot. Each option shows the stat change against the equipped piece (e.g. `ATK +81 ▲ · SPD -5 ▼`).
  - **Buttons**: Equip (enabled once an item is picked), Unequip, Enhance (label shows the dust and credit cost), Close.
  - The embed updates in place with a notice line after each action. The footer shows the Crafting Dust balance.
  - Only the player who opened the menu can use it; the collector expires after 3 minutes.
  - `buildGearMenuView` is pure (no I/O), `loadGearMenuState` loads the data, and `formatStatDelta` / stat formatting cover percentage stats.
- [gear-actions.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/commands/tcg/gear-actions.ts): `enhanceGear` spends dust through `EnhancementService`, then debits credits through the ledger. It is shared by the gear menu and `/item action:enhance`, which removes the duplicated charge code.
- The text-based `equip-gear` / `unequip-gear` actions still work for prefix users; their reply now points to `/card action:gear`.

## 2. Current State & Verification
- New [gear-menu.test.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/commands/tcg/__tests__/gear-menu.test.ts) (3 tests): stat delta formatting, component layout and button enable rules, empty-slot view.
- `card.command.test.ts` now expects the gear menu for `loadout`.
- `pnpm typecheck` clean, eslint 0 errors. `pnpm test` green except the live-network music extractor tests.
- Not checked in a live Discord session.

## 3. Roadblocks, Gotchas & Decisions Made
- Discord limits a select menu to 25 options, so only the first 25 cards and the first 25 spare items per slot are listed. Pagination can come later if players need it.

## 4. Actionable Next Steps
- STORY-158: shop revamp (categories, compare, Buy & Equip, daily rotation). It can reuse `formatStatDelta` and `loadGearMenuState`.
