# ADR-010: Waifu TCG Pipeline and Game Design

## Status
Accepted

## Context
Ririko 1.4.0 contained only a bare-bones `waifu` command fetching random selfie images from `waifu.im`. To elevate user engagement, Ririko 2.0.0 requires a flagship collectible card game featuring characters, rarity math, combat mechanics, and trading.

## Decision
1. **Metadata Ingestion Pipeline**: Ingest characters from open anime APIs (Jikan MAL API, AniList GraphQL, Waifu.im) with automated deduplication, normalization, image verification, and local asset caching.
2. **8-Tier Mathematical Rarity Curve**:
   - Common (60.0%)
   - Uncommon (20.0%)
   - Rare (10.0%)
   - Super Rare (6.0%)
   - Ultra Rare (3.0%)
   - Secret Rare (0.9%)
   - Special Illustration Rare (0.09%)
   - Mythic (0.01%)
3. **7 Elemental Affinities (Including Ice)**:
   - Matrix: Fire > Ice > Earth > Lightning > Water > Fire; Light <> Shadow (mutual advantage).
   - Advantage provides a 1.5x damage multiplier in combat.
   - Status effects: Fire (Burn DoT), Ice (Freeze/Chill speed slow), Earth (Fortify shields), Lightning (Surge crit boost), Water (Purify & Flow heal), Light (Radiance buff), Shadow (Decay life drain).
4. **Dynamic Collectible Card Generator**: Synthesize high-resolution card frames with element icons, holographic foil overlays (Ultra Rare+), character portrait, power stats, and card serial numbers using `@napi-rs/canvas`.
5. **Atomic P2P Trading & Marketplace**:
   - Two-party interactive trade agreements with dual confirmation.
   - Community marketplace with buy-it-now listings, tax sinks, and 7-day expiration.
   - Waifu Guilds (`WaifuGuild`) where players pool cards for server raid boss battles.

## Consequences
### Positive
- Flagship feature creating sustained community retention, social interaction, and server engagement.
- Balanced, mathematically sound rarity distribution and strategic 7-element tactical depth.
- Safe, non-duplicable asset trading with database-level state locking.

### Negative
- Requires local disk storage for caching ingested character images and generated card artwork.
