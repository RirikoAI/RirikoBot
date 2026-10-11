# Waifu TCG

The Waifu TCG is a card game inside Ririko. Members collect anime character cards, equip them with gear, fight in a dungeon tower, trade cards and join WaifuGuilds. This page is for server admins and bot owners. Players should read the [player guide](tcg-player-guide.md).

## 1. What It Does

- Cards drop in chat. Members claim them.
- Each card has a rarity, an element, stats and a skill.
- Members fight in duels, expeditions, world boss raids and a dungeon tower.
- Fights use **energy**. Energy refills each day.
- Members trade cards, sell them on a market and form WaifuGuilds.
- Achievements pay out rewards.

A member's cards, energy, items and progress are the same on every server. Card drops and the TCG Manager Role are set for each server.

## 2. Turn It On

### 2.1. For the Host

The card pool and the boss list are not in the database at first. Load them once. Follow section 6 of [SETUP.md](../SETUP.md). It builds the cards (`pnpm tcg:card-builder --rerender`) and the bosses (`pnpm tcg:boss-builder --all`). In Docker, the steps are in [deployment.md](deployment.md).

### 2.2. For the Server Admin

Card drops are off until you turn them on.

1. Open the dashboard **Waifu TCG** page. See [dashboard.md](dashboard.md).
2. Turn on **Card drops**.
3. Optional: pick a **Drop channel**.
4. Adjust the other settings in section 3.
5. Save.

You can also run `/tcg-admin action:drops enabled:true`.

Members can use the other card commands (`/cards`, `/dungeon`, `/game`) without any setup.

## 3. Card Drops

As members chat, Ririko drops a card. The first member to claim it keeps it.

| Setting | Default | Range | What it does |
|---|---|---|---|
| Card drops | Off | On or off | Turns drops on or off for this server. |
| Drop channel | Empty | A channel | Only messages in this channel count, and cards drop here. With none, every channel counts, and the card drops where the last message was. |
| Members before a drop | 50 | 5 to 500 | How many different members must chat before a card drops. Spam messages do not count. |
| Drops start at (hour) | 8 | 0 to 23 | The first hour of the day when drops can happen, in the server time zone. |
| Drops stop at (hour) | 23 | 0 to 23 | An end before the start runs past midnight. The same hour as the start means all day. |
| Claim window (seconds) | 60 | 15 to 600 | How long a drop can be claimed. |
| Repeat-claim cooldown (minutes) | 5 | 0 to 60 | The member who claimed the last drop must wait this long to claim again. |
| TCG Manager Role | None | A role | Members with this role can change the drop settings with `/tcg-admin`, without Manage Server. |

The server time zone is on the dashboard **General** page.

A member claims a drop with `/card action:claim` (or `!card claim`).

## 4. Commands

### 4.1. `/tcg-admin`

Aliases: `tcgadmin`, `tcgconfig`. This is a per-server command.

| Action | Options | Who can use it |
|---|---|---|
| `view` | None | The TCG Manager Role, Manage Server or Administrator. Shows this server's drop settings, the role and the global rules. |
| `drops` | `enabled`, `channel`, `threshold`, `start_hour`, `end_hour`, `claim_seconds`, `cooldown_minutes` | The TCG Manager Role, Manage Server or Administrator. |
| `role` | `role` (a role, a role ID, or `none` to clear) | Manage Server or Administrator. |
| `energy` | `max_cap`, `base_capacity`, `level_scaling`, `pot_limit`, `bonus_cap`, `bonus_increment` | Bot owners only. Works in direct messages. |
| `market` | `tax_percent`, `listing_days` | Bot owners only. Works in direct messages. |

The `energy` and `market` actions change rules for every server (section 5).

### 4.2. Player Commands

The player guide explains these in detail. This is the full list of their options.

**`/card`** (alias `tcg`)

| Option | What it does |
|---|---|
| `action` | `collection`, `inspect`, `claim`, `favorite`, `equip`, `dismantle`, `gear`, `loadout`, `equip-gear`, `unequip-gear`, `unequip-all` or `guide`. |
| `id` | A card ID or serial number. |
| `filter` | For `collection`: an element (`FIRE`, `ICE`, `EARTH`, `LIGHTNING`, `WATER`, `LIGHT`, `SHADOW`) or a rarity (`MYTHIC`, `SIR`, `SECRET_RARE`, `ULTRA_RARE`, `SUPER_RARE`, `RARE`). |
| `sort` | For `collection`: `level`, `rarity` or `name`. |
| `drop_id` | For `claim`: a drop ID. Normally not needed. |
| `item_id` | For `equip-gear` and `unequip-gear`: an inventory item ID. |
| `slot` | `WEAPON`, `ARMOR`, `RELIC`, `RING`, `AMULET` or `TALISMAN`. |

**`/cards`** (aliases `album`, `mycards`): `filter` (as above), `sort` (`level`, `rarity`, `name` or `battles`), `page`.

**`/game`** (aliases `battle`, `duel`, `tcggame`)

| Option | What it does |
|---|---|
| `action` | `pvp`, `explore`, `boss`, `quests`, `shop` or `buy`. |
| `user` | For `pvp`: the player to fight. |
| `wager` | For `pvp`: credits at stake. |
| `duration` | For `explore`: `1h`, `4h` or `8h`. |
| `subaction` | For `explore`: `start`, `claim` or `status`. For `boss`: `attack` or `status`. For `quests`: `list` or `claim`. |
| `quest_id` | For `quests claim`: the quest. |
| `item`, `quantity` | For `buy`: an item code and how many. |

**`/item`** (aliases `tcgitem`, `items`)

| Option | What it does |
|---|---|
| `action` | `inventory`, `enhance`, `use` or `craft`. |
| `id` | An inventory item ID, to enhance or use. |
| `filter` | For `inventory`: `EQUIPMENT`, `ACCESSORY` or `CONSUMABLE`. |
| `card_id` | For `use`: the card that takes a potion. |
| `recipe`, `quantity` | For `craft`: a recipe code and how many (1 to 10). |

**`/craft`** (aliases `forge`): `recipe`, `quantity` (1 to 10). With no recipe, it opens the crafting menu.

**`/loadout`** (aliases `gear`, `equipment`): `card_id`. Defaults to your active card.

**`/dungeon`** (aliases `tower`, `climb`, `spire`)

| Option | What it does |
|---|---|
| `action` | `status`, `climb`, `floor`, `leaderboard` or `tutorial`. |
| `floor_number` | For `floor` and `climb`: the floor. |
| `mode` | For `climb`: `manual` (you pick each move) or `auto` (you watch). |

**`/trade`** (aliases `cardtrade`, `tcgtrade`): `action` (`request`, `accept`, `reject`, `cancel`, `view` or `list`), `user`, `offered_card_id`, `requested_card_id`, `offered_credits`, `requested_credits`, `trade_id`.

**`/market`** (aliases `marketplace`, `tcgmarket`): `action` (`browse`, `list`, `buy`, `cancel` or `my-listings`), `card_id`, `price`, `listing_id`, `page`.

**`/waifuguild`** (aliases `wguild`, `guild`): `action` (`info`, `create`, `join`, `leave`, `deposit`, `members` or `leaderboard`), `name`, `amount`.

**`/achievement`** (aliases `ach`, `achievements`): `action` (`list` or `claim`), `code` (an achievement code, or `all`).

**`/tcg-info`** (aliases `tcginfo`, `tcgguide`, `tcg-guide`, `card-guide`, `waifu-guide`): `topic` (`overview`, `starter`, `elements`, `gear`, `crafting`, `tutorial`, `dungeon`, `trade`, `market`, `guild`, `achievements`).

## 5. Global Rules (Bot Owners)

These rules are the same on every server. Bot owners change them in one of three ways:

- The dashboard owner console, **Waifu TCG** page. It needs a passkey. See [dashboard.md](dashboard.md).
- `/tcg-admin action:energy` and `/tcg-admin action:market`.
- `ririko tcg:rules [key] [value]`.

| Rule | Default | Range |
|---|---|---|
| Market tax (%) | 5 | 1 to 20 |
| Listing time (days) | 7 | 1 to 30 |
| Global energy cap | 300 | 100 to 1000 |
| Base energy capacity | 100 | 50 to 200 |
| Energy added for each level | 2 | 1 to 5 |
| Energy potions each day | 3 | 1 to 10 |
| Most bonus energy a player can keep | 50 | 0 to 500 |
| Bonus energy added at each daily reset | 5 | 0 to 50 |

Ririko applies a change within about 30 seconds.

Other owner console pages:

- **Dungeon.** Seasons (dates, theme, difficulty curve, affixes), bosses (stats, skill, wards, enrage) and floor loot. A season that starts later takes over on its start date.
- **TCG items.** The items of the town shop. You can change price, whether it is on sale and the daily limit of built-in items. You can add custom gear.
- **Achievements.** The title, text, tier, XP, credits, title and badge of each achievement, and whether it is hidden. Requirements and reward items cannot change.

## 6. Daily Reset

Energy, the energy potion limit and the town shop use the daily reset time. The default is 00:00 in GMT+8. The host can change it. See section 9 of [economy.md](economy.md).

## 7. Image Credit and Removal

Every card shows `Image source: waifu.im` in its footer. If an artist asks for an image to be removed, the operator marks it as removed. The card then shows a plain silhouette. Players keep the card, its stats and its trade value.

## 8. Tools for Hosts

| Command | What it does |
|---|---|
| `pnpm tcg:card-builder` | Builds and renders the card pool. See [SETUP.md](../SETUP.md). |
| `pnpm tcg:boss-builder` | Builds and imports the dungeon bosses. |
| `pnpm tcg:reset-user <user_id>` | Removes all of one user's cards, items, dungeon progress, energy and achievements, so they can start again. |
| `pnpm tcg:simulate` | Estimates win rates for each dungeon floor. For balance work. |

Design notes for these tools are in [archive/waifu-tcg-design.md](archive/waifu-tcg-design.md).

## 9. Limits

- Cards and progress cannot move between members, except by trade and market.
- A card that wears gear cannot be traded or sold. Empty its gear first.
- A server cannot change the market tax, the energy rules or the dungeon. Only bot owners can.
- Guild levels do not rise yet. See [tcg-player-guide.md](tcg-player-guide.md).
