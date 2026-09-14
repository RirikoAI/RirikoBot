# ADR-010: Waifu TCG Pipeline and Game Design

## Status
Accepted

## Context
Ririko 1.4.0 contained only a bare-bones `waifu` command fetching random selfie images from `waifu.im`. To elevate user engagement, Ririko 2.0.0 requires a flagship collectible card game featuring characters, rarity math, combat mechanics, and trading.

## Decision
1. **Metadata Ingestion Pipeline**: Ingest characters from open anime APIs (Jikan MAL API, AniList GraphQL, Waifu.im) with automated deduplication, normalization, image verification, and local asset caching.
2. **8-Tier Mathematical Rarity Curve**:
   - Common (40.0%)
   - Uncommon (25.0%)
   - Rare (15.0%)
   - Super Rare (10.0%)
   - Ultra Rare (5.0%)
   - Epic (3.0%)
   - Legendary (1.5%)
   - Mythic (0.5%)
3. **6 Elemental Affinities**:
   - Matrix: Fire > Earth > Wind > Water > Fire; Light <> Dark (mutual advantage).
   - Advantage provides a 1.5x damage/stat multiplier in combat.
4. **Dynamic Collectible Card Generator**: Synthesize high-resolution card frames with element icons, holographic foil overlays (Ultra Rare+), character portrait, power stats, and card serial numbers using `@napi-rs/canvas`.
5. **Atomic P2P Trading & Marketplace**:
   - Two-party interactive trade agreements with dual confirmation.
   - Community marketplace with buy-it-now and auction listings.
   - Waifu Guilds where players pool cards for server raid boss battles.

## Consequences
### Positive
- Flagship feature creating sustained community retention, social interaction, and server engagement.
- Balanced, mathematically sound rarity distribution.
- Safe, non-duplicable asset trading.

### Negative
- Requires local disk storage for caching ingested character images and generated card artwork.
