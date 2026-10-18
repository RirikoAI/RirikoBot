# Handover Note: [STORY-160] Equipment Crafting with Dust

- **Ticket Type & Points**: Story | 5 pts
- **Parent**: `EPIC-015`
- **Author / Agent**: Claude Code (Sonnet 5)
- **Status**: DONE
- **Timestamp**: 2026-09-21T00:00:00Z

## 1. Summary of Work Accomplished

STORY-160 adds a second, deliberate path to equipment progression alongside drops: spend Crafting Dust, Credits, and
(for most recipes) an ingredient to forge a specific gear piece or potion on demand. Delivered across three tasks:

- **TASK-1601 — CraftingService & Recipe Table**
  [crafting-recipes.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/equipment/crafting-recipes.ts):
  a static, typed `CRAFTING_RECIPES` table (26 recipes) — six per-slot upgrade chains (Weapon, Armor, Relic, Ring,
  Amulet, Talisman; RARE → SUPER_RARE → ULTRA_RARE → top non-signature tier) covering every non-signature, drop-only
  piece in the catalog, plus 2 potion recipes (Major HP Potion, Greater Mana Potion).
  [crafting.service.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/equipment/crafting.service.ts):
  `CraftingService.craft()` validates unlock floor, dust, credits and ingredients, then spends and grants atomically
  inside one `withTransaction`. 15 new tests, 243/243 in the full `waifu-tcg` suite.
- **TASK-1602 — Interactive Menu & Bot Wiring**
  [apps/bot/src/services.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/services.ts) wires `CraftingService`
  into the bot container. [item.command.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/commands/tcg/item.command.ts)
  adds a `craft` action (slash + prefix `craft`/`forge`, direct-by-code or menu). New
  [craft-menu.ts](file:///Z:/Projects/ririko-v2-2026/apps/bot/src/commands/tcg/craft-menu.ts): category picker (6
  gear slots + combined Potions bucket), recipe picker, detail panel, Craft/Close buttons. 24/24 new+existing menu
  tests, 82/82 in the full bot TCG command suite.
- **TASK-1603 — Docs, Catalog Copy & Help Center**
  [docs/waifu-tcg.md](file:///Z:/Projects/ririko-v2-2026/docs/waifu-tcg.md) §10.4 documents the system end-to-end
  with a generated 26-row recipe table; three stale lines elsewhere in the doc fixed to mention crafting.
  [catalog.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/equipment/catalog.ts)'s
  `CRAFTING_DUST` description updated to mention crafting (not just enhancement).
  [docs/commands.md](file:///Z:/Projects/ririko-v2-2026/docs/commands.md) §5.3 gained a `/item craft` bullet. The
  in-code help center needed no changes — it's fully dynamic, driven by `Command.metadata`.

### Follow-up: discoverable shortcuts and guide topic
- New standalone commands, each listed as its own entry in `/help`:
  - `/craft [recipe] [quantity]` (prefix `craft`, `forge`) runs the same handler as `/item action:craft`.
  - `/loadout [card_id]` (prefix `loadout`, `gear`, `equipment`) opens the same gear menu as `/card action:gear`.
- The `gear` prefix alias moved from `/item` to `/loadout`. `!gear` now opens the gear menu instead of the inventory. `!items` and `!tcgitem` still open the inventory.
- `/tcg-info` has a new **Crafting & Forging** topic. The **gear** topic now explains equipping with `/loadout`, and its old `equip-gear`/`unequip-gear` argument examples were wrong and are fixed.
- `/card` usage and examples now list `gear`, `equip-gear` and `unequip-gear`.
- The slash command total grows by 2. It is still well under Discord's limit of 100 global commands.

## 2. Current State & Verification

- `pnpm typecheck` (all 8 workspace packages + both apps) — **clean**.
- `pnpm -F @ririko/services exec vitest run src/waifu-tcg` — **243/243 passed** (32 files).
- `pnpm -F @ririko/bot exec vitest run src/commands/tcg` — **82/82 passed** (11 files).
- `pnpm -F @ririko/services exec eslint` / `pnpm -F @ririko/bot exec eslint` on every file touched across all three
  tasks — **0 errors** (TASK-1602 left 24 pre-existing `@typescript-eslint/no-explicit-any` warnings in test mocks,
  none introduced by this story).
- **Full suite** (`pnpm test`, run once at the end of TASK-1603): **139/139 test files passed, 1308/1308 tests
  passed**. No flaky failures observed on this run (the known live-network music extractor tests and occasional
  DB-timeout-under-parallel-load flakes did not appear; no rerun was necessary).
- Git branch: `feat/STORY-160-equipment-crafting`. **Nothing committed or pushed** across all three tasks, per
  standing instructions — commit/PR is the user's call.

## 3. Decisions Made (Story-Level)

- **Pricing formula**: `creditCost = round(shopPrice × 1.75)` (the Town Shop's 1.5x daily-rotation markup + a 0.25
  crafting premium, so crafting a rotation item never undercuts buying it the day it's in rotation) and
  `dustCost = round(shopPrice / 1000 × 40 × rarityMultiplier)` (reusing `enhancement-service.ts`'s existing rarity
  multiplier scale, so crafting dust costs sit on the curve players already know from +1..+10 enhancement).
- **Unlock floor gates**: each chain tier unlocks at the floor of the boss wall just *before* the one it helps clear
  (10 / 20 / 30 / 40, 45 for the Weapon slot's MYTHIC capstone) — a piece helps beat the *next* wall, never lets a
  player skip the one before it. Potion recipes unlock at floor 5.
- **Boss signature drops are permanently excluded from every recipe**, as both output and ingredient — verified
  against `assets/tcg/catalog/bosses/*.json` `signatureDropCode`s in the TASK-1601 test suite (cross-checked, not a
  hand-maintained duplicate list, so it can't silently drift out of sync).
- **Atomic transaction**: the entire `craft()` call — floor/dust/credit/ingredient checks, all spends, and the
  grant — runs inside one `withTransaction`, the same primitive `MarketService` and `EconomyRepository.modifyBalance`
  already use. No window exists where a partial spend or a lost currency amount can be observed.
- **Quantity caps**: equipment/accessory recipes are capped at 1 per `craft()` call (each instance needs its own
  independent enhancement level); potion recipes may be batched up to 10.
- **Ingredient consumption rule**: only unequipped (`state: 'IDLE'`) copies are ever considered or consumed; when a
  chain ingredient is consumed, the lowest-enhancement-level copy goes first, so an enhanced spare survives an
  upgrade craft as long as an unenhanced one exists.
- **Catalog seed is insert-only** (`if (!exists) create`, in `apps/bot/src/services.ts`): the updated
  `CRAFTING_DUST` flavor text (TASK-1603) will **not** reach any database that has already booted once. Only a
  fresh/never-seeded DB gets the new copy. This was investigated and documented, not changed, since fixing it is a
  seed-loop behavior change outside a docs/copy task's scope.

## 4. Next Steps

- **STOP AND ASK THE USER** (protocol §2.5, Anti-Runaway Session Boundary): STORY-160 is complete with all tests
  passing — confirm whether to commit, push `feat/STORY-160-equipment-crafting`, and open a PR to `develop/2.0.0`.
- **Live Discord playtest recommended before merge**: nothing in this story has been exercised against a running
  bot/Discord client yet, only vitest. Specifically worth hand-testing: the Crafting Workshop menu's category/recipe
  selects and Craft button end-to-end, the direct `/item action:craft recipe:<code> quantity:<n>` path with all
  three code-resolution styles, the prefix `!item craft`/`!item forge` aliases, and a full upgrade-chain craft
  (base tier → consumes it as an ingredient → next tier) to visually confirm the receipt embed and dust/credit
  balances update correctly.
- With STORY-160 done, `EPIC-015` (Waifu TCG Progression, Equipment Economy & Seasonal Anime Bosses) has no
  remaining open children besides whatever is already sitting in `REVIEW`/`BACKLOG` (`STORY-161`, `BUG-0012`,
  `BUG-0013` — see `docs/kanban/BOARD.md`).
