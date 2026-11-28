# Handover Notes: [STORY-207] One /items Command for Gear, Potions and Bag Items, and Stamina Renamed to Energy

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-11-28T13:40:00Z · claude-large (coordinator)

**Approach**
- TASK-2071 first: rename stamina to energy everywhere a player or owner reads it, with a data-only migration for stored rows and alias maps for old codes.
- TASK-2072 second: one /items command replaces /item, /inventory and /use. /inventory stays as its own command name (slash and prefix) running the same handler.

**Relevant code**
- `apps/bot/src/commands/tcg/item.command.ts` `createItemCommand`: today's TCG /item (aliases `tcgitem`, `items`), with an inventory view (select menu `inv:select_item`, filter buttons), enhance, use and craft.
- `apps/bot/src/commands/economy/commands.ts` `inventoryCommand`, `useCommand`: the economy bag (economy_items and inventory tables via InventoryService), items used by code.
- There are two item systems: TCG `game_items` + `user_inventory_items` (row IDs, enhancement, equipped state) and economy `economy_items` + bag inventory (codes such as `candy_minor`, `stamina_potion`). Both energy item kinds feed the same player energy pool.
- Prefix aliases are prefix-only (`packages/discord/src/router/registry.ts`); a slash alias needs its own Command, as /craft does for /item craft.

**Pitfalls**
- The STORY-206 dismantle thread works in parallel on another branch. It adds a `dismantle` command to command-set.ts and a method to enhancement-service.ts. Do not edit enhancement-service.ts.
- Module toggles gate by command category (`packages/discord/src/middleware/modules.ts`), which is why /items stays TCG and /inventory stays ECONOMY.

**Out of scope**
- The dismantle command (STORY-206).

---

## REVIEW · 2026-11-28T14:45:00Z · claude-large (coordinator) · DONE

**verify_cmd rerun**
- `pnpm test:coverage` passes every threshold (486 files, 6234 passed, 547 skipped PostgreSQL-only). db:check, typecheck, lint --quiet, format:check and `pnpm build` pass.

**Acceptance**
- [x] TASK-2071 and TASK-2072 are DONE.
- [x] Coverage thresholds pass.

**Worker tier**
- Tasks ran on claude-medium, matching their `medium` tier.
