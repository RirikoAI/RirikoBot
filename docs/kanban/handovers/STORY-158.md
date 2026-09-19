# Handover Note: [STORY-158] Town Shop Revamp: Categories, Compare, Buy & Equip, Daily Rotation

- **Ticket Type & Points**: Story | 5 pts
- **Parent**: `EPIC-015`
- **Author / Agent**: Claude Code (Opus 5)
- **Status**: DONE
- **Timestamp**: 2026-09-20T02:30:00Z

## 1. Summary of Work Accomplished
- [shop-menu.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/commands/tcg/shop-menu.ts): `/game action:shop` is rebuilt.
  - **Category buttons**: All / Gear / Accessories / Potions / Daily Deals. `subaction` still preselects a category.
  - **Item dropdown**.
  - **Compare**: for gear, the stat change against the same slot on the player's equipped card (`formatStatDelta`, shared with the gear menu).
  - **Buttons**: Buy 1x, Buy 5x (consumables only), **Buy & Equip** (gear; buys one piece and equips it on the equipped card, returning any replaced piece to the inventory).
  - Owner-only, 3-minute collector, embed updated in place.
  - `buildShopView` is pure (no I/O).
- [tcg-shop.service.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/equipment/tcg-shop.service.ts):
  - `getDailyRotation(now)`: two items a day from `DAILY_ROTATION_POOL` (drop-only RARE gear). The pick is deterministic per UTC day (`pickDailyRotation`), priced at 1.5× list price, one per order.
  - `buyItem(..., now)` accepts drop-only items only while they are in that day's rotation.
  - `TcgShopReceipt.inventoryItemIds` returns the new inventory rows (needed for Buy & Equip).
- `DAILY_ROTATION_POOL` in [catalog.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/equipment/catalog.ts) never includes boss signature gear.
- `game.command.ts`: the old inline shop UI is removed in favor of `openShopMenu`.

## 2. Current State & Verification
- New [shop-rotation.test.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/__tests__/shop-rotation.test.ts) (real SQLite, 3 tests): deterministic and varying rotation, markup and one-per-order limit, rotation items can't be bought on other days, no signature gear in the pool.
- New [shop-menu.test.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/commands/tcg/__tests__/shop-menu.test.ts) (3 tests): comparison text, button enable rules, empty category.
- `pnpm typecheck` clean, eslint 0 errors. `pnpm test` green except the live-network music extractor test.

## 3. Roadblocks, Gotchas & Decisions Made
- `maxDailyPurchases` is still checked per order, not per day. That is pre-existing behavior; a per-day purchase counter would need purchase history and is out of scope.
- The rotation is by UTC day so every server sees the same deals.

## 4. Actionable Next Steps
- STORY-159: tune S1 against `S1_TARGET_BANDS`; add pity blessing and floor star ratings.
