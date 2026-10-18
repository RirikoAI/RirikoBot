# ADR-010: Waifu TCG Pipeline and Game Design

## Status
Accepted

## Context
Ririko 1.4.0 contained only a bare-bones `waifu` command fetching random selfie images from `waifu.im`. To elevate user engagement, Ririko 2.0.0 requires a flagship collectible card game featuring characters, rarity math, combat mechanics, loadout customizability, tactical consumables, trading, and enduring PvE tower progression.

## Decision
1. **Metadata Ingestion Pipeline**: Ingest characters from open anime APIs (Jikan MAL API, AniList GraphQL, Waifu.im) with automated deduplication, normalization, image verification, and local asset caching.
2. **8-Tier Mathematical Rarity Curve**:
   - Common (60.0%), Uncommon (20.0%), Rare (10.0%), Super Rare (6.0%), Ultra Rare (3.0%), Secret Rare (0.9%), Special Illustration Rare (0.09%), Mythic (0.01%).
3. **7 Elemental Affinities (Including Ice)**:
   - Matrix: Fire > Ice > Earth > Lightning > Water > Fire; Light <> Shadow (mutual advantage).
   - Advantage provides a 1.5x damage multiplier in combat.
   - Status effects: Fire (Burn DoT), Ice (Freeze/Chill speed slow), Earth (Fortify shields), Lightning (Surge crit boost), Water (Purify & Flow heal), Light (Radiance buff), Shadow (Decay life drain).
4. **Dynamic Collectible Card Generator**: Synthesize high-resolution card frames with element icons, holographic foil overlays (Ultra Rare+), character portrait, power stats, and card serial numbers using `@napi-rs/canvas`.
5. **Equipment & Accessory Loadouts**:
   - **Equipments** (Weapon, Armor, Relic): Provide base combat stats plus dynamic **Special Battle Perks** scaling with rarity (Common has no perks; SR+ grants active perks like Vampirism, Glacial Freeze on hit, Mana cost reduction, Phoenix Revive, or Cosmic Cataclysm).
   - **Accessories** (Ring, Amulet, Talisman): Provide pure and hybrid flat and percentage stat amplifiers (ATK %, HP %, DEF %, SPD %, Mana Regen %, Crit DMG %).\
6. **Consumables & Stamina Potions**:
   - HP Potions (restore HP in/between dungeon stages).
   - Mana Potions (replenish card MP for tactical active skills).
   - Energy Restores (Stamina Candy, Grand Stamina Flask, Celestial Ambrosia) strictly rate-limited with a global daily consumption cap (default max 3/day) to prevent hyper-farming bot abuse.
7. **Daily Level-Scaled Energy Lifecycle**:
   - Replenished daily at 00:00 UTC up to level-calculated capacity:
     $\text{MaxEnergy}(\text{Level}) = \min(\text{GlobalCap}, 100 + \lfloor (\text{Level} - 1) \times 2 \rfloor + \text{MilestoneBonus}(\text{Level}))$.
   - Hard global cap configurable via Web Dashboard and role-guarded `/tcg-admin config energy max_cap` command.
8. **Hierarchical PvE Dungeon Architecture (Tutorial $\to$ Seasons $\to$ Floors)**:
   - **Tutorial / Prologue**: Introductory mechanic floors (T1–T4) teaching elements, mana, active skills, in-battle potions, and shield-breaking; gates entry to seasonal towers.
   - **Seasons (S1, S2, S3...)**: 60–90 day cycles featuring distinct elemental themes and environmental affixes (e.g. burn DoTs, speed dampening, mana penalties). Prevents legacy overpowered cards from trivializing new seasons by enforcing elemental counters and mechanics over pure raw stats.
   - **Floors (F1, F2, F3, F4 ... F50+) & Configurable Exponential Scaling**:
     $$\text{MonsterStat}(F) = \text{BaseStat} \times (1 + r)^{F - 1} \times \text{BossMultiplier}$$
     Supports configurable models (`LINEAR`, `POLYNOMIAL`, `EXPONENTIAL`, `HYBRID`) and growth factors ($r$) tunable in the dashboard or via `/tcg-admin`.
9. **Tiered Shop vs. Combat Loot Progression**:
   - **Item Shop**: Sells basic entry gear (Common/Uncommon) and basic potions for in-game credits as an economy sink.
   - **Battles & PvE Dungeons / Raids / Quests**: Drop superior/exclusive Rare, SR, UR, SEC, SIR, and Mythic gears, legendary perks, and rare energy consumables.
10. **Multi-Asset Achievement Engine**:
    - Event-driven tracking across Collector, Combatant, Tycoon, Blacksmith, Devotion, and Guild Hero tracks.
    - Rewards dispatch player XP, credits, exclusive cards, equipments, accessories, rare consumables, and profile badges.
11. **Atomic P2P Trading & Marketplace**:
    - Two-party interactive trade agreements with dual confirmation and ACID transaction safety.
    - Community marketplace with buy-it-now listings, tax sinks, and 7-day expiration.
    - Waifu Guilds (`WaifuGuild`) where players pool cards for server raid boss battles.

## Consequences
### Positive
- Flagship feature creating sustained community retention, social interaction, and server engagement.
- Balanced, mathematically sound rarity distribution and strategic 7-element tactical depth.
- Meaningful progression loops through equipment perks, accessories, dungeon loots, and achievements.
- Prevents powercreep trivialization through seasonal affixes, elemental shields, and exponential floor scaling.
- Controlled stamina economy preventing bot inflation while offering satisfying daily engagement.
- Safe, non-duplicable asset trading with database-level state locking.

### Negative
- Requires local disk storage for caching ingested character images and generated card artwork.
- Additional database tables and foreign keys to manage equipment inventories, achievements, seasonal dungeons, and player stamina.
