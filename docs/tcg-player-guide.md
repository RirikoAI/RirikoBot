# Waifu TCG 2.0 — Complete Player Guide & Strategy Handbook

Welcome to the **Ririko Waifu Trading Card Game (TCG)**! This handbook is the definitive guide for new summoners and seasoned veterans alike, detailing everything from acquiring your very first waifu card to conquering the 100-floor Seasonal Dungeon Tower, trading with other players, running a WaifuGuild, and dominating the community marketplace.

---

## Table of Contents
1. [Getting Started & Your First Card](#1-getting-started--your-first-card)
2. [The Prologue Tutorial vs. The Seasonal Tower](#2-the-prologue-tutorial-vs-the-seasonal-tower)
3. [7-Element Affinity Matrix & Status Effects](#3-7-element-affinity-matrix--status-effects)
4. [Equipments, Accessories & The +10 Enhancement System](#4-equipments-accessories--the-10-enhancement-system)
5. [PvE Seasonal Dungeon Tower (S1: Infernal Crucible)](#5-pve-seasonal-dungeon-tower-s1-infernal-crucible)
6. [Peer-to-Peer (P2P) Trading System](#6-peer-to-peer-p2p-trading-system)
7. [Community Player Marketplace & 5% Tax Sink](#7-community-player-marketplace--5-tax-sink)
8. [WaifuGuilds & Factions](#8-waifuguilds--factions)
9. [Achievements & Multi-Asset Rewards](#9-achievements--multi-asset-rewards)
10. [Command Quick Reference Cheat Sheet](#10-command-quick-reference-cheat-sheet)

---

## 1. Getting Started & Your First Card

Before you can fight in duels, embark on expeditions, or climb the dungeon tower, you need at least **one combat card** in your collection.

There are three ways to get cards in Ririko AI:

### A. The Starter Pack (Recommended First Step!)
The easiest and fastest way to start is by running the **Prologue Tutorial**:
```
/dungeon action:tutorial
# or
!dungeon tutorial
```
If you do not have any cards, this command **automatically gifts you a Starter Card**, equips you with a **Novice Blade** (+15 ATK), provides **3x Minor Health Potions**, and grants the `TUTORIAL_COMPLETE` achievement!

### B. Chat Drops (Free Cards Just for Chatting!)
As members chat in your Discord server, Ririko periodically drops random waifu cards directly into active text channels.
- When a drop appears, type:
  ```
  /card action:claim
  # or
  !card claim
  ```
- **Anti-Sniping Rule**: Card drops have an anti-sniping cooldown to give active chatters a fair chance.
- **Rarity Odds**: Standard drops follow the 8-tier rarity table:
  - **Common (C)**: 50.0%
  - **Uncommon (UC)**: 25.0%
  - **Rare (R)**: 12.0%
  - **Super Rare (SR)**: 7.0%
  - **Ultra Rare (UR)**: 4.0%
  - **Secret Rare (SEC)**: 1.5%
  - **Special Illustration Rare (SIR)**: 0.45%
  - **Mythic (MYTH)**: 0.05%

### C. Community Marketplace
You can also purchase cards listed by other players using your Discord credits:
```
/market action:browse
/market action:buy listing_id:<id>
```

---

## 2. The Prologue Tutorial vs. The Seasonal Tower

> [!IMPORTANT]
> **DO NOT** jump straight into `/dungeon climb` on Floor 1 before completing the tutorial!
> Floor 1 of Season 1 (Infernal Crucible) features aggressive fire-ashen fiends with environmental heat haze. Jumping in unprepared with a level 1 unequipped card will lead to swift defeat.

### The Tutorial Prologue (Floors T1–T4)
- **Command**: `/dungeon action:tutorial`
- **Energy Cost**: **0 Energy** (completely free!)
- **Encounter Breakdown**:
  - **T1: Target Dummy** (150 HP, 10 ATK) — Learn basic turn order and attacks.
  - **T2: Training Automaton** (300 HP, 20 ATK) — Learn skill activations and MP management.
  - **T3: Elemental Sprite** (450 HP, 35 ATK) — Learn elemental type advantage and weaknesses.
  - **T4: Novice Instructor** (600 HP, 50 ATK) — Test your skills before entering the real tower.
- **Completion Rewards**:
  - Starter Combat Waifu Card (if you have none)
  - `Novice Blade` (+15 ATK weapon gear)
  - `3x Minor Health Potions` (restore 150 HP each)
  - `TUTORIAL_COMPLETE` Achievement (+100 EXP, +250 Credits)

Once finished, equip your new blade and head into Season 1 with confidence!

---

## 3. 7-Element Affinity Matrix & Status Effects

Ririko 2.0 features **7 Combat Elements** (including the new **Ice** element). Elemental matchup is critical: hitting a weak element deals massive bonus damage, while attacking into resistance weakens your strikes.

### The Elemental Affinity Wheel
```
   ┌───────────────────────────────────────────────────────────┐
   │                                                           │
   │   FIRE ─────────► ICE ─────────► EARTH ─────────► LIGHTNING
   │    ▲                                                 │    │
   │    │                                                 ▼    │
   │    └────────────────── WATER ◄───────────────────────┘    │
   │                                                           │
   └───────────────────────────────────────────────────────────┘
               LIGHT ◄────────────────────────► SHADOW
```

1. **Fire** melts **Ice** (1.5x damage).
2. **Ice** shatters **Earth** (1.5x damage).
3. **Earth** grounds **Lightning** (1.5x damage).
4. **Lightning** conducts through **Water** (1.5x damage).
5. **Water** extinguishes **Fire** (1.5x damage).
6. **Disadvantage Multiplier**: Attacking backwards (e.g. Ice into Fire) deals **0.75x damage**.
7. **Light & Shadow (Polar Opposition)**: Light and Shadow strike each other with **2.0x mutual extreme damage**!

### Tactical Status Effects
Each element can inflict distinct tactical status conditions during combat:
- **Burn (Fire)**: Deals 5% max HP true damage each turn. Stacks up to 3 times.
- **Freeze / Chill (Ice)**: Reduces enemy Speed by 30%. At 2 stacks, targets freeze solid and lose their turn!
- **Fortify (Earth)**: Grants a damage mitigation barrier absorbing incoming physical damage.
- **Surge (Lightning)**: Increases Critical Strike Chance by 25% and grants bonus MP on attack.
- **Purify / Flow (Water)**: Cleanses negative status debuffs and provides minor health regeneration each turn.
- **Radiance (Light)**: Blinds targets, reducing their hit accuracy, while amplifying holy damage.
- **Decay / Leech (Shadow)**: Drains enemy HP and restores a portion back to the caster.

---

## 4. Equipments, Accessories & The +10 Enhancement System

A card's raw stats (HP, ATK, DEF, SPD, CRIT) are only half the battle. High-floor dungeon bosses require tailored gear.

### 6 Gear Slots
Each waifu card can equip up to **6 items**:
1. **Weapon**: Boosts Attack and Critical Rate (e.g. Novice Blade, Frostfang Dagger).
2. **Armor**: Boosts Health and Defense (e.g. Iron Breastplate, Dragon Scale Mail).
3. **Relic**: Boosts Speed, MP recovery, or elemental mastery.
4. **Ring**: Boosts Critical Damage and bonus Attack.
5. **Amulet**: Grants passive damage reduction or Max Health.
6. **Talisman**: Specialized perks (e.g. Phoenix Ward revive, Turn 1 shield).

### Gear Commands
- View card's equipped items:
  ```
  /card action:loadout id:<card_id>
  ```
- Equip an item to a card:
  ```
  /card action:equip-gear id:<card_id> item_id:<item_id>
  ```
- Unequip an item from a slot:
  ```
  /card action:unequip-gear id:<card_id> slot:<WEAPON|ARMOR|...>
  ```

### The +10 Enhancement System
Items can be refined from **+0 to +10** using **Crafting Dust** and **Credits**:
- **Where to get Crafting Dust**: Dismantle duplicate or unwanted cards using `/card action:dismantle id:<card_id>`.
- **Enhancement Scaling**: Each level increases base item stats:
  - `+1 to +3`: 100% success chance.
  - `+4 to +6`: +15% bonus stat scaling per level.
  - `+7 to +9`: Unlocks unique secondary battle perks (e.g., +5% Lifesteal, +10% Burn Resist).
  - `+10 Masterwork`: Unlocks glowing aura and a powerful card passive enhancement!

---

## 5. PvE Seasonal Dungeon Tower (S1: Infernal Crucible)

The Seasonal Dungeon Tower is Ririko's premier endgame PvE challenge, featuring **100 floors** of increasingly brutal tactical battles.

### Season 1 Theme & Environmental Affixes
- **Theme**: Fire / Ashen Inferno
- **Active Affixes**:
  - `SCORCHED_EARTH`: All non-Water and non-Ice combatants suffer 3% environmental burn each turn.
  - `HEAT_HAZE`: Reduces base hit accuracy by 10% unless wearing a protective Relic.

### Floor Progression & Energy Costs
Entering a dungeon floor consumes **Player Energy**:
| Floor Bracket | Energy Cost | Floor Type |
|---|---|---|
| **Tutorial (T1–T4)** | **0 Energy** | Prologue Training |
| **Floors 1–10** | **10 Energy** | Standard Grunt Floors |
| **Floors 11–25** | **15 Energy** | Elite Squads |
| **Floors 26–40** | **20 Energy** | Mini-Boss Encampments (1.75x Stats) |
| **Floors 41–50+** | **25 Energy** | Major Floor Bosses (3.2x Stats + Multi-Layer Wards) |

### Special Boss Mechanics
- **Multi-Layer Elemental Wards (Floors 20+)**: Bosses possess elemental shields that absorb all damage until broken by attacking with the **opposing element**!
- **Soft Enrage Clock (Turn 10+)**: If a battle extends past Turn 10, the boss goes berserk, gaining **+100% ATK per turn** and executing unblockable true damage strikes. You cannot stall forever; build sufficient DPS!

### Dungeon Commands
- Check season status, energy, and next floor:
  ```
  /dungeon action:status
  ```
- Battle the next floor:
  ```
  /dungeon action:climb
  ```
- Inspect a floor's enemies, recommended elements, and drops:
  ```
  /dungeon action:floor floor_number:<number>
  ```
- View top season climbers:
  ```
  /dungeon action:leaderboard
  ```

---

## 6. Peer-to-Peer (P2P) Trading System

Want to swap cards or buy a specific waifu from a friend? Use the atomic P2P trading system.

### How to Trade
1. **Propose a Trade**:
   ```
   /trade action:request target:@User offer_card_ids:card1,card2 request_card_ids:card3 offer_credits:1000 request_credits:0
   ```
2. **State Locking (`IN_TRADE`)**:
   As soon as a trade is proposed, all offered and requested cards are locked with `state = 'IN_TRADE'`. They cannot be dismantled, sold on the marketplace, or used in simultaneous trades.
3. **Review & Accept**:
   The target user inspects the trade with `/trade action:view id:<trade_id>` and accepts with:
   ```
   /trade action:accept id:<trade_id>
   ```
4. **Atomic ACID Settlement**:
   Card ownerships and credit balances are transferred simultaneously inside a single database transaction. If either user lacks the required credits or cards, the entire transaction rolls back safely.
5. **Cancellation / Rejection**:
   If a trade is declined (`/trade action:reject`) or cancelled (`/trade action:cancel`), all locked cards immediately revert back to `IDLE` state.

---

## 7. Community Player Marketplace & 5% Tax Sink

The Community Marketplace allows players to list their cards for sale to anyone in the Discord economy.

### How to List a Card
```
/market action:list card_id:<id> price:<credits>
```
- The card is locked with `state = 'IN_MARKET'`.
- You can list cards for any credit price you choose.

### Browsing the Market
```
/market action:browse page:1 filter_element:ICE filter_rarity:UR
```
Browse active listings, complete with seller names, card levels, elemental affinities, and asking prices.

### Purchasing a Card
```
/market action:buy listing_id:<id>
```
- **5% Market Tax Sink**: A 5% platform fee is automatically deducted from the seller's proceeds on every successful sale (`tax = Math.floor(price * 0.05)`). This prevents hyperinflation in the server economy.
- The buyer receives the card immediately in `IDLE` state, and the seller receives the net credits (`price - tax`).

### 7-Day Automatic Expiration
Listings remain active for **7 days**. If a card does not sell within 7 days, the listing automatically expires and the card is safely returned to the seller's inventory in `IDLE` state. You can also manually cancel your listing anytime with `/market action:cancel listing_id:<id>`.

---

## 8. WaifuGuilds & Factions

Join forces with other summoners to build a guild, unlock faction perks, and dominate the guild leaderboards!

### Creating a Guild
```
/waifuguild action:create name:"Crimson Lotus" tag:"LOTUS" description:"Top fire summoners guild"
```
- **Creation Fee**: 5,000 Credits (deducted from creator's wallet).
- The creator becomes the **Guild Leader**.

### Guild Features
- **Capacity Scaling**: Guilds start with space for **12 members** and expand as the guild levels up:
  $$\text{Max Members} = 10 + (\text{Guild Level} \times 2)$$
- **Guild Leveling & XP**:
  $$\text{XP Required for Level } L = \lfloor 1000 \times L^{1.5} \rfloor$$
  Guild members earn Guild XP by winning dungeon battles and duels!
- **Guild Bank**:
  Members can deposit credits to fund future guild upgrades and perks:
  ```
  /waifuguild action:deposit amount:1000
  ```
- **Roster Hierarchy**:
  - `LEADER`: Can promote/demote officers, kick members, edit description, and disband the guild.
  - `OFFICER`: Can accept new members and manage basic roster functions.
  - `MEMBER`: Earns XP, contributes to the bank, and enjoys guild bonuses.

---

## 9. Achievements & Multi-Asset Rewards

Ririko tracks your achievements across **6 distinct tracks** and **5 prestige tiers** (Bronze, Silver, Gold, Platinum, Diamond).

### 6 Achievement Tracks
1. **Gacha / Drops Track**: Claiming chat drops and expanding your waifu roster.
2. **Combat Track**: Winning PvP duels, expeditions, and boss raids.
3. **Leveling Track**: Leveling cards to Lv.50, Lv.100, and max ascension.
4. **Economy Track**: Accumulating credits, banking interest, and market sales.
5. **Collection Track**: Collecting complete elemental sets (e.g. all 7 elements).
6. **Social Track**: Guild membership, trading, and community activity.

### 7-Asset Multi-Reward Dispatch Engine
Unlike simple bots that only give a text badge, Ririko achievements can reward you with up to **7 different asset types**:
1. **Account EXP**: Levels up your Discord profile rank.
2. **Credits**: Transferred directly into your wallet.
3. **Collectible Cards**: Exclusive rare cards granted directly to your collection.
4. **Equipment Weapons**: High-tier combat weapons.
5. **Equipment Accessories**: Rings, amulets, and relics.
6. **Consumables**: Energy potions and health elixirs.
7. **Custom Titles & Badges**: Displayed on your `/profile` canvas rank card!

### How to Claim Achievements
- Check your progress:
  ```
  /achievement action:list
  ```
- Claim unlocked rewards:
  ```
  /achievement action:claim achievement_id:<id>
  ```

---

## 10. Command Quick Reference Cheat Sheet

| Command | Description | Example |
|---|---|---|
| `/tcg-info [topic]` | Interactive TCG Guide & Topic Hub | `/tcg-info topic:elements` |
| `/card collection` | View your card album | `/card action:collection filter:ICE` |
| `/card inspect` | View detailed stats & card art | `/card action:inspect id:<card_id>` |
| `/card claim` | Claim active chat drop | `/card action:claim` |
| `/card favorite` | Lock card from sale/dismantle | `/card action:favorite id:<card_id>` |
| `/card dismantle` | Dismantle card for Crafting Dust | `/card action:dismantle id:<card_id>` |
| `/card loadout` | View card's equipped 6-slot gear | `/card action:loadout id:<card_id>` |
| `/card equip-gear` | Equip weapon/armor/relic to card | `/card action:equip-gear id:<id> item_id:<id>` |
| `/card unequip-gear` | Unequip gear from slot | `/card action:unequip-gear id:<id> slot:WEAPON` |
| `/dungeon tutorial` | **Start Here!** Free T1–T4 Prologue | `/dungeon action:tutorial` |
| `/dungeon status` | Check tower floor, season, energy | `/dungeon action:status` |
| `/dungeon climb` | Battle the next unlocked floor | `/dungeon action:climb` |
| `/dungeon floor` | Inspect floor stats & drops | `/dungeon action:floor floor_number:20` |
| `/dungeon leaderboard`| Top season climbers | `/dungeon action:leaderboard` |
| `/trade request` | Propose an atomic card trade | `/trade action:request target:@User ...` |
| `/trade accept` | Accept an incoming trade | `/trade action:accept id:<trade_id>` |
| `/market list` | List a card on the marketplace | `/market action:list card_id:<id> price:500` |
| `/market browse` | Browse active player listings | `/market action:browse filter_element:FIRE` |
| `/market buy` | Purchase a card listing | `/market action:buy listing_id:<id>` |
| `/waifuguild create` | Create a new WaifuGuild (5,000c) | `/waifuguild action:create name:"Valor"` |
| `/waifuguild info` | Inspect guild stats and roster | `/waifuguild action:info` |
| `/waifuguild deposit` | Deposit credits to guild bank | `/waifuguild action:deposit amount:1000` |
| `/achievement list` | View achievements and progress | `/achievement action:list` |
| `/achievement claim` | Claim unlocked achievement reward | `/achievement action:claim achievement_id:<id>` |

---
*Happy summoning! May the gacha gods and elemental affinities be ever in your favor.*
