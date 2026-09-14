# Waifu TCG design — pending implementation
TCG is a new system, not legacy feature parity. No card commands, market or card ownership tables are implemented at this checkpoint. Gameplay probabilities/elements in the original drafts were examples, not final balance decisions.

Ingest verified sources such as waifu.im through a bounded asset pipeline: validate URL/DNS/redirects/content/size/dimensions, hash content, store original source ID/metadata/attribution and cache locally or in object storage. Card presentation preserves attribution. Takedown/moderation must detach imagery without destroying ownership history.

Define configurable weighted rarity and element charts with deterministic seeded tests. Ownership states prevent one card being equipped, traded, listed and transferred simultaneously. Trade acceptance, market purchases/fees, claims and cancellation use checked transactional transitions with idempotency. Collection/search/paging and combat/quests/player guild features follow as explicit services. Never label Discord guilds and player guilds with the same internal entity.

