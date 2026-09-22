# Command System & Interactive Help Specification (Ririko AI 2.0.0)

## 1. Dual-Dispatch Architecture & Parity
In Ririko AI 2.0.0, every user-facing command supports both **Slash Commands** (`/command`) and **Prefix Commands** (`!command` or custom guild prefix). Business logic is never implemented twice.

```text
User Interaction
 ├── /play query: YOASOBI Idol (Slash Interaction)
 └── !play YOASOBI Idol        (Message Content)
        │
        ▼
 Unified Command Router (O(1) Hash Map Lookup)
        │
        ▼
 Middleware Pipeline (RateLimit, Cooldown, GuildCheck, PermCheck)
        │
        ▼
 Application Command Execution Context
        │
        ▼
 Domain Application Services
```

---

## 2. Command Metadata Schema

Every command exposes machine-readable metadata consumed by the command router, interactive help system, and web dashboard:

```typescript
export interface CommandMetadata {
  name: string;
  category: CommandCategory;
  description: string;
  aliases: string[];
  slashEnabled: boolean;
  prefixEnabled: boolean;
  defaultMemberPermissions?: bigint;
  userPermissions?: string[];
  botPermissions?: string[];
  cooldownSeconds: number;
  rateLimit: { max: number; windowSeconds: number };
  usage: string;
  examples: string[];
  isOwnerOnly?: boolean;
  isGuildOnly?: boolean;
  isHidden?: boolean;
  options?: CommandOptionDefinition[];
}
```

---

## 3. Middleware Pipeline

Prior to command invocation, the dispatcher passes the execution context through an extensible middleware chain:
1. **Maintenance Middleware**: Blocks command execution if maintenance mode is enabled (except for bot developers).
2. **Module Toggle Middleware**: Verifies whether the command's parent module is enabled for the guild.
3. **Channel Override Middleware**: Checks if the command is disabled in the specific channel.
4. **Rate Limit & Cooldown Middleware**: Evaluates per-user and per-channel token buckets, returning ephemeral time-to-reset warnings if exceeded.
5. **Centralized Permission Middleware**: Evaluates Discord bitfields, role hierarchy, and blacklists.

---

## 4. Interactive Help System (`/help`)

The legacy static help embed is replaced by an interactive, component-driven help browser generated dynamically from the command registry:

```text
┌─────────────────────────────────────────────────┐
│ Ririko AI Help Center                           │
│ Browse commands by category or search below.    │
│                                                 │
│ [ Select Category ▼ ]                           │
│   • AI Chatbot                                  │
│   • Music & Audio                               │
│   • Moderation & Safety                         │
│   • Waifu TCG & Gamification                    │
│   • Economy & Leveling                          │
│   • Server Utilities                            │
│   • Stream Alerts                               │
│                                                 │
│ [◀ Previous] [Page 1/4] [Next ▶] [🔍 Search]    │
└─────────────────────────────────────────────────┘
```

### Detailed Command Inspector:
Selecting a specific command displays:
- Name, category, and full description.
- Slash syntax: `/music play <query>`
- Prefix syntax: `!play <query>`
- Aliases: `!p`, `!queue`
- Required permissions (User & Bot).
- Cooldown and rate limits.
- Real-world usage examples.
- Direct link to configure the module on the web dashboard.

---

## 5. Gamification, Shop, Inventory & Achievement Commands Specification

### 5.1. Achievements Subsystem
- `/achievement list [category] [page]`
  - Interactive embed with category filter (`Collector`, `Combatant`, `Tycoon`, `Blacksmith`, `Devotion`, `Guild Hero`).
  - Displays progress bar (e.g. `[██████░░░░] 6/10`), tier badge, and available rewards.
- `/achievement claim <achievement_id | all>`
  - Claims completed achievement rewards (dispatches XP, credits, cards, equipments, accessories, consumables, and badges).
  - Emits `EconomyEvent` and updates `user_achievements` inside a database transaction.

### 5.2. Item Shop Subsystem
- `/shop list [category]`
  - Categories: `Equipments`, `Accessories`, `Consumables`.
  - Displays item code, base stats, perk preview, credit price, and daily purchase quotas (e.g., max 1 Energy Candy per day).
- `/shop buy <item_id> [quantity]`
  - Deducts user credits via ACID double-entry transaction (`type: 'SHOP_BUY'`).
  - Adds items to `user_inventory_items`. Enforces purchase caps.

### 5.3. Equipment, Accessories & Inventory
- `/item inventory [category]`
  - Displays player owned equipments, accessories, and consumables with enhancement levels (+0 to +10) and equip status.
- `/loadout [card_id]` (Prefix: `loadout`, `gear`, `equipment`; same as `/card action:gear`)
  - Opens the interactive gear menu on the chosen card (default: the active ⭐ card): card, slot and item
    dropdowns with a stat-change preview, plus Equip, Unequip and Enhance buttons.
- `/card equip-gear <card_id> <item_id> [slot]`
  - Equips a weapon, armor, relic, ring, amulet, or talisman to an active combat waifu card.
  - Automatically locks the equipped gear (`state = 'EQUIPPED'`) from market sale or trading.
- `/item use <item_id> [quantity]`
  - Consumes an item from inventory (HP Potion, Mana Draught, Energy Restore).
  - For Energy Restores: Enforces the daily consumption limit (e.g. max 3/day).
- `/item craft [recipe] [quantity]`
  - With no `recipe`, opens the interactive Crafting Workshop menu (category picker, recipe picker, Craft button).
  - With a `recipe` (exact recipe code or bare output item code), forges it directly, spending Crafting Dust, Credits,
    and any chain ingredient. `quantity` batches potion recipes up to 10; equipment/accessory recipes are capped at 1.
  - Prefix alias: `forge`. See `docs/waifu-tcg.md` §10.4 for the full recipe table and cost formula.
- `/craft [recipe] [quantity]` (Prefix: `craft`, `forge`)
  - Standalone shortcut for `/item craft`, listed as its own entry in `/help`.

### 5.4. Player Energy & Stamina
- `/energy status`
  - Displays current energy, maximum level-scaled capacity, time until the next energy reset boundary (default 00:00 GMT+8), and remaining daily energy potions available.

### 5.5. PvE Seasonal Dungeon Tower Commands
- `/dungeon seasons`
  - Lists the active season, theme elements, active environmental affixes, and time remaining until season reset.
- `/dungeon enter [season_id] [floor_number]`
  - Initiates tactical combat on the specified floor (Tutorial T1–T4 or active Season F1–F50+).
  - Validates energy prerequisites and deducts player energy atomically.
  - Generates turn-by-turn interactive Discord combat embeds with active skills, potion usage buttons, and elemental shield meters.
- `/dungeon progress [season_id]`
  - Displays the user's highest cleared floor, first-clear rewards status, attempt history, and fastest clear times.

### 5.6. Role-Guarded Game Administration (`/tcg-admin`)
- `/tcg-admin config energy max_cap <value: 100-1000>`
  - Sets the global or guild ceiling on maximum player energy.
  - **Permission Guard**: Requires Discord `Administrator` or the designated `TCG Manager Role`.
- `/tcg-admin config energy pot_limit <value: 1-10>`
  - Adjusts maximum daily energy consumable usage per player.
- `/tcg-admin config dungeon scaling_model <LINEAR|POLYNOMIAL|EXPONENTIAL|HYBRID>`
  - Hot-reloads the difficulty growth model for current dungeon floors.
- `/tcg-admin config dungeon growth_rate <value: 0.03-0.25>`
  - Adjusts base exponential growth factor $r$ for monster HP/ATK.
- `/tcg-admin config role <@role>`
  - Designates the authorized manager role for game operations.
- `/tcg-admin shop restock`
  - Manually refreshes shop rotating items or forces inventory sync.

### 5.7. Card Collection & Inspection Subsystem (`/card`)
- `/card collection [element] [rarity] [page]` (Prefix: `!cards`, `!collection`)
  - Displays paginated collection album with element filters, rarity badges, and total completion count.
- `/card inspect <card_id>` (Prefix: `!inspect <card_id>`)
  - Displays complete card profile, primary stats, skills, equipped gear, and **attaches the rendered 800×1200 px foiled card PNG** via `CardImageService`.
- `/card claim` (Prefix: `!claim`)
  - Claims active chat drops in `#waifu-drops` text channels, enforcing a 5-minute claimant anti-sniping cooldown and attaching rendered card PNG.
- `/card favorite <card_id>`
  - Toggles favorite protection lock on a card to prevent accidental dismantling or market listing.
- `/card dismantle <card_id | rarity>`
  - Recycles duplicate or unwanted cards into Crafting Dust for gear enhancement.
  - Any gear the card wears goes back to the owner's inventory first.
- `/card unequip-all [card_id]`
  - Unequips every gear piece from one card. Without a card ID it unequips gear from every card, including gear left
    on a card the player no longer owns. The `/loadout` menu has the same action as an **Unequip All** button.
- `/card equip <card_id>` / `/card unequip <card_id>`
  - Sets or clears the active combat card for PvP duels, expeditions, and dungeon tower battles.
- `/card guide` / `/card info`
  - Directly opens the interactive TCG Info Hub select menu.

### 5.8. Peer-to-Peer Trading Subsystem (`/trade`)
- `/trade request <@user>` (Prefix: `!trade <@user>`)
  - Initiates an atomic trading session between two players.
- `/trade offer card <trade_id> <card_id>` / `/trade offer credits <trade_id> <amount>`
  - Offers cards or credits. Selected items are locked in `IN_TRADE` state.
  - Only cards with all 6 gear slots empty can be offered or requested. The error names the equipped slots and
    points to `/card unequip-all`. Gear can't be equipped onto a card while it is `IN_TRADE`.
- `/trade confirm <trade_id>`
  - Dual-confirmation gate. When both players confirm, settlement executes atomically within a database transaction.
- `/trade cancel <trade_id>`
  - Cancels the session and releases all item locks immediately.

### 5.9. Player Marketplace Subsystem (`/market`)
- `/market browse [element] [rarity] [sort] [page]` (Prefix: `!market`)
  - Browses active player listings with price, rarity, and stat sorting.
- `/market list <card_id> <price_credits>`
  - Lists a card for sale, locking it in `IN_MARKET` state with a 7-day auto-expiration.
  - Only cards with all 6 gear slots empty can be listed or bought. Gear can't be equipped onto a card while it is `IN_MARKET`.
- `/market buy <listing_id>`
  - Purchases a card using credits. Enforces a 5% coin sink tax to curb inflation.
- `/market cancel <listing_id>`
  - Cancels a listing and returns the card to inventory.

### 5.10. WaifuGuilds Factions Subsystem (`/waifuguild`)
- `/waifuguild create <name> [tag]` (Prefix: `!guild create`)
  - Establishes a player faction (5,000 credit creation fee).
- `/waifuguild info [guild_id]` (Prefix: `!guild info`)
  - Displays guild level, member roster, capacity ($10 + \text{Level} \times 2$), and guild bank balance.
- `/waifuguild deposit <credits>`
  - Deposits credits into the shared guild vault for upgrades and raid unlocking.
- `/waifuguild join <guild_id>` / `/waifuguild leave`
  - Manages player faction membership.

### 5.11. TCG Info Hub & Onboarding Guide (`/tcg-info`)
- `/tcg-info [topic]` (Prefix: `!tcg-info`, `!tcginfo`, `!tcgguide`, `!waifu-guide`)
  - Interactive multi-page handbook powered by a Discord `StringSelectMenu`.
  - 11 Guide Topics:
    1. `overview`: Welcome, system architecture, core loops.
    2. `starter`: How to obtain cards (tutorial, chat drops, marketplace).
    3. `elements`: 7-element affinity loop, Ice mechanics, and status effects.
    4. `gear`: 6-slot loadout, equipping with `/loadout`, +10 enhancement.
    5. `crafting`: Crafting and forging with `/craft`, unlock floors, costs, Crafting Dust sources.
    6. `tutorial`: 4-floor onboarding prologue and starter pool.
    7. `dungeon`: Seasonal towers, scaling models, elemental wards, enrage clock.
    8. `trade`: Atomic P2P trading rules and `IN_TRADE` safety.
    9. `market`: Community marketplace and 5% tax sink.
    10. `guild`: WaifuGuild factions, leveling, and vaults.
    11. `achievements`: 6 tracks, 5 tiers, and multi-asset rewards.


## 6. Anime & Manga Commands (`anime` category)

### 6.1. Search Commands (`/anime`, `/manga`, `/anime-character`)
- `/anime search:<title>` (Prefix: `!anime <title>`)
- `/manga search:<title>` (Prefix: `!manga <title>`)
- `/anime-character search:<name>` (Prefix: `!anime-character <name>`, `!character <name>`)
  - Flow: search, then a `StringSelectMenu` with up to 10 results, then a detail embed. The menu stays under the detail embed so the invoker can pick another result. Only the invoker can use the menu. It is removed after 2 minutes without use.
  - Data source: MyAnimeList (through Jikan v4) answers first, to keep 1.4.0 parity. If Jikan fails, AniList answers, and Jikan is skipped for 60 seconds so an outage does not slow every search. The embed author line names the source that answered.
  - Anime and manga detail fields: score, episodes or chapters/volumes, popularity (MAL rank or AniList member count), type, status, genres, start and end dates, age rating (MAL only), studios and producers (anime) or authors and serialization (manga).
  - Character detail fields: Japanese name, description, nicknames, favourites, anime, manga, and Japanese voice actors.
  - Adult entries are excluded unless the channel is age-restricted. Search results are cached in memory for 10 minutes.
  - Service: `AnimeSearchService` in `packages/services/src/anime`, exposed as `services.animeSearchService`.

### 6.2. Waifu Images (`/waifu`)
- `/waifu` (Prefix: `!waifu`)
  - Sends a random SFW image from waifu.im (`/images` endpoint, API v7). The embed matches 1.4.0: tags, favorite count, and the artist with a link. The footer points to `/tcg-info`.
  - **Another one** button: regenerates the image. Only the invoker can use it. The bot asks for 10 random images and prefers one the user has not seen yet, because waifu.im repeats its random pick for a few seconds.
  - Uses the `waifu` tag. 1.4.0 used `selfies`, but only 3 SFW images carry that tag today.

### 6.3. Anime Wallpapers (`/wallpaper`)
- `/wallpaper search:<keyword>` (Prefix: `!wallpaper <keyword>`, `!wallpapers`)
  - Same interactive flow as 1.4.0:
    1. A menu to pick a source.
    2. 3 random wallpapers from that source.
    3. A menu with **Load another wallpaper**, **Select another source**, and **No, I am done**.
  - Improvements over 1.4.0:
    - One message is edited in place instead of stacking follow-up menus.
    - Wallpapers already shown are never repeated, and the next page is fetched only when needed.
    - A failing source leads back to the source menu with an explanation.
    - Only the invoker can use the menus.
  - Sources: all three use documented JSON APIs and are SFW-only.
    - **WallHaven** (anime category, SFW purity).
    - **Zerochan** (JSON API, identifying User-Agent).
    - **Konachan** (konachan.net, `rating:safe`).
  - Dropped 1.4.0 sources:
    - Wallpapers.com: no API, and its search pages mix unrelated images.
    - MoeWalls: behind a Cloudflare challenge.
    - Pinterest: rejects API requests.
  - Service: `WallpaperService` (`packages/services/src/anime/wallpaper.service.ts`), exposed as `services.wallpaperService`.
