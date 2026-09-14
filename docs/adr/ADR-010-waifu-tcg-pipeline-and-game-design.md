# ADR-010: Versioned TCG rules, attributed assets and exclusive ownership

## Status and problem

Proposed future subsystem; no TCG command, catalog, owned card, market, dungeon or battle engine is implemented. The [TCG specification](../waifu-tcg.md) owns candidate mechanics and worked examples. This ADR addresses blueprint22–31,40–41,77–78 and explains architecture, tradeoffs and acceptance rather than certifying balance or engagement.

Legacy waifu displays an image with tags/favorites/artist attribution; it is not a collectible game. Separate unfinished item discovery has nine labels and faulty fractional probability handling. Copying that logger cannot satisfy a new eight-tier game. There is no legacy owned-card population or battle history to migrate.

The requested game includes ingestion, collection, drops, equipment, consumables, daily energy, PvE/PvP, tutorials, seasonal floors, quests, achievements, trading, markets and player guilds. These systems share scarce assets and currency. A button collector or card rendering function cannot own their durable truth.

## Alternatives and selection

| Option | Benefit | Cost / disposition |
|---|---|---|
| Fetch a random image and mint on every command | Fast prototype | Repeated network dependency, duplicates/provenance gaps, unbounded minting; rejected |
| Mutable card record contains art, owner and live rules | Few tables | Content edits rewrite history; art removal destroys ownership; rejected |
| Complete game framework/remote engine immediately | Broad features | Large opaque rules and distributed ownership complexity before evidence; deferred |
| Normalized source assets, immutable catalog/rule versions, unique owned instances and small domain services | Reproducible combat and explicit transaction invariants | Requires content lifecycle, reservations and test fixtures; proposed |
| Rarity determines unconditional combat superiority | Obvious collectible progression | Dominant cards can remove tactical choice; not the default balance assumption |
| Client/model-generated outcomes | Flexible presentation | Untrusted RNG/rules/authority; rejected |

Keep ingestion/rendering separate from deterministic game simulation and transactional settlement. A rendering outage can produce a text/placeholder view of an existing card; it must not reroll or remint it. A battle simulator computes a proposal from a frozen snapshot; the settlement service independently validates its identity/current state and commits the outcome once.

## Decisions

### Provenance survives caching and removal

Ingest through [the bounded asset pipeline](../adapters.md), preserving source ID/URL, metadata, tags, artist/source credits, hash, imported time, storage reference and moderation/removal state. A source/ID unique key and byte hash solve different duplication problems. Two sources with the same bytes can have different credit/removal obligations. Do not infer copyright or redistribution permission from a public API response.

waifu.im remains the required image-acquisition source. Optional anime metadata providers need verified access/terms and reviewed identity matching; matching a similar name is not proof of character identity. Source/provider API research is recorded in the main guide. Fetch new/changed records through bounded workers, serve validated cached assets, and preserve attribution in card footer and response/help. The requested footer includes Image source: waifu.im.

Removal tombstones source associations and retires affected payload/derivatives while preserving instance ID, game attributes and ownership history. Use a safe replacement image/text and disclose unavailable artwork. Do not cascade-delete cards or refund arbitrary historical purchases merely because an image is removed. A content-policy suspension and asset takedown need explicit distinct handling.

### Definitions, instances and rules are separate

A card definition/version describes character, art reference, collection identity, rarity, element, base statistics and versioned passive/skill. An owned instance has unique ID/serial, owner, progression and revision. Equipment definitions likewise differ from equipment instances and stackable consumables. Decimal percentages use a declared integer denominator and rounding order, not uncontrolled floating-point pipelines.

A rules bundle pins rarity weights, element chart, stat/scaling formulas, skill/perk/status behavior, reward tables, energy/consumption limits and content schema version. Validate references and bounds before publication. Running battles freeze an immutable bundle and team/equipment snapshot. Administrative edits create a new version effective at a stated boundary; they do not silently change damage halfway through a turn or reroll a previously accepted reward.

Retain the eight named rarity tiers as the evaluation candidate, with exact cumulative integer intervals. The proposed seven-element chart includes Ice and directed advantages, including mutual Light/Shadow; the complete chart and non-advantage default must be explicit. Normalized probabilities are not evidence of fair progression. Pity, duplicate protection and guarantees, if enabled, are separate persisted policies whose effect on the distribution must be simulated and disclosed. Rarity influences collectibility and possible build choices without making all rare cards unconditionally stronger.

### Deterministic simulation with controlled randomness

Accept only authenticated legal actions at the expected session/turn revision. Server code draws unpredictable production seeds; versioned deterministic tests use fixed seeds. Persist the algorithm/version, draw sequence and snapshot needed for replay. Never derive production draws from a public message ID or trust a submitted seed. Keep undisclosed seeds private until an intentional reveal policy applies; deterministic reproducibility alone is not publicly provable fairness.

Define phases: eligibility/resource reservation, start-of-turn effects, action cost/target legality, ordered hit/crit/element/defense/status resolution, defeat/revive handling, end-of-turn effects and terminal outcome. Every rounding/cap/tie rule must be in the bundle. Guard loops from reflected damage, lifesteal or on-hit procs with explicit depth/once-per-phase limits. Seeded replay must produce identical structured results across supported runtimes; rendering is outside the simulation.

Tutorial T1–T4 teaches mechanics and gates seasonal entry under an explicit completion policy. Seasons retain their own content window, affixes and linear/polynomial/exponential/hybrid scaling model; floors can grow only inside validated numeric/resource bounds. Define rollover admission versus already running battles and reward cutoff. Neither exponential growth nor elemental shields proves powercreep is solved. Progression and economic rewards require simulation plus playtesting.

### Exclusive ownership and atomic settlement

One active reservation per owned card/equipment instance spans equip, battle, trade and market operations. Reservation type, operation owner, revision and expiry are durable. Battle admission atomically promotes the existing equipped reservation into a battle-bound state for that same loadout; it cannot acquire a second incompatible lock. Completion restores the prior equipped state under matching generation/revision, while cancellation or repair must not unlock a newer loadout. Release checks the same operation identity; an expired worker cannot release a newer reservation. Stacks use nonnegative available/reserved quantities. Favoriting is presentation metadata and does not permit a second owner.

Trades bind parties, normalized assets/credit holds, offer revision, expiry and both confirmations. Editing the offer clears prior confirmations. Settle only the current revision while checking ownership/reservations and accounts in one database transaction. A listed/equipped/battle-reserved card cannot enter a competing trade. Market buy/cancel/expiry compete on the same listing state; ownership, buyer debit, seller credit and fee sink commit together through [economy](ADR-009-centralized-transactional-economy-engine.md). A lost Discord reply returns the stored receipt rather than transferring again.

Energy reset/spend/refund, potion quantity/effect/daily count, enhancement resources/result, dungeon completion/rewards and achievement claim/bundle are equivalent transaction boundaries. Reset epochs and reward identities survive restart. Separate ordinary energy from bonus overflow and define spend order/cap changes. A scheduled reset and lazy read cannot both grant energy. An achievement unlocking is not itself a grant until the unique claim commits; multi-asset rewards cannot be partially delivered as unrelated transactions.

### Player guilds and mediated administration

Use WaifuGuild/player-guild IDs distinct from Discord guild IDs. Membership/ranks, contribution history, leader succession, treasury permissions/spending ceilings and shared boss rewards have separate contracts. A Discord administrator is not automatically a player-guild treasurer. Guild bank uses the same ledger; it is not another mutable integer field. A global COIN-funded treasury remains in the global currency realm with a player-guild owner and rank-based authority, not an implicit conversion into another currency scope. Boss contribution records distinguish simulated damage from actually applied damage when concurrent hits exhaust remaining HP.

Web/CLI/Discord administrative controls call the same validated services with actual authority, expected revision and audit. Game values are bounded data and allowlisted formulas, never uploaded arbitrary scripts. Preview changes to live seasons, weights, caps, fee rules and item availability. Preserve historical rules and an explicit emergency-disable/recovery path. No ordinary AI tool can mint cards, transfer ownership or choose a battle result.

## Consequences and rollout

The design costs more persistence and content discipline than a random-image command, but it isolates artwork availability, game computation and scarce-asset settlement. It requires tested reservation expiry and repair tooling, retained content versions, visual credits QA and operator storage controls. Transactional design still depends on correct code/constraints; it is not a claim of non-duplicability before adversarial tests.

Stage implementation by dependency: safe source/catalog and rule validation; instance/drop/collection; simulation/energy/equipment; tutorial/PvE/progression/rewards; then trade/market/player guild extensions with proven economy settlement. Keep each implementation scope groomed and stop at its chosen epic/story PR boundary. This architecture does not authorize all those stages in the current documentation epic.

## Acceptance and revisit triggers

Require source identity/hash collisions and removal tests; every RNG interval boundary and invalid total; complete element chart; a worked damage calculation with exact rounding; replay and illegal/stale action rejection; concurrent claim/equip/trade/market races; offer edit invalidating confirmations; buy-versus-expiry; potion/reset/spend races; season rollover; enhancement no-reroll retry; multi-asset achievement atomicity; guild treasury authorization; concurrent final boss hit and reward deduplication.

Run real SQLite/PostgreSQL transaction tests, deterministic simulator/property fixtures, bounded distribution/economy simulations and human tactical/visual review. No simulation, source API call, card rendering or combat test was executed by this ADR edit. Candidate rarity, multiplier, floor growth, season length, enhancement and consumption values remain unaccepted until reviewed evidence exists.

Revisit when rules cannot replay, a source changes access/attribution, concurrent reservations cause unrecoverable contention, measured progression rewards become exploitable or unengaging, or a distributed topology becomes necessary. Preserve instances and history through versioned migrations. Replacing an image provider, gameplay formula or engine must not silently rewrite ownership or completed outcomes. See [database](../database.md), [image ADR](ADR-006-image-generation-and-canvas-synthesis.md) and [testing](../testing.md).
