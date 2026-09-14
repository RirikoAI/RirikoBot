# ADR-010: Waifu TCG assets, rules and ownership

## Status

Proposed future subsystem. Card ingestion, battle rules, ownership, trades, marketplace and TCG guilds are unimplemented. No rarity curve or combat multiplier is accepted as balanced.

## Problem

Legacy `waifu` displays a waifu.im image with tags/favorites/artist attribution. Its separate unfinished item logger has nine rarity labels and inaccurate fractional probability handling; it is not a TCG. The requested game needs reusable attributed assets, configurable rarity/elements, durable card ownership and transactions with the economy.

## Options considered

- Fetch images and generate independent random cards on every command.
- Copy the unfinished legacy item rarity logic and mutable ownership fields.
- Build a normalized asset/catalog pipeline and versioned game rules, with transactional instances and trade locks.

## Decision proposed

Use waifu.im for image acquisition and verified anime metadata sources such as Jikan/AniList where access and attribution permit. Deduplicate source records, validate images and cache assets with provenance, artist/source links, content classification and retention. Do not repeatedly download the same image per command or erase attribution when caching it.

Design an **eight-tier** rarity model and **configurable elemental chart** from game balance requirements. The user's labels/element examples and previous draft percentages are candidates, not fixed validated rules. Use exact integer cumulative weights with a documented total; version rules and seed deterministic tests. Rarity may influence traits/collectibility without making every rare card automatically stronger. Support future elements through data-driven relationships rather than hardcoded branches.

Separate catalog definitions from uniquely identified owned card instances. Card claims, lock acquisition, trade offers/dual confirmations, expiry/cancel, purchases and ownership transfers require explicit state transitions, idempotency and transactional constraints. A card must not be simultaneously available in incompatible offers/listings/battles. Payouts and purchases use the economy service.

Model **TCG guilds separately from Discord guilds**. Add collections, battle teams, quests, marketplace and shared progression in bounded stages; auctions/raids require their own concurrency and balancing tests before exposure.

## Consequences

Catalog/image provenance, rule versions and unique ownership add storage and migration responsibilities. A numerically normalized rarity table is not proof of enjoyable balance or user retention. Transactional ownership still requires correct constraints, cancellation and replay handling. Image redistribution and provider access cannot be inferred from a public URL.

## Validation and evidence

Test RNG boundaries and distribution, chart interactions, versioned replay, deduplication/attribution, concurrent claims, dual trade confirmation, expired/cancelled offers, conflicting locks and cross-currency reconciliation. Require visual QA and human balance feedback. See [legacy inventory](../legacy-feature-inventory.md), [graphics](ADR-006-image-generation-and-canvas-synthesis.md), [economy](ADR-009-centralized-transactional-economy-engine.md) and [database](ADR-003-database-layer-and-dual-dialect-orm.md).
