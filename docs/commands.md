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
- `/card equip-gear <card_id> <item_id> [slot]`
  - Equips a weapon, armor, relic, ring, amulet, or talisman to an active combat waifu card.
  - Automatically locks the equipped gear (`state = 'EQUIPPED'`) from market sale or trading.
- `/item use <item_id> [quantity]`
  - Consumes an item from inventory (HP Potion, Mana Draught, Energy Restore).
  - For Energy Restores: Enforces the daily consumption limit (e.g. max 3/day).

### 5.4. Player Energy & Stamina
- `/energy status`
  - Displays current energy, maximum level-scaled capacity, time until next 00:00 UTC replenishment, and remaining daily energy potions available.

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
