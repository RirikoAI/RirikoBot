# Handover Note: STORY-165 Owner Console: Global Economy Settings & Item Shop Manager

- **Ticket Type & Points**: Story | 13 pts (`TASK-1651` = 5, `TASK-1652` = 5, `TASK-1653` = 3)
- **Epic**: `EPIC-011`
- **Author / Agent**: Claude Code (Opus 5.5)
- **Status**: REVIEW
- **Timestamp**: 2026-09-27
- **Branch**: `feat/STORY-165-owner-economy-shop` (targets `develop/2.0.0`)

## 0. Decisions Made at Story Start (2026-09-27)
- **Re-groomed from 8 to 13 points.** The planning audit found three more problems:
  - **Bank capacity was saved once per user.** It changed only on level-up, and used the level in the server where the level-up happened, although XP is kept per server. An owner change would never reach existing members.
  - **Nothing used item categories.** No category rows existed, and `/shop` never filtered by category.
  - **The item seed failed on Postgres** (the item-seed part of BUG-0024). It wrote slug IDs such as `candy_minor` into a `uuid` column, and the error was swallowed, so the Postgres shop was empty. That included `profile_bg_voucher`, which `/profile background` looks up by that exact ID.
- **User's choices:**
  - Bank capacity is computed live from the account-wide level.
  - Categories are managed in the console and group `/shop`.
  - The item-seed fix is folded in as TASK-1653.
  - BUG-0024 keeps only the legacy karma and welcomer key mapping, re-estimated at 2 points.
- **STORY-115 moved to DONE** (merged in PR #653).

## 1. Summary of Work Accomplished

### TASK-1651: Owner console shell, global economy settings, live bank capacity, CLI
- **Schema:** a new single-row table `economy_config` (id `global`), in both dialects. Its columns are:
  - `daily_base_reward` (250)
  - `daily_streak_bonus_percent` (5)
  - `daily_max_streak_bonus_percent` (150)
  - `bank_base_capacity` (10000)
  - `bank_capacity_per_level` (2500)
  - `updated_by`, `updated_at`

  Repository: `EconomyConfigRepository` (`get`, `save`). With no row, the defaults apply.
- **Core:** [economy.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/economy.ts) has:
  - `EconomyConfigSchema` (built on `IntSetting`, so the CLI's strings work);
  - `DEFAULT_ECONOMY_CONFIG`;
  - the pure formulas `dailyReward`, `dailyStreakMultiplier` and `bankCapacityFor`. The streak bonus is now in whole percent (5 means +5%); the rewards match the old fractions exactly.
- **Services:**
  - [EconomyConfigService](file:///Z:/Projects/ririko-v2-2026/packages/services/src/owner/economy-config.service.ts) is in the new `@ririko/services/owner` subpath, so the web app does not load the canvas-based economy module.
    - `get()` reads the database on every call.
    - `update(patch, actor)` validates, diffs, saves and audits in one transaction. The audit entry has `guild_id` null and action `owner.economy_config.update`.
  - `GuildConfigValidationError` takes a subject ("economy settings"), and `fieldErrorsOf` is exported.
  - `DailyService` takes `config` in place of the number options. Its `calculateMultiplier` and `calculateReward` methods moved to core.
  - `BankingService` takes `config` and `levelResolver`.
    - The bot passes `createXpLevelResolver`, the same account-wide level the energy system uses.
    - `refreshCapacity(userId)` replaces `calculateBankCapacity` and `syncBankCapacity`.
    - Deposit, withdraw and interest call it first.
    - `LevelingService` calls it on level-up.
    - `/balance` and the profile card show it.
    - The unused `expansions` parameter is gone.
- **Web:**
  - `isBotOwner`; `requireOwner` uses it.
  - [runOwnerAction](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/owner-action.ts) runs, in order: Origin and rate limit, bot owner (404 otherwise), then the five-minute passkey check (returned as a reason so the form can run it inline). It turns `GuildConfigValidationError` into field errors and any other `ValidationError` into the form message.
  - `runOwnerAction` is added to both guard lists of the authorization coverage test.
  - `app/owner/layout.tsx` calls `requireOwner('/owner')`; each page checks again with its own path.
  - `/owner` redirects to `/owner/economy`. That page has a form for the five values and a short "now" summary (day 1 reward, longest streak reward, level 10 capacity).
  - The header shows "Owner console" to owners only.
  - `AccountNav` now uses a shared `TabNav`; `OwnerNav` is new.
- **CLI:** `ririko economy:config [key] [value]` ([economy-config.ts](file:///Z:/Projects/ririko-v2-2026/apps/cli/src/commands/economy-config.ts)). It works like `guild:config`, with actor `cli:<os user>`.

### TASK-1652: Item and category manager
- **Schema:** `economy_items.code` and `economy_item_categories.code` (nullable, unique), plus an index on `economy_inventories.item_id`.
- **Repositories:**
  - `ItemCategoryRepository`, new: `findAll`, `findById`, `findByCode`, `create`, `update`, `delete`, `countItems`.
  - `ItemRepository.findByCode`.
  - `InventoryRepository.countHolders` and `holderCountsByItem`.
  - On Postgres, `findById` with a non-uuid ID now returns null instead of failing. Before, `/shop buy candy_minor` on Postgres threw.
- **Core:** [shop.ts](file:///Z:/Projects/ririko-v2-2026/packages/core/src/config/shop.ts)
  - `ShopItemInputSchema`, flat for forms. Only the chosen effect's amount is kept; energy potions default to 3 uses a day.
  - `ShopCategoryInputSchema` and `CatalogCodeSchema`.
  - `shopItemMetadata`, which keeps metadata keys the editor does not own, and `shopItemEffectValues`.
- **[ItemCatalogService](file:///Z:/Projects/ririko-v2-2026/packages/services/src/owner/item-catalog.service.ts)** (`@ririko/services/owner`):
  - Operations: list (with holders), create, update, retire/restore, delete, and category create, update and delete.
  - A code, once set, never changes.
  - Delete needs the item retired first, nobody holding it, and the item not from the default catalog.
  - Categories can be deleted only when empty and not from the default catalog.
  - Category names are unique regardless of case.
  - Re-saving an item that only reorders metadata keys changes nothing.
  - Audit actions: `owner.shop_item.create|update|retire|restore|delete` and `owner.shop_category.create|update|delete`, all with no guild.
- **Web:**
  - `/owner/shop`: the item table with holder counts, category forms, and "Add a category".
  - `/owner/shop/new` and `/owner/shop/[itemId]`: the shared `ItemForm`, plus Retire/Put back on sale and Delete (shown only when allowed).
  - `NumberField` now accepts `null` for optional numbers.

### TASK-1653: Item codes, seed on both dialects, `/shop` by category
- **`seedDefaultCatalog`** adds the missing default categories (`consumable`, `cosmetic`) and items by code, with uuid IDs. It never changes an existing row.
  - On SQLite, rows from the old seed (the code was the ID) only get their code filled in, and their category if it was the slug. Inventories keep matching.
  - The bot logs a seed failure instead of swallowing it.
- **`InventoryService`**
  - `getItem(ref)` finds by code first (any case), then by ID. `buyItem`, `useItem` and `getItemQuantity` use it, so `/shop buy`, `/use` and the voucher lookup in `ProfileBackgroundManager` work by code without other changes.
  - `getCatalogSections()` groups purchasable items by category, with uncategorized items last under "Other".
- **Bot:** `/shop list` shows each category's items under its own heading with the codes. `/shop` and `/inventory` show codes, and the command option texts say "code".

### Docs
- [dashboard.md](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md): §3.1 (`economy_config`), the new §3.1.1 (owner console), §4 item 8, and the §8 table (13 points).
- [economy.md](file:///Z:/Projects/ririko-v2-2026/docs/economy.md): §5.1 (live capacity), §5.2, the new §5.4 (global settings table), and the new §7.1.1 (item codes and the default catalog).

## 2. Current State & Verification
- `pnpm build`, `pnpm -r typecheck` and the Next.js production build all pass. The build lists `/owner`, `/owner/economy`, `/owner/shop`, `/owner/shop/new` and `/owner/shop/[itemId]`.
- ESLint: 0 errors, 589 warnings, the same count as before the story. `prettier --check` is clean.
- **Full `vitest run`:** 230 files, 2033 tests, all passing. During TASK-1652 the random TCG test `rarity-and-card-generator > should scale stats according to rarity multiplier` failed once. It passed on 3 of 3 reruns and is unrelated.
- **New tests:**
  - Core: economy schema and formulas; shop schemas and metadata.
  - `EconomyConfigService`: defaults, update, no-op, errors, global audit row.
  - `DailyService` and `BankingService` with an injected config: the reward follows the config; capacity follows level and config; deposit uses live capacity; credits above a lowered capacity can be withdrawn.
  - `ItemCatalogService`: create, field errors, update keeping the code and unknown metadata, retire/restore, delete rules, seeded items, listing, categories.
  - Seed: first run, re-run, legacy SQLite slug rows, owner edits kept.
  - `getItem` by code or ID; grouped catalog.
  - The CLI round trip and refusals.
  - Owner actions: saved, 404 for non-owners, passkey reason, foreign Origin, field errors, refusal message, redirect after create.
  - `/shop list` category headings.
- **Real data check, on a copy of `data/ririko.sqlite`** after `drizzle-kit push`:
  - The seed filled codes on the four slug items and created the two categories. Inventory rows (`stamina_potion` ×3, `profile_bg_voucher` ×1) still point at the same item IDs. A second run added nothing.
  - `ririko economy:config` listed the defaults and set `dailyBaseReward` to 400, writing an audit row with `guild_id` null and actor `cli:fariz`. A value of 900 for the streak bonus was refused with `Enter a whole number from 0 to 100.`
  - A daily claim then paid 400.
  - For the member with the most XP (account level 17), the saved capacity was 37,500, from one server's level. The live capacity was 52,500, and it became 95,000 after `bankCapacityPerLevel` was set to 5000.
- **Browser check on a temporary preview page** of `ItemForm` (since deleted; the real pages need an owner sign-in):
  - An invalid code, an `http://` icon and a missing energy amount each showed their field error, and every input kept its value.
  - A valid save lowercased the code, dropped the unused XP amount and defaulted uses per day to 3.
  - No console errors.
- **Not verified:**
  - The real `/owner` pages while signed in as an owner with a passkey.
  - `/shop`, `/use`, `/daily` and `/deposit` in Discord.
  - The seed on a real Postgres database.

## 3. Roadblocks, Gotchas & Decisions Made
- **Existing databases need `pnpm db:push`.** It adds the `economy_config` table, the two `code` columns with their unique indexes, and the inventory index. The shared `next dev` server and the bot fail on item reads until then.
- **Owner audit entries have no guild**, so the guild audit viewer does not show them. An owner audit view is not built.
- **Voice reward amounts** (35 credits and 40 XP a minute) are still constants in `DEFAULT_REWARD_RULES`; they are not in `economy_config`.
- **Bank interest** is still not live (`applyDailyInterest` has no caller).
- **`CREDITS_GRANT` items** can create credits if the grant is larger than the price. The editor warns about this but does not refuse it.
- **`XP_GRANT` items** only work in a server (the XP needs a guild), as before.
- **`/shop list` has no pagination**, so a very large catalog can pass Discord's 2000-character limit. That was already true before this story.
- **Item codes on migrated items:** the legacy migration still imports items without codes. On Postgres, those items also cannot be inserted at all, because 1.4.0 used integer item IDs and the column is `uuid`. That is a migration problem next to BUG-0024.
- **The default catalog cannot be deleted from.** Deleting a default item or category would only bring it back at the next bot start, so the console allows retiring only.
- **`apps/web/AGENTS.md`/`CLAUDE.md`** are not part of any commit.

## 4. Actionable Next Steps for Next Session / Continuing Agent
1. Run `pnpm db:push`, then check with the real bot and `pnpm dev:web`, signed in as a `BOT_OWNER_ID` user with a passkey:
   1. **Economy:** set the daily reward to 400 and check that `/daily` pays it. Raise the capacity per level and check that `/balance` shows the new capacity without a level-up.
   2. **Shop:** create an item with a category, then check `/shop list` (under its heading) and `/shop buy <code>`. Retire it and check that it disappears from `/shop` while staying in `/inventory`. Try to delete it while held (refused), then after `/use` empties it (allowed).
   3. **Passkey:** wait more than five minutes, save, and check that "Confirm with passkey and save" works.
2. Review and open a PR for `feat/STORY-165-owner-economy-shop` into `develop/2.0.0`.
3. Next: BUG-0023 and BUG-0024. Consider adding the legacy integer item IDs on Postgres to BUG-0024. Then STORY-116 and STORY-112.
