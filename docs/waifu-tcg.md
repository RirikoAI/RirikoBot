# Waifu Trading Card Game (TCG) — Complete Design & Technical Specification

## 1. System Overview

The **Waifu TCG** is Ririko AI 2.0.0's flagship gamification subsystem. It combines open-source character metadata
ingestion, mathematically balanced 8-tier collectible cards, tactical elemental combat, P2P atomic trading, a community
player marketplace, and collaborative player guilds.

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
- **Unique Active Skill**: Triggered during tactical combat (e.g. "Glacial Prison: Deals 180% Ice ATK and freezes target
  for 1 turn").
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
   leveling materials, and rare card shards. Consumes Daily Energy.
2. **Quests & Dungeons (`/game dungeon`)**: Battle through procedural PvE stages with increasing difficulty, elemental
   boss encounters, and elemental advantage requirements.
3. **PvP Duels (`/game pvp <@user> [wager]`)**: Challenge another server member to an elemental 3v3 card duel with
   optional credit wagers escrowed in database transactions.
4. **Cooperative Boss Raids (`/game boss`)**: Server-wide or guild-wide massive HP bosses where all members combine card
   damage to earn exclusive seasonal card frames.
5. **Daily & Weekly Missions**: Complete specific battle and claim milestones to earn free summons and gems.

### 6.2. Card Inventory & Collection Commands

- `/card collection [filter: element/rarity] [sort: level/rarity/name]` — Paginated interactive visual album with
  filters for Fire, Ice, Earth, Lightning, Water, Light, and Shadow.
- `/card inspect <card_id>` — High-resolution card embed displaying foil art, full stats, skill, and history.
- `/card equip <card_id>` — Assign card to active combat deck slot (locks card from trade/market).
- `/card favorite <card_id>` — Protects card from accidental sale or dismantling.
- `/card dismantle <card_id>` — Break down duplicate cards into crafting dust to upgrade card star ratings.

---

## 7. Atomic Trading & Player Marketplace

### 7.1. P2P Card Trading (`/game trade <@user>`)

- Two-party interactive Discord modal / select menu trade session.
- **State Locking**: Offered cards are instantly marked `state = 'IN_TRADE'` in `user_cards`. Locked cards cannot be
  equipped, dismantled, transferred, or listed on the market.
- **Dual Confirmation**: Both parties must inspect the full trade proposal (cards + offered credits) and click
  `[Confirm Trade]`.
- **Atomic Transfer**: All card ownership updates and coin transfers occur inside a single ACID database transaction.

### 7.2. Community Player Marketplace (`/game market`)

- Players can list idle cards for sale at a custom credit price.
- **Listing Lock**: Listed cards enter `state = 'IN_MARKET'`.
- **Market Tax**: Configurable listing fee (e.g. 5% coin sink) deducted upon listing or sale to control bot economy
  inflation.
- **Expiration**: Unsold listings expire automatically after 7 days, returning the card to the seller's inventory.

---

## 8. Waifu Guilds (`WaifuGuild` vs `DiscordGuild`)

To avoid architectural confusion, in-game player factions are strictly named **`WaifuGuild`**, completely separate from
Discord servers (`DiscordGuild`):

- **Creation**: Players can form a `WaifuGuild` with custom name, emblem, and motto.
- **Guild Progression**: Members contribute XP through card battles, leveling up the guild to unlock member capacity and
  guild shop buffs.
- **Guild Bank**: Shared credit pool used by guild leaders to activate server-wide raid bosses.
- **Guild Raids**: Cooperative PvE boss battles with guild leaderboard standings.
