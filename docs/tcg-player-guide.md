# Waifu TCG Player Guide

Welcome to the Waifu TCG. You collect anime character cards, give them gear and fight in a dungeon tower. You can also trade cards, sell them on a market and join a WaifuGuild. This guide shows you how to start and how each part works.

Server admins should read [waifu-tcg.md](waifu-tcg.md) to turn on card drops.

## 1. Start Here

1. Run `/dungeon action:tutorial`. This is free. If you have no cards, Ririko gives you a starter card. It also gives you a **Novice Blade** and 3 **Minor HP Potions**. Finish all 4 tutorial floors to unlock the tower.
2. Run `/cards` to see your album.
3. Chat in your server. Cards drop from time to time. Claim one with `/card action:claim`.
4. Run `/dungeon action:status` to see your energy and the next floor.
5. Run `/dungeon action:climb` to fight.

You can also run `/tcg-info` for an in-game guide.

### 1.1. Ways to Get Cards

- **The tutorial.** One starter card, if you have none.
- **Chat drops.** Ririko drops a card after enough members chat. Use `/card action:claim` before the time runs out (60 seconds by default). If you claimed the last drop, you wait a few minutes before you can claim again (5 minutes by default).
- **The market.** Buy cards from other players with credits. See section 9.
- **Trades.** Swap cards with a friend. See section 8.
- **Achievements.** Some achievements give cards. See section 11.

## 2. Cards

Each card has a rarity, an element, stats, a skill and a serial number, such as `#0042/1000`.

| Rarity | Drop chance | Stat multiplier | Highest level | Dust when dismantled |
|---|---|---|---|---|
| Common | 60% | 1.0x | 20 | 10 |
| Uncommon | 20% | 1.2x | 30 | 25 |
| Rare | 10% | 1.5x | 40 | 75 |
| Super Rare (SR) | 6% | 1.9x | 50 | 200 |
| Ultra Rare (UR) | 3% | 2.5x | 60 | 500 |
| Secret Rare (SEC) | 0.9% | 3.2x | 70 | 1,200 |
| Special Illustration Rare (SIR) | 0.09% | 4.0x | 85 | 3,000 |
| Mythic | 0.01% | 5.0x | 100 | 10,000 |

Stats:

- **HP.** Health.
- **ATK.** Attack power.
- **DEF.** Defense.
- **SPD.** Speed. A faster card moves first.
- **CRIT.** The chance of a critical hit.
- **MP.** Mana. A skill costs MP.

### 2.1. Card Commands

| What you want | Command |
|---|---|
| See your album, with pages and buttons | `/cards` (options `filter`, `sort`, `page`) |
| See your cards as a list | `/card action:collection` |
| See one card and its picture | `/card action:inspect id:<card>` |
| Pick your active card | `/card action:equip id:<card>` |
| Protect a card from sale and dismantling | `/card action:favorite id:<card>` |
| Turn a card into Crafting Dust | `/card action:dismantle id:<card>` |

An **ID** can be the card ID or the serial number. Your **active card** is the one that fights for you in duels, expeditions, raids and the dungeon. If you have no active card, Ririko uses your first card.

Dismantling deletes the card. You get Crafting Dust (see the table above). The gear on the card goes back to your bag. You cannot dismantle a favorite card, your active card, or a card in a trade or a market listing.

## 3. Elements

There are 7 elements. A strong element hits harder.

- **Fire** is strong against **Ice**.
- **Ice** is strong against **Earth**.
- **Earth** is strong against **Lightning**.
- **Lightning** is strong against **Water**.
- **Water** is strong against **Fire**.
- **Light** and **Shadow** are strong against each other.

| Hit | Damage |
|---|---|
| Strong element | 1.5x |
| Weak element (the loop run backwards) | 0.75x |
| Light against Shadow, or Shadow against Light | 1.5x |

Elements also cause effects:

| Element | Effect |
|---|---|
| Fire | **Burn.** Deals damage over time (10% of ATK each turn). |
| Ice | **Chill and Freeze.** Lowers speed by 25%. Has a 15% chance to make the target skip a turn. |
| Earth | **Fortify.** Raises defense by 20%. |
| Lightning | **Surge.** Adds 15% crit chance. |
| Water | **Purify and Flow.** Heals 8% of max HP each turn. |
| Light | **Radiance.** Adds 15% ATK, and attacks pierce shields. |
| Shadow | **Decay and Leech.** Heals you for 20% of the damage you deal. |

## 4. Energy

Fights cost **energy**. Energy refills once each day at the daily reset (00:00 GMT+8 by default).

Your energy cap depends on your level (the level of your XP added together across all servers, see [economy.md](economy.md)):

`cap = 100 + 2 x (level - 1) + bonus`, up to 300.

| Level | Bonus |
|---|---|
| 10 to 24 | +5 |
| 25 to 49 | +15 |
| 50 to 74 | +30 |
| 75 to 99 | +50 |
| 100 | +75 |

Level 1 has 100 energy. Level 50 has 228. The most is 300. The bot owner can change these values.

You can see your energy with `/energy`. It also shows your bonus energy, the energy potions you used today and when the next refill comes. It works in servers and in direct messages.

### Bonus energy

Bonus energy adds to your cap. You get +5 at each daily reset, and you keep it up to 50. The bonus is part of your pool, so it refills with the rest of your energy at each reset. The bot owner can change both values.

What things cost:

| Activity | Energy |
|---|---|
| Tutorial floors | 0 |
| Dungeon floors 1 to 10 | 10 |
| Dungeon floors 11 to 25 | 15 |
| Dungeon floors 26 to 40 | 20 |
| Dungeon floors 41 and up | 25 |
| PvP duel | 5 |
| World boss attack | 30 |
| Expedition, 1 hour | 10 |
| Expedition, 4 hours | 25 |
| Expedition, 8 hours | 45 |
| Adventure | 15 |

Energy items:

- `candy_minor` restores 20 energy. The shop sells 1 each day.
- `stamina_potion` restores 50 energy.
- The TCG town shop sells a Daily Energy Biscuit (1 each day).
- You can use only 3 energy potions each day.

Buy and use them with `/shop` and `/use`. See [economy.md](economy.md).

## 5. Gear

Each card has 6 gear slots.

| Slot | Gives |
|---|---|
| Weapon | Attack and crit |
| Armor | HP and defense |
| Relic | Speed, mana and elemental power |
| Ring | Attack and crit |
| Amulet | HP, defense and resistance |
| Talisman | Speed, mana and special effects |

### 5.1. Equip Gear

The easiest way is the gear menu.

1. Run `/loadout card_id:<card>`. With no card, it opens your active card.
2. Pick the slot and the item. The menu shows how your stats change.
3. Click **Equip**.

The menu also has **Unequip**, **Enhance** and **Unequip All** buttons.

You can also use commands:

- `/card action:equip-gear id:<card> item_id:<item> slot:<slot>`
- `/card action:unequip-gear id:<card> slot:<slot>`
- `/card action:unequip-all id:<card>`. With no card, it unequips gear from every card.

### 5.2. Your Items

- `/item action:inventory` lists your items. Use `filter` to show only `EQUIPMENT`, `ACCESSORY` or `CONSUMABLE`.
- `/item action:use id:<item> card_id:<card>` drinks a potion. HP and mana potions heal a card.

### 5.3. Enhance

You can raise a piece of gear from +0 to +10. Each level costs Crafting Dust and credits:

- Dust: `25 x new level x rarity factor`
- Credits: `200 x new level x rarity factor`

| Rarity | Factor |
|---|---|
| Common | 1.0 |
| Uncommon | 1.2 |
| Rare | 1.5 |
| Super Rare | 2.0 |
| Ultra Rare | 3.0 |
| Secret Rare | 4.0 |
| Special Illustration Rare | 5.0 |
| Mythic | 8.0 |

Enhancing never fails. Each level adds 8% to the base stats. The special effect of an item gets stronger at +5 and again at +10.

Run `/item action:enhance id:<item>`, or use the **Enhance** button in `/loadout`.

### 5.4. Crafting

Crafting makes a piece of gear when you spend Crafting Dust and credits. Open the menu with `/craft`, or name a recipe: `/craft recipe:<code> quantity:<number>`.

- A recipe code can be the full code (`CRAFT_WEAPON_OBSIDIAN_KATANA`) or the item code (`WEAPON_OBSIDIAN_KATANA`). Capital letters do not matter.
- Gear is crafted one at a time. Potions can be crafted up to 10 at a time.
- Most recipes need one piece of the previous tier of the same slot. Ririko uses the piece with the lowest enhancement first. Gear on a card is never used.
- A recipe unlocks when you clear a floor in the dungeon. The unlock floor is in the table.
- Boss signature gear, the Elixir of Full Vitality, Cosmic Ether and energy items cannot be crafted.

| Output | Slot | Rarity | Unlock floor | Dust | Credits | Needs |
|---|---|---|---|---|---|---|
| Obsidian Katana | Weapon | Rare | 10 | 60 | 1,750 | None |
| Solar Lance | Weapon | Super Rare | 20 | 200 | 4,375 | Obsidian Katana |
| Crimson Calamity | Weapon | Ultra Rare | 30 | 1,200 | 17,500 | Solar Lance |
| World Breaker | Weapon | Mythic | 45 | 8,000 | 43,750 | Crimson Calamity |
| Magma-Forged Mail | Armor | Rare | 10 | 90 | 2,625 | None |
| Dragonscale Plate | Armor | Super Rare | 20 | 240 | 5,250 | Magma-Forged Mail |
| Aegis Barrier | Armor | Ultra Rare | 30 | 960 | 14,000 | Dragonscale Plate |
| Eternal Crucible Plate | Armor | Secret Rare | 40 | 3,200 | 35,000 | Aegis Barrier |
| Cinder Lantern | Relic | Rare | 10 | 90 | 2,625 | None |
| Phoenix Ash Censer | Relic | Super Rare | 20 | 320 | 7,000 | Cinder Lantern |
| Chronos Hourglass | Relic | Ultra Rare | 30 | 1,200 | 17,500 | Phoenix Ash Censer |
| Phoenix Feather | Relic | Special Illustration Rare | 40 | 4,000 | 35,000 | Chronos Hourglass |
| Ring of the Blazing Sun | Ring | Rare | 10 | 72 | 2,100 | None |
| Solar Flare Ring | Ring | Super Rare | 20 | 320 | 7,000 | Ring of the Blazing Sun |
| Inferno Crown Ring | Ring | Ultra Rare | 30 | 1,200 | 17,500 | Solar Flare Ring |
| Sunforged Sigil | Ring | Secret Rare | 40 | 3,200 | 35,000 | Inferno Crown Ring |
| Heart of the Mountain Amulet | Amulet | Rare | 10 | 72 | 2,100 | None |
| Obsidian Heart Amulet | Amulet | Super Rare | 20 | 320 | 7,000 | Heart of the Mountain Amulet |
| Magma Core Amulet | Amulet | Ultra Rare | 30 | 1,200 | 17,500 | Obsidian Heart Amulet |
| Primordial Flame Amulet | Amulet | Secret Rare | 40 | 3,200 | 35,000 | Magma Core Amulet |
| Windwalker Talisman | Talisman | Rare | 10 | 72 | 2,100 | None |
| Emberstep Talisman | Talisman | Super Rare | 20 | 320 | 7,000 | Windwalker Talisman |
| Tempest Feather | Talisman | Ultra Rare | 30 | 1,200 | 17,500 | Emberstep Talisman |
| Ashen Wings | Talisman | Secret Rare | 40 | 3,200 | 35,000 | Tempest Feather |
| Major HP Potion | Potion | Rare | 5 | 12 | 350 | 3 Minor HP Potions |
| Greater Mana Potion | Potion | Rare | 5 | 15 | 438 | 3 Mana Draughts |

Where to get Crafting Dust: dismantle cards, clear dungeon floors, send expeditions, claim quests and finish adventures.

### 5.5. Town Shop

Run `/game action:shop` to see the town shop. Buy with `/game action:buy item:<code> quantity:<number>`. Stock changes at the daily reset.

| Item | Price | Daily limit |
|---|---|---|
| Novice Blade | 100 | 5 |
| Scout Boomerang | 250 | 3 |
| Iron Hauberk | 120 | 5 |
| Wooden Buckler | 100 | 5 |
| Ember Charm | 150 | 3 |
| Copper Band | 80 | 5 |
| Leather Choker | 80 | 5 |
| Simple Bangle | 80 | 5 |
| Minor HP Potion | 50 | 10 |
| Mana Draught | 60 | 10 |
| Daily Energy Biscuit | 300 | 1 |

Each day the shop also sells 2 rare pieces of gear that normally only drop in the dungeon. They cost 1.5 times their normal price, and you can buy 1 of each. Bot owners can change prices and limits.

## 6. Dungeon Tower

The dungeon is a tower of floors with a boss on some of them. Each season has a theme, a set of rules and new bosses.

### 6.1. The Tutorial

You must clear 4 tutorial floors before you climb the tower. They cost no energy.

1. **T1.** Learn elements.
2. **T2.** Learn mana and skills.
3. **T3.** Learn potions. You get 5 Minor HP Potions and 5 Mana Draughts the first time.
4. **T4.** Learn how to break ward shields.

Run `/dungeon action:tutorial`, or `/dungeon action:climb`. At the end you get your starter gear, and the achievement **Journey Begins**.

### 6.2. Season 1: Infernal Crucible

Season 1 has 50 floors and lasts 90 days. Its theme is Fire.

- **Scorched Earth.** Your cards lose 6% of their max HP every 2 turns. An Earth shield or a Water purify blocks it.
- **Heat Haze.** Cards that are not Fire lose 15% crit chance.

Every 5th floor has a mini-boss. Every 10th floor has a major boss. Each boss is an anime character.

### 6.3. Fight

1. Run `/dungeon action:status` to see your energy and the next floor.
2. Run `/dungeon action:climb`. You can set `mode:manual` (you pick each move) or `mode:auto` (you watch).
3. In manual mode, you have these buttons: **Attack** (+15 MP), **Skill** (costs MP), **Defend** (+10 MP), **Auto** and **Forfeit**. A menu lets you use a potion.
4. After a win, you get loot and the next floor opens.

Other options:

- `/dungeon action:floor floor_number:<number>` shows the enemies, the energy cost and the drops of a floor.
- `/dungeon action:leaderboard` shows the top climbers.

### 6.4. Tips

- **Match elements.** A strong element deals 1.5x damage.
- **Break wards.** Later bosses have shield layers with an element. A hit with a different element does only a little damage (25% in seasons). Use the matching element.
- **Do not stall.** If a boss fight runs long, the boss gets angry and grows stronger each turn.
- **Pity Blessing.** After each defeat on a floor, your next try gets +10% ATK, DEF and HP, up to +30%. It resets when you clear the floor. A forfeit does not count.
- **Energy refund.** A defeat on floors 1 to 10 gives back half of the energy.
- **Stars.** A clear gives 1 star. Add 1 star for 8 turns or fewer. Add 1 star for no potions. Your first 3-star clear of a floor gives you `floor x 10` Crafting Dust.

### 6.5. Loot

Every clear pays Crafting Dust. The gear depends on the floor:

| Floors | Gear that can drop |
|---|---|
| 1 to 9 | Shop-tier gear and potions |
| 10 to 19 | Rare gear |
| 20 to 29 | Super Rare gear |
| 30 to 39 | Ultra Rare gear |
| 40 and up | Secret Rare gear and better |

The first clear of a normal floor always drops one piece of gear. Repeat clears drop gear 35% of the time. Boss floors give signature gear the first time, and 8% of the time after that. Bot owners can change the loot of a floor.

## 7. Other Ways to Play

All of these use your active card (or your first card).

### 7.1. PvP Duel

`/game action:pvp user:@friend wager:100`

- It costs 5 energy.
- The duel starts at once. Your friend does not need to accept.
- With a wager, the winner takes the credits of the loser. Both of you need enough credits in your wallets.
- A draw returns everything.

### 7.2. Expeditions

Send a card to explore and come back later.

1. Run `/game action:explore subaction:start duration:1h` (or `4h`, `8h`).
2. Wait.
3. Run `/game action:explore subaction:claim`.

`/game action:explore` with no subaction shows your expeditions.

| Duration | Energy | Credits | Dust | Chance of a card shard |
|---|---|---|---|---|
| 1 hour | 10 | 150 to 300 | 10 to 25 | 15% |
| 4 hours | 25 | 400 to 800 | 50 to 100 | 35% |
| 8 hours | 45 | 1,000 to 2,500 | 150 to 300 | 70% |

### 7.3. World Boss

All players fight one shared boss.

- `/game action:boss` shows the boss, its HP and the top 5 players.
- `/game action:boss subaction:attack` attacks. It costs 30 energy and pays raid badges, credits and Crafting Dust.

### 7.4. Quests

`/game action:quests` lists your quests. Claim a finished quest with `/game action:quests subaction:claim quest_id:<id>`.

| Quest ID | What to do | Reward |
|---|---|---|
| `daily_pvp_win` | Win 1 PvP duel | 200 credits, 20 dust |
| `daily_expedition_complete` | Finish 1 expedition | 150 credits, 15 dust |
| `daily_chat_drop_claim` | Claim 1 card drop | 100 credits, 10 dust |
| `weekly_boss_raid_damage` | Deal 5,000 damage to the world boss | 1,000 credits, 100 dust and a ticket |

## 8. Trading

You can trade a card and credits with another player. A trade has one card on each side at most.

1. Make an offer: `/trade action:request user:@friend offered_card_id:<your card> requested_card_id:<their card> offered_credits:0 requested_credits:0`.
2. Your friend checks it: `/trade action:view trade_id:<id>`.
3. Your friend accepts: `/trade action:accept trade_id:<id>`. Or rejects: `/trade action:reject trade_id:<id>`.
4. You can cancel before they answer: `/trade action:cancel trade_id:<id>`.

`/trade action:list` shows your trades.

Rules:

- A trade needs at least one card or some credits.
- You cannot trade with yourself.
- A card in a trade is locked. You cannot dismantle it, sell it or change its gear.
- A card must not be your active card, must not be a favorite, and must have no gear. Change your active card first if you want to trade it.
- The cards and credits change owner in one step. If one side cannot pay, nothing changes.

## 9. Market

The market lets players sell cards for credits.

- List a card: `/market action:list card_id:<card> price:<credits>`.
- Browse: `/market action:browse page:1`.
- Buy: `/market action:buy listing_id:<id>`.
- Cancel your listing: `/market action:cancel listing_id:<id>`.
- See your listings: `/market action:my-listings`.

Rules:

- The price must be a whole number above 0.
- A listed card is locked. It must not be your active card or a favorite, and it must have no gear.
- The seller pays a 5% tax when the card sells. The seller gets the price minus the tax. Bot owners can change the tax from 1% to 20%.
- A listing ends after 7 days. The card goes back to the seller. Bot owners can change this from 1 to 30 days.
- You cannot buy your own card.

## 10. WaifuGuilds

A WaifuGuild is a team of players. It is not a Discord server.

| Command | What it does |
|---|---|
| `/waifuguild action:create name:<name>` | Makes a guild. The name has 3 to 32 characters and the fee is 5,000 credits. |
| `/waifuguild action:info name:<name>` | Shows a guild. With no name, it shows yours. |
| `/waifuguild action:join name:<name>` | Joins a guild. |
| `/waifuguild action:leave` | Leaves your guild. |
| `/waifuguild action:deposit amount:<credits>` | Puts credits in the guild bank. |
| `/waifuguild action:members` | Lists members. |
| `/waifuguild action:leaderboard` | Shows the top guilds. |

- You can be in one guild at a time.
- A guild with level L holds up to `10 + 2 x L` members. A new guild has level 1, so it holds 12.
- The guild bank holds credits. You cannot take credits out yet.
- Guild levels do not rise yet. No activity gives guild XP in this version.

## 11. Achievements

Run `/achievement action:list` to see your progress. Claim a reward with `/achievement action:claim code:<code>`, or `code:all`.

| Code | Track | Tier | What to do | Reward |
|---|---|---|---|---|
| `TUTORIAL_COMPLETE` | Combatant | Bronze | Finish the tutorial | 250 XP, 1,000 credits, 3 Minor HP Potions |
| `COLL_INITIATE` | Collector | Bronze | Own 10 unique cards | 500 XP, 1,000 credits, 2 Minor HP Potions |
| `COLL_ELEMENTAL` | Collector | Silver | Own a card of each of the 7 elements | 1,500 XP, 5,000 credits, the title Prismatic Adept |
| `COLL_MYTHIC_LEGEND` | Collector | Mythic | Own a Mythic card | 10,000 XP, 50,000 credits, a Celestial Ambrosia, the title Celestial Architect |
| `BATTLE_FIRST_BLOOD` | Combatant | Bronze | Win a PvP duel | 250 XP, 500 credits, a Mana Draught |
| `BATTLE_DUNGEON_50` | Combatant | Gold | Clear floor 50 | 5,000 XP, 20,000 credits, 2 Grand Stamina Flasks, the title Abyssal Conqueror |
| `BATTLE_BOSS_SLAYER` | Combatant | Platinum | Deal 1,000,000 damage to raid bosses | 8,000 XP, 35,000 credits, the title Dragonbane |
| `CRAFT_MASTER_FORGE` | Blacksmith | Gold | Enhance any gear to +10 | 4,000 XP, 15,000 credits, 500 Crafting Dust, the title Master Blacksmith |
| `DEVOTION_STREAK_30` | Devotion | Gold | Keep a 30-day `/daily` streak | 6,000 XP, 25,000 credits, 3 Grand Stamina Flasks, the title Unyielding Flame |

Bot owners can change the text and rewards of achievements. The XP counts toward your account level. Titles show on your profile card.

## 12. Quick Reference

| Command | What it does |
|---|---|
| `/tcg-info [topic]` | Opens the in-game guide. |
| `/cards` | Opens your album. |
| `/card action:claim` | Claims a chat drop. |
| `/card action:inspect id:<card>` | Shows a card. |
| `/card action:equip id:<card>` | Sets your active card. |
| `/card action:favorite id:<card>` | Protects a card. |
| `/card action:dismantle id:<card>` | Turns a card into dust. |
| `/loadout [card_id]` | Opens the gear menu. |
| `/item action:inventory` | Lists your items. |
| `/item action:enhance id:<item>` | Enhances gear. |
| `/craft [recipe]` | Crafts gear and potions. |
| `/dungeon action:tutorial` | Starts the tutorial. |
| `/dungeon action:status` | Shows your energy and next floor. |
| `/energy` | Shows your energy, bonus energy and next refill. |
| `/dungeon action:climb` | Fights the next floor. |
| `/game action:pvp user:@friend` | Duels a player. |
| `/game action:explore subaction:start duration:1h` | Starts an expedition. |
| `/game action:boss subaction:attack` | Attacks the world boss. |
| `/game action:quests` | Lists quests. |
| `/game action:shop` | Opens the town shop. |
| `/trade action:request user:@friend` | Offers a trade. |
| `/market action:browse` | Browses the market. |
| `/waifuguild action:info` | Shows your guild. |
| `/achievement action:list` | Shows achievements. |
