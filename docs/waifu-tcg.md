# Waifu Trading Card Game (TCG) — Complete Design & Technical Specification

## 1. System Overview

The **Waifu TCG** is Ririko AI 2.0.0's flagship gamification subsystem. It combines open-source character metadata
ingestion, mathematically balanced 8-tier collectible cards, tactical elemental combat, P2P atomic trading, a community
player marketplace, collaborative player guilds, an equipment and accessory loadout system, consumable combat potions,
a level-scaled daily energy engine, a tiered item shop, an achievement reward ecosystem, and a seasonal PvE dungeon
tower with configurable exponential scaling.

---

## 2. Waifu Image Ingestion & Asset Pipeline

### 2.1. Ingestion Architecture

To prevent rate-limit exhaustion and ensure high availability, Ririko never requests images dynamically from `waifu.im`
during user card commands. Instead, an asynchronous background ingestion pipeline harvests, validates, and locally
caches assets:

```text
waifu.im API / AniList / Jikan
         ↓
  Ingestion Worker
         ↓
  Validate Image (Magic bytes, dimensions, aspect ratio)
         ↓
  Download Original Binary
         ↓
  Compute SHA-256 Content Hash
         ↓
  Extract Metadata (Tags, Source ID, Anime Title, Character Name)
         ↓
  Save Record in `waifu_assets` (Database)
         ↓
  Store in Local Disk / S3 Object Storage (/assets/waifu-cards/)
```

### 2.2. Copyright, Attribution & Image Removal

1. **Mandatory Attribution**: In strict adherence to Section 24 of `BLUEPRINT.md`, every generated card graphic and
   Discord embed footer MUST display:
   ```text
   Image source: waifu.im
   ```
2. **Graceful Deletion Handling**: If an original creator or source requests removal of an image:
    - The asset is marked `is_deleted_by_request = TRUE` in `waifu_assets`.
    - The card graphic falls back to a standardized placeholder silhouette card frame with character name and stats
      intact.
    - User ownership, card stats, and trading value are **100% preserved without breaking player inventories or the card
      database**.

---

## 3. Card Mechanics & Rarity Math

### 3.1. 8-Tier Rarity Curve

Cards are distributed across 8 distinct rarity tiers with weighted drop probabilities:

| Rarity Tier                         | Drop Weight | Stat Multiplier | Visual Foil Effect             | Max Level |
|-------------------------------------|-------------|-----------------|--------------------------------|-----------|
| **Common**                          | 60.0%       | 1.0x            | Standard Card Border           | Level 20  |
| **Uncommon**                        | 20.0%       | 1.2x            | Bronze Trim                    | Level 30  |
| **Rare**                            | 10.0%       | 1.5x            | Silver Sheen                   | Level 40  |
| **Super Rare (SR)**                 | 6.0%        | 1.9x            | Gold Shimmer                   | Level 50  |
| **Ultra Rare (UR)**                 | 3.0%        | 2.5x            | Prismatic Hologram             | Level 60  |
| **Secret Rare (SEC)**               | 0.9%        | 3.2x            | Dark Sparkle Foil              | Level 70  |
| **Special Illustration Rare (SIR)** | 0.09%       | 4.0x            | Full-Art Textured Foil         | Level 85  |
| **Mythic**                          | 0.01%       | 5.0x            | Cosmic Celestial Animated Foil | Level 100 |

### 3.2. Dynamic Card Attributes & Combat Roles

Every card carries dynamically computed attributes derived from its character metadata, rarity tier, and elemental
affinity:

- **Name & Serial Number**: E.g. `Makima #0042/1000`.
- **Primary Stats**:
    - `Health (HP)`: 500 – 15,000
    - `Attack (ATK)`: 50 – 2,500
    - `Defense (DEF)`: 30 – 1,800
    - `Speed (SPD)`: 10 – 300 (determines turn priority in combat)
    - `Critical Rate (CRIT)`: 5% – 50%
    - `Mana (MP)`: 100 (spent to activate tactical skills)
- **Unique Active Skill**: Triggered during tactical combat (e.g. "Glacial Prison: Costs 40 MP. Deals 180% Ice ATK and freezes target for 1 turn").
- **Passive Ability**: Ambient buff (e.g. "Absolute Zero: +20% damage against Earth and 15% slow aura").
- **Collection Number**: Unique index within the seasonal collection album.

---

## 4. Elemental Interaction Matrix (7 Elements)

Tactical combat uses a 7-element affinity chart featuring the **Ice** element. Elemental advantages grant a **1.5x
damage multiplier**:

```text
       Fire   ──────>   Ice
        ▲                │
        │                │
        │                ▼
      Water            Earth
        ▲                │
        │                │
        │                ▼
      Lightning <────────┘

         Light  <───>  Shadow
      (Mutual High-Risk Advantage: 1.5x damage to each other)
```

### 4.1. Elemental Advantage Loop

- **Fire** melts **Ice** (`Fire > Ice`)
- **Ice** freezes & fractures **Earth** (`Ice > Earth`)
- **Earth** grounds & absorbs **Lightning** (`Earth > Lightning`)
- **Lightning** electrifies & shocks **Water** (`Lightning > Water`)
- **Water** extinguishes **Fire** (`Water > Fire`)
- **Light** and **Shadow** inflict mutual catastrophic bonus damage on each other (`Light <> Shadow`).

### 4.2. Elemental Status Effects & Combat Traits

- **Fire**: *Burn* — Inflicts ongoing damage over time (DoT) based on 10% of ATK.
- **Ice**: *Freeze & Chill* — Slows opponent's Speed stat by 25%; has a 15% chance to freeze the opponent, forcing them
  to skip a combat turn.
- **Earth**: *Fortify* — Provides defensive shielding and reduces incoming physical damage.
- **Lightning**: *Surge* — Increases critical strike chance by +15% and can cause micro-stuns.
- **Water**: *Purify & Flow* — Restores 8% max HP per turn and mitigates debuff duration.
- **Light**: *Radiance* — Buffs team attack power and pierces through defense shields.
- **Shadow**: *Decay & Leech* — Absorbs 20% of damage dealt as health regeneration.

---

## 5. Waifu Drop System

Guild administrators configure automated card drops to stimulate server chatter:

- **Drop Channel**: Configurable dedicated drop channel (e.g. `#waifu-drops`).
- **Trigger Condition**: Configurable message threshold (e.g. every 50–100 active messages from unique members).
- **Claim Window**: Cards spawn with an interactive `[Claim Card]` Discord button valid for 60 seconds.
- **Allowed Hours**: Configurable active hours (e.g. 08:00 to 23:00) to prevent nocturnal spam.
- **Anti-Sniping**: A user who claimed the previous drop enters a short cooldown (5 minutes) to give other server
  members a fair chance.

---

## 6. Game Modes & Commands

### 6.1. Game Modes

1. **Explore & Expeditions (`/game explore`)**: Send equipped cards on timed expeditions (1h, 4h, 8h) to gather credits,
   leveling materials, crafting dust, and rare card shards. Consumes Daily Energy.
2. **Seasonal PvE Dungeons (`/dungeon`)**: Ascend seasonal tower floors structured as **Tutorial $\to$ Seasons (S1, S2, S3...) $\to$ Floors (F1, F2, F3, F4...)**. Features environmental affixes and configurable exponential difficulty scaling. (See Section 7).
3. **PvP Duels (`/game pvp <@user> [wager]`)**: Challenge another server member to an elemental 3v3 card duel with
   optional credit wagers escrowed in database transactions.
4. **Cooperative Boss Raids (`/game boss`)**: Server-wide or guild-wide massive HP bosses where all members combine card
   damage to earn exclusive seasonal card frames and Mythic gears. Consumes Daily Energy.
5. **Daily & Weekly Missions**: Complete specific battle and claim milestones to earn free summons, consumables, and gems.

### 6.2. Card Inventory & Collection Commands

- `/card collection [filter: element/rarity] [sort: level/rarity/name]` — Paginated interactive visual album with
  filters for Fire, Ice, Earth, Lightning, Water, Light, and Shadow.
- `/card inspect <card_id>` — High-resolution card embed displaying foil art, full stats, skill, equipped gear, and history.
- `/card equip <card_id>` — Assign card to active combat deck slot (locks card from trade/market).
- `/card favorite <card_id>` — Protects card from accidental sale or dismantling.
- `/card dismantle <card_id>` — Break down duplicate cards into crafting dust to upgrade card star ratings, enhance equipment, or craft new gear (see §10.4).

---

## 7. PvE Dungeon Architecture: Tutorial, Seasons & Exponential Scaling

The dungeon system provides the primary PvE endgame progression in Ririko 2.0. To deliver sustained excitement, prevent stale meta stagnancy, and challenge even veteran players with legacy overpowered cards, dungeons follow a three-tier hierarchical progression model:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Dungeon Progression Hierarchy                         │
│                                                                             │
│  [ Phase 1: Tutorial / Prologue ]                                           │
│    └─► Floor T1 to T4 (Mechanics Onboarding: Elements, MP, Potions, Shields)│
│                                                                             │
│  [ Phase 2: Seasons (S1, S2, S3...) ]                                       │
│    ├─► Season 1: Infernal Crucible (Fire/Ice focus, Burn DoT, Heat Affixes) │
│    ├─► Season 2: Abyssal Maelstrom (Water/Lightning, Storm Chills, Speed)   │
│    └─► Season 3: Celestial Twilight (Light/Shadow, Mutual Risk, Invert Heal)│
│                                                                             │
│  [ Phase 3: Floors (F1, F2, F3, F4 ... F50+) ]                              │
│    └─► Configurable Exponential Difficulty Scaling + Dynamic Boss Enrages   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.1. Tutorial Dungeon (Prologue / Floor 0)
- **Onboarding Pipeline**: Gated initial sequence that every new player must clear before entering competitive seasonal towers.
  - **Floor T1**: *Elemental Resonance* — Teaches 1.5x elemental multiplier (Fire > Ice > Earth > Lightning > Water > Fire).
  - **Floor T2**: *Mana & Active Skills* — Demonstrates card MP consumption and tactical skill execution.
  - **Floor T3**: *Consumables & Tactical Survival* — Introduces HP potions and Mana Draughts in combat.
  - **Floor T4**: *Boss Break Shields* — Introduces multi-elemental barrier breaking on an elite training dummy.
- **Entry Cost**: 0 Energy (free introductory access).
- **Rewards**: Random starter waifu card from the starter pool (see `docs/tcg-card-synthesis.md`), Novice Blade (Common), 3x Minor HP Potions, and unlocks Achievement `TUTORIAL_COMPLETE`.

### 7.2. Seasonal Framework (S1, S2, S3...)
Dungeons operate on **Seasons** (typically 60–90 days per cycle). When a season concludes, it is archived to the historical Hall of Fame, and a new Season launches with fresh mechanics.

#### Seasonal Themes & Environmental Affixes:
Each season introduces active **Environmental Affixes** that alter fundamental combat rules across all floors:
- **Season 1 (*Infernal Crucible*)**:
  - *Affix: Scorched Earth* — Cards take 6% max HP burn damage every 2 turns unless shielded by Earth or purified by Water.
  - *Affix: Heat Haze* — Critical strike rate reduced by 15% across all elements except Fire.
- **Season 2 (*Abyssal Maelstrom*)**:
  - *Affix: Torrential Deluge* — Card Speed stat reduced by 25%. Lightning skills bounce to all adjacent enemies with +20% bonus damage.
  - *Affix: Tidal Barrier* — Boss heals for 8% max HP if not afflicted with Freeze/Shock within 3 turns.
- **Season 3 (*Celestial Twilight*)**:
  - *Affix: Radiant Flare & Void Drain* — Light and Shadow deal 2.0x mutual catastrophe damage. Direct HP healing is suppressed by 40%.

### 7.3. Anti-Powercreep Architecture: Overcoming Legacy Overpowered Cards
A common pitfall in gacha/TCG games is that veteran players bring overpowered Mythic cards from previous seasons and steamroll newly released content. Ririko 2.0 solves this without nerfing player investments:
1. **Elemental Affinity & Shield Enforcements**:
   - High-floor bosses possess **Multi-Layer Elemental Wards** (e.g. 3-layer shield: Fire $\to$ Lightning $\to$ Ice).
   - An overpowered non-matching card (e.g. a pure Light Mythic) deals zero damage to an active ward until the matching elements break the barrier.
2. **Seasonal Affix Penalties**:
   - High floors amplify seasonal affixes. A player relying solely on an old brute-force card will suffer heavy DoTs or massive MP tax penalties if the card's element or role doesn't counter the seasonal theme.
3. **Turn Limits & Soft Enrage**:
   - Bosses enrage on turn 10+, gaining +100% ATK per turn and true-damage strikes. Players must bring synergistic debuffers, buffers, and element counters rather than a single lone carry.

### 7.4. Floor Progression & Energy Requirements
- Floors follow a sequential climb: Clearing Floor $F$ unlocks Floor $F+1$.
- Every 5th floor (F5, F10, F15, F20...) is an **Elite Mini-Boss Floor**.
- Every 10th floor (F10, F20, F30, F40, F50) is a **Major Seasonal Boss Floor** with unique animated avatars, special dialogue, and first-clear milestone rewards.
- **Energy Scaling by Floor Bracket**:
  - Floors 1–10: 10 Energy per attempt.
  - Floors 11–25: 15 Energy per attempt.
  - Floors 26–40: 20 Energy per attempt.
  - Floors 41–50+: 25 Energy per attempt.

### 7.5. Configurable Difficulty Scaling Engine

Difficulty scaling on monster HP, Attack, Defense, and Speed can be mathematically configured per season or globally:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                 Configurable Mathematical Scaling Models                     │
│                                                                             │
│  1. Linear Model:        Stat(F) = Base × (1 + k × (F - 1))                 │
│  2. Polynomial Model:    Stat(F) = Base × (1 + α × (F - 1) + β × (F - 1)²)  │
│  3. Exponential Model:   Stat(F) = Base × (1 + r)^(F - 1)                   │
│  4. Hybrid Step-Exp:     Linear (F1-10) -> Mid Exp (F11-25) -> High Exp     │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Exponential Scaling Formula (Default Engine):
$$\text{MonsterStat}(F) = \text{BaseStat} \times (1 + r)^{F - 1} \times \text{BossMultiplier}$$

Where:
- $\text{BaseStat}$: Baseline values at Floor 1 ($\text{HP}=1,200, \text{ATK}=120, \text{DEF}=80, \text{SPD}=25$).
- $r$: Base growth rate per floor (default: $r = 0.085$).
- $\text{BossMultiplier}$: $1.0\times$ for standard floors, $1.75\times$ for Mini-Boss floors, $3.2\times$ for Major Milestone Boss floors.

#### Sample Stat Scaling Progression Table ($r = 0.085$):

| Floor | Type | Enemy HP | Enemy ATK | Enemy DEF | Enemy SPD | Strategic Check |
|-------|------|----------|-----------|-----------|-----------|-----------------|
| **F1** | Standard | 1,200 | 120 | 80 | 25 | Starter Gear check |
| **F5** | Mini-Boss | 3,360 | 315 | 210 | 38 | Elemental Match check |
| **F10** | Major Boss | 10,240 | 845 | 560 | 52 | Skill & Potion timing check |
| **F20** | Major Boss | 23,100 | 1,850 | 1,220 | 78 | +5 Enhanced Gear & Synergies |
| **F30** | Major Boss | 52,100 | 4,050 | 2,680 | 115 | SR/UR Gear + Accessory check |
| **F40** | Major Boss | 117,500 | 8,900 | 5,880 | 165 | Dual Elemental Barrier check |
| **F50** | Final Boss | 265,000 | 19,500 | 12,900 | 230 | Mythic Endgame Master Challenge |

### 7.6. Full Administrative Configurability
The scaling parameters are completely dynamic and hot-reloadable:
- Configurable via **Web Dashboard** under *Dungeon Tower Manager*:
  - Dropdown selector for Scaling Model (`LINEAR`, `POLYNOMIAL`, `EXPONENTIAL`, `HYBRID`).
  - Interactive curve visualizer previewing HP/ATK trajectories up to Floor 100.
  - Sliders for $r$ (growth rate: 0.03 to 0.25) and Boss Floor Multipliers.
- Configurable via **Discord Slash Command**:
  - `/tcg-admin config dungeon scaling_model <LINEAR|POLYNOMIAL|EXPONENTIAL|HYBRID>`
  - `/tcg-admin config dungeon growth_rate <0.05-0.20>`
  - `/tcg-admin config dungeon season_affix <season_id> <affix_json>`

### 7.7. Seasonal Anime Bosses & Season Data (`pnpm tcg:boss-builder`)
Every season floor is guarded by a real anime character that fits the season theme. Season data lives in a hand-edited catalog, `assets/tcg/catalog/bosses/<seasonId>.json`:
- **Season row and difficulty curve**: `scalingModel` plus `scalingParams` (base stats, growth, boss multipliers, enrage, `affixStartFloor`).
- **Bosses**: character, element and tier; title and flavor text; combat `definition` (stat multipliers or absolute stats, a named skill with MP cost and power, enrage, elemental wards).
- **Floor assignment**: mini and major bosses list their floors (`%5` and `%10`). Standard bosses rotate through a `floorRange`, so later floors bring new faces and no boss appears on back-to-back floors.

Precedence at battle time: floor overrides > boss definition > season curve > code defaults.

| Command | Effect |
|---|---|
| `pnpm tcg:boss-builder --sync` | Resolve AniList ids and Danbooru art for each boss and download images (resumable, rate-limited) |
| `pnpm tcg:boss-builder --render` | Draw plain 720×960 boss portraits (element icon top-left, name, title, anime, tier/floor badge, no rarity frame) to `public/bosses/` |
| `pnpm tcg:boss-builder --import-db [--dry-run]` | Upsert the season, boss assets, `dungeon_bosses` and all `dungeon_floors` rows |
| `pnpm tcg:boss-builder --all` | All three steps in order |
| `pnpm tcg:boss-builder --suggest --season=<id>` | List themed candidates from the card character catalog |
| `pnpm tcg:simulate [--floors=] [--check]` | Monte Carlo win rates per floor for six player profiles, checked against the season's target bands |

**Season 1 (Infernal Crucible)**: 26 FIRE/EARTH characters.
- Major bosses: Megumin (F10), Mikasa Ackerman (F20), Mereoleona Vermillion (F30), Rias Gremory (F40), Shana (F50).
- Mini-bosses: Maki Oze, Darkness, Eris Greyrat, Holo, Tohru.
- Standard floors: a pool of six for F1–19 and ten more for F21–49.

Bosses build MP and cast their named skill. For example, Megumin's Explosion lands after five turns of charging, so defending that turn pays off.

**Season 1 balance** is checked by `pnpm tcg:simulate --check` and by a CI test against `S1_TARGET_BANDS`:

| Profile | Target |
|---|---|
| Tutorial graduate | ≥85% on F1–3, ≤10% on F10 |
| Starter | ≥60% on F4–5 |
| Early | ≥50% on F6–10, ≤5% on F20 |
| Mid | ≥40% on F11–20, ≤10% on F30 |
| Late | ≥35% on F21–30 |
| Endgame | ≥15% on F31–50 |

Every 10th floor is a boss wall that needs the next tier of cards and gear.

**Keeping the climb possible and rewarding** (`DungeonProgressService`, stored per player and season in `tcg_system_configs`):
- **Pity Blessing**: each real defeat on a floor gives +10% ATK/DEF/HP on the next attempt, up to +30%. It resets when the floor is cleared; forfeits don't count.
- **Energy refund**: defeats on floors 1–10 refund half the energy spent.
- **Star ratings**: 1★ for the clear, +1★ for ≤8 turns, +1★ for no potions. A floor's first 3★ clear pays floor × 10 Crafting Dust.
- **Starter guarantee**: the tutorial's starter card comes from the stronger half of COMMON cards.

In seasons, off-element strikes chip elemental wards at 25%. Matching the ward's element is still far faster. The tutorial keeps wards strict (0%) to teach the rule.

---

## 8. Atomic Trading & Player Marketplace

### 8.1. P2P Card Trading (`/game trade <@user>`)

- Two-party interactive Discord modal / select menu trade session.
- **State Locking**: Offered cards and items are instantly marked `state = 'IN_TRADE'`. Locked cards/items cannot be
  equipped, dismantled, transferred, or listed on the market.
- **Dual Confirmation**: Both parties must inspect the full trade proposal (cards + items + offered credits) and click
  `[Confirm Trade]`.
- **Atomic Transfer**: All card and item ownership updates and coin transfers occur inside a single ACID database transaction.

### 8.2. Community Player Marketplace (`/game market`)

- Players can list idle cards and tradeable equipment for sale at a custom credit price.
- **Listing Lock**: Listed assets enter `state = 'IN_MARKET'`.
- **Market Tax**: Configurable listing fee (e.g. 5% coin sink) deducted upon listing or sale to control bot economy
  inflation.
- **Expiration**: Unsold listings expire automatically after 7 days, returning the asset to the seller's inventory.

---

## 9. Waifu Guilds (`WaifuGuild` vs `DiscordGuild`)

To avoid architectural confusion, in-game player factions are strictly named **`WaifuGuild`**, completely separate from
Discord servers (`DiscordGuild`):

- **Creation**: Players can form a `WaifuGuild` with custom name, emblem, and motto.
- **Guild Progression**: Members contribute XP through card battles, leveling up the guild to unlock member capacity and
  guild shop buffs.
- **Guild Bank**: Shared credit pool used by guild leaders to activate server-wide raid bosses.
- **Guild Raids**: Cooperative PvE boss battles with guild leaderboard standings.

---

## 10. Equipment & Accessory Subsystem

Cards in combat can be customized and augmented through specialized gear slots. Gear is divided into **Equipments** (combat weapons, armor, relics) and **Accessories** (rings, amulets, talismans).

```text
┌─────────────────────────────────────────────────────────────────┐
│                     Card Combat Loadout                         │
│                                                                 │
│  [ Equipped Card ]  ─── Primary Hero Stats & Elemental Affinity │
│         │                                                       │
│         ├── [ Equipment 1: Weapon ]   ── ATK / CRIT / Battle Perk│
│         ├── [ Equipment 2: Armor ]    ── HP / DEF / Shield Perk │
│         ├── [ Equipment 3: Relic ]    ── Utility / Tactical Perk│
│         │                                                       │
│         ├── [ Accessory 1: Ring ]     ── Flat & % Offense Stats │
│         ├── [ Accessory 2: Amulet ]   ── Flat & % Defense Stats │
│         └── [ Accessory 3: Talisman ] ── Flat & % Utility Stats │
└─────────────────────────────────────────────────────────────────┘
```

### 10.1. Equipments (Stats + Dynamic Battle Perks)

Equipments grant substantial base stats, but their true power comes from **Special Battle Perks** unlocked and scaled by rarity:

| Gear Slot | Primary Stats Granted | Example Item |
|-----------|------------------------|--------------|
| **Weapon** | `Attack (ATK)`, `Critical Rate`, `Critical Damage` | Obsidian Katana, Solar Lance |
| **Armor** | `Health (HP)`, `Defense (DEF)`, `Damage Mitigation %` | Dragonscale Plate, Aegis Barrier |
| **Relic** | `Speed (SPD)`, `Elemental Mastery %`, `Mana Shield` | Chronos Hourglass, Phoenix Feather |

#### Battle Perks by Rarity Tier:
- **Common / Uncommon**: Pure raw stats with minimal or no perks (+2% DEF, +10 flat ATK).
- **Rare**: Minor tactical passive (e.g. *Sharpened Edge*: +8% Physical DMG against armored foes).
- **Super Rare (SR)**: Active combat perk (e.g. *Vampiric Touch*: Convert 12% of physical damage dealt into card HP healing).
- **Ultra Rare (UR)**: Game-changing perk (e.g. *Glacial Counter*: When attacked, 25% chance to Freeze the attacker for 1 turn).
- **Secret Rare (SEC)**: Synergy perk (e.g. *Mana Conduit*: Reduces Active Skill mana cost by 25% and starts battle with +25 bonus MP).
- **Special Illustration Rare (SIR)**: Dual perk + visual card frame effect (e.g. *Phoenix Ward*: Revive card once per match with 35% HP upon taking fatal damage).
- **Mythic**: Celestial perk (e.g. *Cosmic Cataclysm*: Every 3rd turn, automatically unleash an unblockable true-damage lightning strike dealing 200% ATK ignoring shields).

### 10.2. Accessories (Pure & Hybrid Stat Amplifiers)

Accessories provide targeted stat min-maxing to specialize cards into Tanks, Glass Cannons, or Speed Blitzers:

| Accessory Slot | Stat Focus | Example Item |
|----------------|------------|--------------|
| **Ring** | Offensive multipliers: `ATK %`, `CRIT Rate %`, `Armor Piercing %` | Ring of the Blazing Sun |
| **Amulet** | Defensive multipliers: `HP %`, `DEF %`, `Elemental Resistance %` | Heart of the Mountain Amulet |
| **Talisman** | Utility multipliers: `SPD %`, `Mana Max %`, `Mana Regen / Turn %` | Windwalker Talisman |

### 10.3. Equipment Enhancement & Refinement

- Players can enhance equipments from **+0 to +10** using **Crafting Dust** (earned by dismantling duplicate waifu cards via `/card dismantle`, or by clearing dungeon floors) and Credits.
- Each enhancement level increases base stats by +5% to +10%.
- At enhancement levels +5 and +10, the equipment's Battle Perk triggers with higher probability or potency (e.g. *Vampiric Touch* scales from 12% -> 18% -> 25%).
- Crafting Dust is also spent to forge new gear and potions outright — see §10.4.

### 10.4. Crafting: Forging Gear and Potions from Dust

Crafting is a second, more deliberate way to gear up than hoping for a drop: spend Crafting Dust, Credits, and (for
most recipes) an ingredient to forge a specific piece on demand. It never replaces drops or boss fights — it makes
progress reliable once you've proven you can handle the floor a piece is meant for.

**What can be crafted**
- Every non-signature, drop-only piece of gear across the six slots (Weapon, Armor, Relic, Ring, Amulet, Talisman),
  organized as a **per-slot upgrade chain**: RARE → SUPER_RARE → ULTRA_RARE → the slot's top non-signature tier
  (usually SECRET_RARE; RELIC tops out at SPECIAL_ILLUSTRATION_RARE and WEAPON at MYTHIC, since neither slot has a
  non-signature SECRET_RARE piece in the current catalog).
- Two potions: **Major HP Potion** and **Greater Mana Potion**, each crafted from 3 copies of its basic-tier potion
  (Minor HP Potion / Mana Draught).
- **Elixir of Full Vitality**, **Cosmic Ether**, and every Energy Restore potion are deliberately **not craftable** —
  they're one-time reward-tier items (full heal + cleanse, full mana + free cast, energy economy), and letting dust
  buy them would trivialize the systems they gate.

**Why boss signature drops are excluded**: a boss's signature gear (see §7) is defined outright as a reward for
beating that boss. If it were craftable, dust would let a player skip the fight it's meant to reward, so signature
drops never appear in a recipe — as either an output or an ingredient.

**Cost formula** — every recipe charges dust, credits, and (after the first tier of a chain) one ingredient:
- **Credits**: `round(shop price × 1.75)`. That 1.75x is the Town Shop's 1.5x daily-rotation markup (§5.3) plus a
  0.25 crafting premium, so forging an item on demand always costs more credits than buying the same item on the day
  it happens to be in rotation — crafting is the reliable path, never the cheap one.
- **Crafting Dust**: `round(shop price ÷ 1000 × 40 × rarity multiplier)`, reusing the same rarity multiplier scale
  that equipment enhancement already spends dust against (§10.3), so crafting costs sit on a curve players already
  know instead of a new one.
- **Ingredient** (upgrade-chain tiers 2+ only): one owned copy of the previous tier in the same slot's chain — the
  old piece is "melted down" into the new one. Base-tier (first) recipes in each chain need no ingredient.

**Unlock floors**: each recipe is locked until you've cleared a specific dungeon floor in the current season — floor
10 for the RARE tier, 20 for SUPER_RARE, 30 for ULTRA_RARE, 40 for the top tier (45 for the Weapon slot's MYTHIC
capstone, one floor past its SECRET_RARE-equivalent wall). A recipe unlocks at the wall just *before* the boss it
helps you beat, never the one it would let you skip — potion recipes unlock at floor 5.

**Quantity caps**: equipment and accessory recipes can only be crafted **one at a time** (each copy needs its own
enhancement level to track). Potion recipes can be batched up to **10 per craft**.

**Ingredient rule**: only unequipped copies count. Gear currently equipped to a card is never touched, and when a
chain ingredient is consumed, the **lowest-enhancement copy** is removed first — so an enhanced piece survives an
upgrade craft as long as an unenhanced spare exists.

**Commands**:
- `/item action:craft` (no `recipe`) opens the interactive **Crafting Workshop** menu: pick a category (the six gear
  slots, plus a combined "Potions" bucket for the HP/Mana recipes), pick a recipe, review the detail panel (cost,
  lock status, ingredient shortfalls), and press **Craft**. The menu always crafts one at a time.
- `/item action:craft recipe:<code> quantity:<n>` crafts directly. `recipe` accepts the exact recipe code
  (`CRAFT_WEAPON_OBSIDIAN_KATANA`), the bare output item code (`WEAPON_OBSIDIAN_KATANA`), or that code without the
  `CRAFT_` prefix in lowercase (`weapon_obsidian_katana`) — matching is case-insensitive. `quantity` defaults to 1
  and is capped per the rule above.
- Prefix commands: `!item craft [recipe] [quantity]` and the alias `!item forge [recipe] [quantity]`.

**Recipe table** (generated from `CRAFTING_RECIPES` in
[`crafting-recipes.ts`](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/equipment/crafting-recipes.ts) —
regenerate this table if that file changes):

| Recipe | Output | Rarity | Slot | Unlock Floor | Dust | Credits | Ingredient |
|---|---|---|---|---:|---:|---:|---|
| `CRAFT_WEAPON_OBSIDIAN_KATANA` | Obsidian Katana | RARE | Weapon | 10 | 60 | 1,750 | — |
| `CRAFT_WEAPON_SOLAR_LANCE` | Solar Lance | SUPER_RARE | Weapon | 20 | 200 | 4,375 | 1x Obsidian Katana |
| `CRAFT_WEAPON_CRIMSON_CALAMITY` | Crimson Calamity | ULTRA_RARE | Weapon | 30 | 1,200 | 17,500 | 1x Solar Lance |
| `CRAFT_WEAPON_WORLD_BREAKER` | World Breaker | MYTHIC | Weapon | 45 | 8,000 | 43,750 | 1x Crimson Calamity |
| `CRAFT_ARMOR_MAGMA_MAIL` | Magma-Forged Mail | RARE | Armor | 10 | 90 | 2,625 | — |
| `CRAFT_ARMOR_DRAGONSCALE_PLATE` | Dragonscale Plate | SUPER_RARE | Armor | 20 | 240 | 5,250 | 1x Magma-Forged Mail |
| `CRAFT_ARMOR_AEGIS_BARRIER` | Aegis Barrier | ULTRA_RARE | Armor | 30 | 960 | 14,000 | 1x Dragonscale Plate |
| `CRAFT_ARMOR_ETERNAL_CRUCIBLE` | Eternal Crucible Plate | SECRET_RARE | Armor | 40 | 3,200 | 35,000 | 1x Aegis Barrier |
| `CRAFT_RELIC_CINDER_LANTERN` | Cinder Lantern | RARE | Relic | 10 | 90 | 2,625 | — |
| `CRAFT_RELIC_PHOENIX_ASH_CENSER` | Phoenix Ash Censer | SUPER_RARE | Relic | 20 | 320 | 7,000 | 1x Cinder Lantern |
| `CRAFT_RELIC_CHRONOS_HOURGLASS` | Chronos Hourglass | ULTRA_RARE | Relic | 30 | 1,200 | 17,500 | 1x Phoenix Ash Censer |
| `CRAFT_RELIC_PHOENIX_FEATHER` | Phoenix Feather | SPECIAL_ILLUSTRATION_RARE | Relic | 40 | 4,000 | 35,000 | 1x Chronos Hourglass |
| `CRAFT_RING_BLAZING_SUN` | Ring of the Blazing Sun | RARE | Ring | 10 | 72 | 2,100 | — |
| `CRAFT_RING_SOLAR_FLARE` | Solar Flare Ring | SUPER_RARE | Ring | 20 | 320 | 7,000 | 1x Ring of the Blazing Sun |
| `CRAFT_RING_INFERNO_CROWN` | Inferno Crown Ring | ULTRA_RARE | Ring | 30 | 1,200 | 17,500 | 1x Solar Flare Ring |
| `CRAFT_RING_SUNFORGED_SIGIL` | Sunforged Sigil | SECRET_RARE | Ring | 40 | 3,200 | 35,000 | 1x Inferno Crown Ring |
| `CRAFT_AMULET_MOUNTAIN` | Heart of the Mountain Amulet | RARE | Amulet | 10 | 72 | 2,100 | — |
| `CRAFT_AMULET_OBSIDIAN_HEART` | Obsidian Heart Amulet | SUPER_RARE | Amulet | 20 | 320 | 7,000 | 1x Heart of the Mountain Amulet |
| `CRAFT_AMULET_MAGMA_CORE` | Magma Core Amulet | ULTRA_RARE | Amulet | 30 | 1,200 | 17,500 | 1x Obsidian Heart Amulet |
| `CRAFT_AMULET_PRIMORDIAL_FLAME` | Primordial Flame Amulet | SECRET_RARE | Amulet | 40 | 3,200 | 35,000 | 1x Magma Core Amulet |
| `CRAFT_TALISMAN_WINDWALKER` | Windwalker Talisman | RARE | Talisman | 10 | 72 | 2,100 | — |
| `CRAFT_TALISMAN_EMBERSTEP` | Emberstep Talisman | SUPER_RARE | Talisman | 20 | 320 | 7,000 | 1x Windwalker Talisman |
| `CRAFT_TALISMAN_TEMPEST_FEATHER` | Tempest Feather | ULTRA_RARE | Talisman | 30 | 1,200 | 17,500 | 1x Emberstep Talisman |
| `CRAFT_TALISMAN_ASHEN_WINGS` | Ashen Wings | SECRET_RARE | Talisman | 40 | 3,200 | 35,000 | 1x Tempest Feather |
| `CRAFT_POTION_MAJOR_HP` | Major HP Potion | RARE | HP Potion | 5 | 12 | 350 | 3x Minor HP Potion |
| `CRAFT_POTION_GREATER_MANA` | Greater Mana Potion | RARE | Mana Potion | 5 | 15 | 438 | 3x Mana Draught |

---

## 11. Consumables & Potions Subsystem

Consumables provide immediate tactical assistance during battles or replenish critical resources outside combat.

```text
┌────────────────────────── Consumables Catalog ──────────────────────────┐
│                                                                        │
│  [ HP Potions ]       Restore card health during or between dungeon runs│
│  [ Mana Potions ]     Replenish MP needed for card active skills       │
│  [ Energy Restores ]  Replenish player action points (Strictly Limited) │
└────────────────────────────────────────────────────────────────────────┘
```

### 11.1. HP Potions
- **Minor HP Potion**: Instantly restores 300 HP (or 25% max HP). Sold in basic town shop.
- **Major HP Potion**: Instantly restores 1,200 HP (or 50% max HP). Crafted or dropped in Dungeons.
- **Elixir of Full Vitality**: Instantly restores 100% HP and clears all active debuffs/DoTs. High-tier quest/boss drop only.

### 11.2. Mana Potions
- Active skills in tactical combat consume Mana (MP). When cards exhaust their MP pool, they are limited to basic standard attacks.
- **Mana Draught**: Restores 30 MP. Sold in basic town shop.
- **Greater Mana Potion**: Restores 70 MP. Mid-tier dungeon/quest reward.
- **Cosmic Ether**: Restores 100% MP and grants 1 instant free skill cast with zero cooldown. Boss raid exclusive.

### 11.3. Energy Restores (Controlled Action Point Replenishers)
- **Design Principle**: Energy is the primary pacing mechanism for expeditions, dungeon progression, and raid farming. Unrestricted energy potions would ruin the game economy, reward botting, and create runaway progression disparities.
- **Tiers of Energy Restores**:
  - **Stamina Candy**: Restores +15 Energy.
  - **Grand Stamina Flask**: Restores +30 Energy.
  - **Celestial Ambrosia**: Fully replenishes energy up to the player's level cap. (Extremely rare; rewarded solely by master achievements or seasonal events).
- **Anti-Abuse Guardrails & Rate Limits**:
  1. **Daily Consumable Cap**: A player can consume at most **3 Energy Restores per reset day** (configurable globally; the reset day runs from the configured boundary, default 00:00 GMT+8, and is set by `RIRIKO_RESET_TIME_ENERGY_POTIONS`). Any attempt to consume beyond this quota is rejected with an informative error message: *"You have reached your daily stamina potion limit (3/3). Rest well, summoner!"*
  2. **Zero Infinite Stock in Shop**: Energy restores are **never** sold in unlimited quantities in the shop. The basic shop sells at most 1 minor Stamina Candy per day at high credit cost. High-tier restores drop strictly through battles, quests, and achievements.

---

## 12. Player Energy (Stamina) Lifecycle & Math

Every expedition, dungeon raid, and boss encounter consumes **Player Energy**.

### 12.1. Deterministic Daily Replenishment
- Every day at the configured **reset boundary** (default **00:00 GMT+8**), all players have their active energy pool restored to their level's maximum capacity.
- The boundary is shared with every other daily system in the bot and is configured through `RIRIKO_RESET_OFFSET_MINUTES` plus `RIRIKO_RESET_TIME` / `RIRIKO_RESET_TIME_ENERGY`. See Section 5.3 of [docs/economy.md](economy.md) for the full table.
- Replenishment is evaluated lazily on the user's next interaction, so no scheduled job is required and a bot that was offline across a boundary still replenishes correctly:
  $$\text{Energy}_{\text{current}} = \max\left(\text{Energy}_{\text{current}}, \text{MaxEnergy}(\text{Level})\right)$$

### 12.2. Level-Based Energy Formula & Progression Table
A player's max energy capacity scales with their overall leveling progression. Energy is a
**global per-user** resource while `xp_accounts` is keyed per guild, so the account-wide level is
derived from the user's XP **summed across every guild** (`XpRepository.getUserTotalXp`) and run
through the standard leveling curve, rather than from any single guild's row:

$$\text{MaxEnergy}(\text{Level}) = \min\left(\text{GlobalCap}, 100 + \lfloor (\text{Level} - 1) \times 2 \rfloor + \text{MilestoneBonus}(\text{Level})\right)$$

Where **MilestoneBonus** rewards significant progression breakthroughs:
- Level 10–24: $+5$
- Level 25–49: $+15$
- Level 50–74: $+30$
- Level 75–99: $+50$
- Level 100: $+75$

#### Energy Capacity Reference Table:

| Player Level | Base Formula ($100 + (\text{Lv}-1)\times 2$) | Milestone Bonus | Total Max Energy |
|--------------|---------------------------------------------|-----------------|------------------|
| **Level 1**  | 100                                         | +0              | **100 Energy**   |
| **Level 10** | 118                                         | +5              | **123 Energy**   |
| **Level 20** | 138                                         | +5              | **143 Energy**   |
| **Level 25** | 148                                         | +15             | **163 Energy**   |
| **Level 40** | 178                                         | +15             | **193 Energy**   |
| **Level 50** | 198                                         | +30             | **228 Energy**   |
| **Level 60** | 218                                         | +30             | **248 Energy**   |
| **Level 75** | 248                                         | +50             | **298 Energy**   |
| **Level 90** | 278                                         | +50             | **328 Energy** (capped if Global Cap is 300) |
| **Level 100**| 298                                         | +75             | **373 Energy** (capped by Global Cap) |

### 12.3. Global Energy Cap & Administrative Governance
- **Global Energy Cap**: A hard ceiling preventing runaway energy scaling (Default: **300 Energy**, range 100 – 1,000).
- Configurable via:
  1. **Web Dashboard**: Located under *Waifu TCG Settings* -> *Energy & Stamina Governance*.
  2. **Discord Admin Command**: `/tcg-admin config energy max_cap <value>` (Strictly protected by Discord `Administrator` permission or the designated `TCG Manager Role`).
- **Temporary Overflow Rules**:
  - Gaining energy from rare consumables or leveling up can temporarily overflow past the normal cap (e.g. 115/100).
  - During the daily replenishment at the reset boundary, if a player's energy is already $\ge \text{MaxEnergy}$, it is not reduced or deleted, but no additional free energy is awarded.

### 12.4. Reconciliation Entry Points

`EnergyLifecycleService` is the single gateway for the energy pool. Every debit runs through it,
and each one reconciles the reset boundary before evaluating the spend, so a player who has not
been seen since the last boundary is replenished first rather than wrongly refused:

| Entry point | Method |
|---|---|
| Timed expeditions | `spendEnergy` |
| Dungeon floor attempts | `spendEnergy` |
| World boss raids | `spendEnergy` |
| PvP ranked duels | `spendEnergy` |
| Energy potions (`/item use`, economy shop) | `consumePotion` |
| Floor 1–10 defeat refund | `refundEnergy` |

### 12.5. Energy Expenditure Table

| Game Activity | Energy Cost | Rewards Gathered |
|---------------|-------------|------------------|
| **Timed Expedition (1h)** | 10 Energy | Basic materials, credits, common card shards |
| **Timed Expedition (4h)** | 25 Energy | Uncommon materials, crafting dust, rare gear chance |
| **Timed Expedition (8h)** | 45 Energy | High-tier materials, SR gear chance, substantial credits |
| **Dungeon Floors (F1–F10)** | 10 Energy | Dungeon XP, credits, entry gear, materials |
| **Dungeon Floors (F11–F25)** | 15 Energy | Rare gear, crafting dust, potions |
| **Dungeon Floors (F26–F40)** | 20 Energy | Super Rare gear, accessory drops, summon tickets |
| **Dungeon Floors (F41–F50+)** | 25 Energy | Ultra Rare / Secret Rare gear, energy flasks, title progress |
| **World Boss Raid Attempt**| 30 Energy | Raid badges, mythic equipment fragments, title progress |
| **PvP Ranked Duel** | 5 Energy | Rank rating points, arena tokens |

---

## 13. Item Shop & Combat Loot Progression

To create a rewarding gameplay loop, items are strictly tiered between the **Basic Town Shop** and **Battle / Quest Rewards**:

```text
┌─────────────────────────── Economy & Item Pipeline ───────────────────────────┐
│                                                                               │
│  [ Basic Town Shop ]                                                          │
│    • Sells: Common & Uncommon Equipments / Basic Accessories / Minor Potions  │
│    • Cost: In-game Credits (Centralized Economy sink)                         │
│    • Purpose: Entry equipment for beginners; steady convenience supplies      │
│                                                                               │
│  [ Battles, Dungeons, Bosses & Quests ]                                       │
│    • Drops: Rare, SR, UR, SEC, SIR, and Mythic Equipments & Accessories       │
│    • Drops: Dynamic Battle Perks, High-Tier Potions, Rare Energy Restores     │
│    • Purpose: Core endgame aspirational goals and tactical depth              │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 13.1. Basic Town Shop (`/shop`)
- **Inventory Stock**:
  - *Equipments*: Novice Blade (Common), Iron Hauberk (Common), Wooden Buckler (Common), Scout Boomerang (Uncommon).
  - *Accessories*: Copper Band (+ATK), Leather Choker (+HP), Simple Bangle (+DEF).
  - *Consumables*: Minor HP Potion (300 HP), Mana Draught (30 MP), Daily Energy Biscuit (+15 Energy, max 1 purchase/day).
- All transactions are audited via the double-entry financial ledger (`type: 'SHOP_BUY'`).

### 13.2. Superior Loot Drops from PvE Battles & Quests
Superior gear cannot simply be purchased with money; it must be won in battle:
- **Dungeon Floors 1–25**: Rare Equipments with passive perks (e.g. *Sharpened Edge*).
- **Dungeon Floors 26–50**: Super Rare Equipments with active combat perks (e.g. *Vampiric Touch*).
- **Dungeon Floors 51–100**: Ultra Rare & Secret Rare Equipments (e.g. *Glacial Counter*, *Mana Conduit*).
- **Server Raid Bosses**: Special Illustration Rare (SIR) and Mythic sets with dual synergy perks (e.g. *Phoenix Ward*, *Cosmic Cataclysm*).

### 13.3. Dungeon Drop Tables & Boss Signature Gear (implemented)
Drops come from `DUNGEON_DROP_BRACKETS` in `dungeon-loot.service.ts`. Every drop is a catalog code, and every clear also pays Crafting Dust.

| Floors | Bracket gear (repeat clears: 35% item chance) | Boss-floor first clear |
|---|---|---|
| 1–9 | Shop tier: Boomerang, Buckler, Ember Charm, Copper Band + potions | Boss signature (F5: Fire Brigade Badge) |
| 10–19 | RARE: Obsidian Katana, Magma Mail, Cinder Lantern, Blazing Sun, Mountain Amulet, Windwalker | F10 Crimson Chant Staff, F15 Crusader Plate |
| 20–29 | SUPER_RARE: Solar Lance, Dragonscale, Phoenix Ash Censer, Solar Flare Ring, Obsidian Heart, Emberstep | F20 Maneuver Gear, F25 Sword Saint Band |
| 30–39 | ULTRA_RARE: Crimson Calamity, Aegis, Chronos Hourglass, Inferno Crown, Magma Core, Tempest Feather | F30 Calidos Gauntlets, F35 Harvest Pouch |
| 40+ | SECRET_RARE and up: Eternal Crucible, Sunforged Sigil, Primordial Flame, Ashen Wings, Phoenix Feather, World Breaker | F40 Signet of Ruin, F45 Chaos Dragon Scale, F50 Crucible Heart Blade |

- The first clear of a standard floor always rolls one bracket item.
- Repeat clears of a boss floor drop its signature again 8% of the time.

**Secondary gear stats now affect dungeon combat:**

| Stat | Effect |
|---|---|
| `mitigation` + `elementalResistance` | Cut incoming damage, capped at 60%; enrage true damage ignores it |
| `armorPiercing` | Ignores part of the boss's defense |
| `elementalMastery` | Adds to the elemental advantage multiplier |
| `manaRegen` | Restores this share of max MP each turn |
| `manaShield` | Starting shield |
| `critDamage` | Added to crit damage |
| `manaMax` | Raises max MP |

---

## 14. Game Achievement System

The **Achievement System** rewards player dedication across all facets of Ririko 2.0: collecting cards, winning tactical battles, crafting gear, maintaining streaks, and participating in guilds.

### 14.1. Achievement Categories & Milestones

Achievements are divided into 6 core tracks, spanning 5 tiers (Bronze, Silver, Gold, Platinum, Mythic):

```text
┌───────────────────────────── Achievement Tracks ─────────────────────────────┐
│ 1. [ Collector ]     Card volume, rarity milestones, elemental completion   │
│ 2. [ Combatant ]     PvP duel victories, dungeon floors cleared, raid damage│
│ 3. [ Tycoon ]        Credits accumulated, player marketplace sales volume   │
│ 4. [ Blacksmith ]    Equipment enhancements (+5, +10), item syntheses       │
│ 5. [ Devotion ]      Consecutive daily claim streaks, total play tenure     │
│ 6. [ Guild Hero ]    WaifuGuild contribution XP, cooperative raid boss wins │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.2. Comprehensive Multi-Asset Reward Dispatch

Every achievement provides high-value rewards upon completion, dynamically spanning:
1. **Account EXP**: Levels up the player, directly boosting their maximum daily energy pool.
2. **Credits / Gems**: Fuels economy spending and marketplace trades.
3. **Collectible Waifu Cards**: Exclusive achievement-only cards and high-tier summon tickets.
4. **Equipments**: Exclusive high-rarity weapons and armor equipped with unique battle perks.
5. **Accessories**: Powerful rings, amulets, and talismans that provide substantial % stat multipliers.
6. **Controlled Consumables**: Rare Energy Restores, High Mana Potions, and Elixirs of Vitality.
7. **Showcase Badges & Titles**: Displayed prominently on the player's `@napi-rs/canvas` profile card.

#### Sample Achievement Matrix:

| Achievement Code | Track | Requirement | Tier | Dynamic Rewards Dispatched |
|------------------|-------|-------------|------|----------------------------|
| `COLL_INITIATE`  | Collector | Collect 10 unique cards | Bronze | 500 XP, 1,000 Credits, 2x Minor HP Potions |
| `COLL_ELEMENTAL` | Collector | Collect at least 1 card of each 7 elements | Silver | 1,500 XP, 5,000 Credits, Rare Accessory: *Prismatic Charm* (+5% All Stats) |
| `COLL_MYTHIC_LEGEND` | Collector | Summon or synthesize 1 Mythic Card | Mythic | 10,000 XP, 50,000 Credits, Mythic Title: *Celestial Architect*, 1x *Celestial Ambrosia* (Full Energy) |
| `BATTLE_FIRST_BLOOD` | Combatant | Win 1st PvP Duel | Bronze | 250 XP, 500 Credits, 1x Mana Draught |
| `BATTLE_DUNGEON_50`  | Combatant | Clear Dungeon Floor 50 | Gold | 5,000 XP, 20,000 Credits, UR Equipment: *Glacial Aegis* (+DEF, Freeze perk), 2x *Grand Stamina Flasks* (+30 Energy) |
| `BATTLE_BOSS_SLAYER` | Combatant | Deal 1,000,000 total damage to Raid Bosses | Platinum | 8,000 XP, 35,000 Credits, SIR Equipment: *Dragonheart Armor*, Exclusive Card: *Tiamat #001* |
| `CRAFT_MASTER_FORGE` | Blacksmith | Enhance any Equipment to +10 | Gold | 4,000 XP, 15,000 Credits, 500 Crafting Dust, Secret Rare Relic: *Chrono Core* |
| `DEVOTION_STREAK_30` | Devotion | Maintain 30-day Daily Claim Streak | Gold | 6,000 XP, 25,000 Credits, 3x *Grand Stamina Flasks*, Badge: *Unyielding Flame* |

### 14.3. Event-Driven Architecture & Atomic Claiming
- As players play, the `AchievementService` listens to standardized `EconomyEvent` and `GameEvent` dispatches (`CARD_CLAIMED`, `DUNGEON_CLEARED`, `PVP_WON`, `EQUIPMENT_UPGRADED`).
- Progress is committed to `user_achievements`.
- When an achievement objective is met, the user is notified via an ephemeral Discord ping.
- Rewards are claimed atomically inside a database transaction via `/achievement claim <achievement_id | all>`.

---

## 15. Governance, Dashboard & Role-Guarded Administration

Administrative control over energy ceilings, shop catalogs, and item drops must be secure, role-restricted, and configurable via both the Web Dashboard and Discord slash commands.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                 Governance & Configuration Control Plane                    │
│                                                                             │
│  [ Discord Slash Command ]              [ Next.js Web Dashboard ]           │
│  /tcg-admin config energy max_cap: 350  Waifu TCG Settings Panel            │
│  /tcg-admin config dungeon scaling...   Dungeon Tower Manager Panel         │
│         │                                      │                            │
│         ├── Role Guard Check:                  │ OAuth2 Admin Check:        │
│         │   (TCG Manager Role / Administrator) │ (ManageGuild / Admin)      │
│         │                                      │                            │
│         ▼                                      ▼                            │
│   Unified Configuration Service (packages/core: Zod Schema Validation)      │
│                                 │                                           │
│                                 ▼                                           │
│                 Database Table: `tcg_system_configs`                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 15.1. Configurable Game Parameters
- `global_max_energy_cap`: Integer (Default: `300`, Range: `100` – `1000`).
- `base_energy_capacity`: Integer (Default: `100`, Range: `50` – `200`).
- `energy_scaling_per_level`: Integer (Default: `2`, Range: `1` – `5`).
- `daily_energy_restore_pot_limit`: Integer (Default: `3`, Range: `1` – `10`).
- `daily_replenish_cron`: String (Default: `'0 0 * * *'` - midnight UTC).
- `dungeon_scaling_model`: String (Default: `'EXPONENTIAL'`, Enum: `['LINEAR', 'POLYNOMIAL', 'EXPONENTIAL', 'HYBRID']`).
- `dungeon_growth_rate`: Float (Default: `0.085`, Range: `0.03` – `0.25`).
- `tcg_manager_role_id`: Discord Snowflake (Role permitted to execute `/tcg-admin` commands).

### 15.2. Dual-Interface Access
1. **Discord Command Line**:
   - `/tcg-admin config energy max_cap <value>`
   - `/tcg-admin config energy pot_limit <value>`
   - `/tcg-admin config dungeon scaling_model <model>`
   - `/tcg-admin config dungeon growth_rate <value>`
   - `/tcg-admin config role <@role>`
   - *Security Middleware*: Rejects callers unless they hold the designated `tcg_manager_role_id` or Discord `Administrator` permissions.
2. **Web Dashboard Portal**:
   - Under `/dashboard/[guildId]/waifu-tcg`, administrators can adjust numeric sliders, review live drop telemetry, manage item shop catalogs, configure seasonal dungeon towers with interactive curve visualizers, and toggle achievement reward packs with visual confirmation.

---

## 16. Visual Card Synthesis, Holographic Foiling & Character Catalog

To deliver a premium physical-style collectible experience, Ririko AI 2.0.0 implements an in-process canvas synthesis engine powered by `@napi-rs/canvas`.

Detailed specification: [docs/tcg-card-synthesis.md](file:///Z:/Projects/ririko-v2-2026/docs/tcg-card-synthesis.md).  
Player handbook & guide: [docs/tcg-player-guide.md](file:///Z:/Projects/ririko-v2-2026/docs/tcg-player-guide.md).

### 16.1. 8-Layer Canvas Composition Stack (800 × 1200 px)
Cards are synthesized sequentially across 8 discrete layers:
- **Layer 0 (Elemental Aura)**: Radial gradient base tuned to the card's element (Fire, Ice, Water, Earth, Lightning, Light, Shadow).
- **Layer 1 (Character Artwork)**: High-resolution anime artwork with `cover` fit, top-face anchor preservation, and rounded corner clipping. Takedown requests render a standardized silhouette fallback frame.
- **Layer 2 (Glassmorphic Footer)**: Discord-preview-optimized stat pills (HP, ATK, DEF, SPD), Tactical Active Skill with MP cost, Passive Perk description, serial number `#0001/0350`, and Section 24 mandatory attribution.
- **Layer 3 (Card Frame)**: Metallic border frame scaled by rarity (Slate/Bronze Common, Silver Rare, Gold Super Rare, Platinum Ultra Rare, Full-Art Mythic).
- **Layer 4 (Holographic Foil)**: Blended overlay textures (`assets/tcg/foils/`) using `soft-light`, `overlay`, or `color-dodge` blend modes.
- **Layer 5 (Character Name Banner)**: Top glassmorphic ribbon with bold character name and series sub-title.
- **Layer 6 (Rarity Stars)**: 1 to 8 centered stars (`star.png` or `star_prismatic.png`).
- **Layer 7 (Elemental Badge)**: Top-left 96×96 px circular element emblem (`assets/tcg/elements/`).

### 16.2. Character Catalog & Card Manifest
- **Real Character Catalog (`assets/tcg/catalog/characters.json`)**: 237 real anime characters indexed with AniList IDs, romaji/english names, series titles, and gender tags.
- **Card Manifest (`assets/tcg/catalog/manifest.json`)**: 350+ cards spanning all 7 elements, 8 rarities, and designated starter pool tags (`starter_pool`).

### 16.3. Discord Bot Integration & On-Demand Rendering
- **`CardImageService` (`packages/services/src/waifu-tcg/canvas/card-image.service.ts`)**: Manages disk caching under `public/cards/`. Pre-renders or synthesizes cards on demand.
- **Commands Integration**: `/card claim` and `/card inspect` attach the rendered 800×1200 PNG file directly to Discord messages.
- **Tutorial Integration**: New players running `/dungeon tutorial` or `$climb` receive a random card selected from the starter pool, guaranteeing immediate access to rendered cards.

### 16.4. CLI Tooling
- `pnpm tcg:generate-assets`: Procedurally generates all 20 modular PNG assets in `assets/tcg/` (elements, frames, foils, stars).
- `pnpm tcg:card-builder`: Multi-mode builder tool supporting `--sync`, `--generate`, `--starters`, `--rerender`, `--create`, and `--import-db`.
- `pnpm tcg:reset-user <user_id>`: Resets all Waifu TCG cards, inventory items, dungeon progression, energy, and achievements for a specified Discord user to re-enable fresh onboarding and tutorial testing.

