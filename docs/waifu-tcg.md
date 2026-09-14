# Waifu TCG — candidate rules and implementation contract

## Status, scope and terminology

**No TCG runtime, command, ownership table, combat engine or market exists in the foundation.** This is a detailed candidate design for BP-22–31, BP-40–41 and related economy/storage/security requirements. Every probability, stat, reward, price, cooldown, duration and formula below is a **balance candidate requiring simulation, playtesting and approval before release**, not accepted balance or completed implementation. `TCG-C1` names the illustrative ruleset in this document, not a deployed version.

The design retains all eight rarity tiers and the breadth of the compared Gemini proposal while specifying missing state, arithmetic, replay, authority and failure rules. Blueprint rarity/element examples are not final balance decisions. The [requirement ledger](requirements.md), [database proposal](database.md), [economy contract](economy.md), [provider/asset rules](adapters.md) and [TCG ADR](adr/ADR-010-waifu-tcg-pipeline-and-game-design.md) are companion contracts. TCG is new work; do not rename the legacy anime `waifu` command into a collection system without an explicit compatibility plan.

| Term | Meaning / authority |
|---|---|
| `DiscordGuild` | Discord server; managers configure its drop channels, permitted hours and local feature access |
| `WaifuGuild` | Player faction with membership, ranks, progression and ledger-backed treasury; distinct ID/permissions |
| Player | Global Discord-user identity for owned cards, energy and progression |
| Credits / coins | Display aliases for internal currency key `COIN`, explicitly mapped to global legacy coins; no silent currency conversion or per-server duplication |
| Card definition/version | Catalog identity, art reference and immutable combat/content data |
| Owned card | Unique instance with owner, serial, level, XP, revision and exclusive-use state |
| Rules version | Published immutable balance/content manifest bound to accepted runs, draws, trades and rewards |

Operator authority controls global supply, energy rules and shared economy. A Discord manager or configurable local TCG role cannot mint global credits/cards or alter other servers' progression. Player-faction leaders do not acquire Discord moderation authority.

## 1. Service and persistence boundaries

Proposed services divide ingestion/catalog, drops, collection/loadout, combat, dungeon/expedition, energy, inventory/shop, trade/market, achievements/quests and player factions. Commands call services; services call reviewed transaction contracts; providers/renderers remain replaceable edges. This is not one giant command or a generic script-execution engine.

[Database](database.md) proposes source/image/card versions, owned instances, reservations, inventory stacks, equipment, energy transactions, runs/turns, reward receipts, trades/listings and faction records. Only foundation settings tables are installed today. Every mutation receives an authenticated actor, operation key, expected object/offer/session revision and typed inputs. Same key/different payload conflicts. Durable results and ledger/ownership events are committed before a success message. A lost Discord reply returns the recorded result on retry, never another draw or reward.

Currencies, material counts, energy and stats use bounded integers; API bigint amounts use canonical decimal strings where needed. Rarity/element keys are versioned content data rather than an irreversible SQL enum. Query by owner/scope with stable keyset pagination; never load everyone's cards for one collection page.

## 2. Ingestion, attribution and removal

Waifu.im is the required image acquisition candidate. Its [official documentation](https://docs.waifu.im/) exposes an image REST API and filtering; documentation availability does not establish unrestricted redistribution or permission for every image. Verify current terms, authentication, quotas, requested content filters and asset-specific attribution before connecting. AniList/Jikan may later enrich metadata through separately assessed adapters; image tags alone do not prove a character/anime identity.

Proposed pipeline:

1. Schedule bounded ingestion with source identity, cursor, adapter/schema version and access evidence. Never call upstream on every collection/inspect command.
2. Validate metadata, content eligibility and source/artist credits. Unknown character identity remains unknown or awaits curation; do not infer canon from an arbitrary filename.
3. Apply [safe network/decode controls](adapters.md): public permitted URL, DNS/redirect checks, streamed byte/pixel/frame limits, verified format and worker isolation.
4. Hash validated bytes, stage storage, commit asset reference plus source provenance, then clean orphan stages. Source-image identity and content hash serve different purposes: shared bytes can have multiple source/credit records.
5. Publish a reviewed card definition/version referencing an approved asset. Define stats/skills independently of scraped popularity or arbitrary upstream tags.
6. Render/cache from local/object storage with versioned template and source attribution. Hash/template/version changes invalidate derivatives predictably.

For waifu.im-derived art, show **Image source: waifu.im** in card/footer output and appropriate response/help attribution; retain artist/source link when supplied and permitted. Do not label unrelated/generated art as sourced from waifu.im. Cached bytes retain provenance. “Open API” is not a license for all artwork.

Removal marks source/asset state, blocks new derivatives, invalidates shared/derived caches and schedules physical deletion. Owned instances and battle/ownership history remain, with a neutral placeholder and unchanged mechanical definition unless a separate balance action is approved. Ownership continuity does not guarantee unchanged player-market price. Check shared-byte references so removal obligations are honored without discarding unrelated provenance. Deletion also covers stored Discord/object URLs according to control/retention limits; no promise of erasing copies outside the application's control.

## 3. Rarity, catalog stats and randomness

### Eight-tier candidate

Draw from an integer range `[0,1_000_000)` using the following disjoint half-open intervals. All weights must be nonnegative integers and sum to the configured total; at least one eligible definition must exist for any positive-weight tier.

| Tier | Weight | Interval | Candidate stat-budget factor | Card level cap | Presentation |
|---|---:|---|---:|---:|---|
| Common | 600000 | [0,600000) | 1.00 | 20 | Standard frame |
| Uncommon | 200000 | [600000,800000) | 1.20 | 30 | Bronze trim |
| Rare | 100000 | [800000,900000) | 1.50 | 40 | Silver sheen |
| Super Rare / SR | 60000 | [900000,960000) | 1.90 | 50 | Gold shimmer |
| Ultra Rare / UR | 30000 | [960000,990000) | 2.50 | 60 | Prismatic |
| Secret Rare / SEC | 9000 | [990000,999000) | 3.20 | 70 | Dark foil |
| Special Illustration Rare / SIR | 900 | [999000,999900) | 4.00 | 85 | Full art |
| Mythic | 100 | [999900,1000000) | 5.00 | 100 | Cosmic frame |

These intentionally preserve the compared proposal's candidate distribution: 60%, 20%, 10%, 6%, 3%,0.9%,0.09%,0.01%. A factor allocates a **design budget**, not an automatic multiplier on every attribute. Tank/support/control roles trade attack, speed, survivability and utility; a rare card should not dominate every role. Artwork rarity is also not a copyright/license claim. Competitive normalization is a separate mode rule, not a silent change to owned stats.

Definitions contain stable ID/version, name/collection number, source-anime identity if verified, rarity/element, HP/ATK/DEF/SPD/MP, crit basis points, skill/passive IDs and flavor text. Candidate authoring ranges: HP 500–15000, ATK 50–2500, DEF 30–1800, SPD 10–300, crit 500–5000 basis points, base MP 100. These are catalog validation candidates; scaled dungeon enemies can exceed them. Owned XP/level progression references a versioned curve; a level-up increments under that curve without retroactively changing settled runs.

### RNG and pity

Production draw entropy must be unpredictable to players; deterministic tests inject known seeds. Candidate replay generator: HMAC-SHA256 keyed by a random server secret seed over a canonical domain/run/draw-counter encoding. For a bound N, take a fixed-width unsigned block, reject values at or above `floor(2^width/N)*N`, then use modulo N. Increment counter for every consumed/rejected block. This avoids modulo bias; exact encoding, width and algorithm version must be frozen and tested before implementation.

Use independent RNG domains for rarity, catalog selection, combat crit/status and loot. Store private seed securely, rules/table digest, counter and accepted draw result atomically. A public seed commitment may be shown before a closed PvP match and revealed afterward; never reveal a seed that predicts future shared loot. Replaying a request returns stored result, not another counter draw. Candidate fairness transparency is not proof against a malicious operator.

Boundary tests include 599999/600000,998999/999000,999899/999900 and 999999; reject 1000000. Empty eligible pool cannot silently downgrade rarity. Decide duplicate policy per banner: allow duplicates, or draw within eligible unowned set with an explicitly defined exhausted-pool result. Repeated image/card sources must not create duplicate catalog identities accidentally.

**Optional pity is disabled in C1 by default.** A candidate opt-in banner guarantees Rare-or-better on the 100th eligible personal draw after 99 lower-tier outcomes; guaranteed distribution renormalizes weights among Rare+ tiers. Counter is player/banner/rules-version scoped, updated with the draw, and resets on any eligible Rare+ result. Trades, market buys, public drop claims, tutorial grants and replayed requests do not advance/reset it. Publish precise eligibility/reset/migration rules before enablement; a guild cannot exploit local weights to mint globally rare assets outside operator supply policy.

## 4. Seven-element chart and effects

Candidate chart: Fire beats Ice, Ice beats Earth, Earth beats Lightning, Lightning beats Water, Water beats Fire; Light and Shadow mutually advantage. Table is attacker row, defender column; values are basis points (10000=1.0). Reverse five-cycle edges resist at 7500; all other pairs neutral. The reverse resistance is an explicit C1 addition, not an assumption from the blueprint.

| Attack / defend | Fire | Ice | Earth | Lightning | Water | Light | Shadow |
|---|---:|---:|---:|---:|---:|---:|---:|
| Fire |10000|15000|10000|10000|7500|10000|10000|
| Ice |7500|10000|15000|10000|10000|10000|10000|
| Earth |10000|7500|10000|15000|10000|10000|10000|
| Lightning |10000|10000|7500|10000|15000|10000|10000|
| Water |15000|10000|10000|7500|10000|10000|10000|
| Light |10000|10000|10000|10000|10000|10000|15000|
| Shadow |10000|10000|10000|10000|10000|15000|10000|

Elements permit thematic skills; they do not automatically grant every effect in the following catalog. Each effect needs a versioned explicit trigger, potency, target, duration and stacking group.

| Theme/effect | Candidate exact rule |
|---|---|
| Fire Burn | End-of-round 30 damage for a 300-ATK source at 10% snapshot ATK, for 2 rounds; ignores DEF/crit/element but ordinary shields absorb; strongest same-group burn wins, duration refreshes |
| Ice Chill / Freeze | Chill reduces effective SPD 25% for 2 rounds; Freeze skips one own action opportunity;15% proc only on designated skill/perk; after skip, immune to Freeze until two further own opportunities pass |
| Earth Fortify | Grants a numeric shield or scoped mitigation from the skill, not generic invulnerability; shield cap 50% max HP |
| Lightning Surge/Shock | Surge adds 1500 crit basis points, still capped 5000; Shock skips only if explicit stun rule and control-immunity checks allow, never an undefined micro-stun |
| Water Purify/Flow | Removes specified negative groups; regen 8% max HP per round for 2 rounds, clamped to missing HP; no automatic full-team heal |
| Light Radiance | Explicit team ATK buff or pierce amount, bounded and versioned; does not bypass all defenses merely by element |
| Shadow Leech | Designated effect heals 20% of actual HP damage, excluding overkill/shield/DoT/reflected damage |

Effects with the same stacking group use strongest potency, then newest application for equal potency; positive/negative percentages have declared caps. Dispel order uses stable effect ID. No recursive counter/heal/proc loops: reactive effects cannot trigger another reaction chain unless explicitly allowed, with a hard engine bound and deterministic resolution.

## 5. Drops, claim races and collections

Candidate local drop settings: configured guild/channel, minimum interval 15 minutes, 100 eligible messages by at least 5 distinct humans since prior eligible window, allowed hours 08:00–23:00 in stored guild timezone, one active drop,60-second claim window and 5-minute claimant cooldown. All are configurable within operator ceilings. Spam-filtered/replayed/bot/webhook activity contributes zero; users should not be encouraged to send meaningless messages to trigger drops.

The service atomically consumes an eligible activity window, selects and stores the result/rules digest, creates the drop and durable announcement intent. A failed announcement does not draw another card. Claim button contains opaque drop identity; actor/guild/channel/expiry/state are revalidated server-side. Inside one transaction, conditional `open -> claimed` chooses one winner, creates one owned instance/ownership event, updates cooldown and writes the receipt. Expiry competes on the same state. A late click receives the recorded winner/expiry without minting anything. Only successfully announced or explicitly recoverable drops accept claims under the chosen display policy.

Collection views filter rarity/element/anime/name/favorite, sort by stable level/rarity/name + instance ID and paginate without scanning all users. Duplicate counts group catalog/edition identity, not byte hash. Inspect shows source credit, definition version, serial, actual stats, level/XP, gear and public transfer provenance while hiding private trade/balance data.

Candidate owned states: `idle`, `equipped`, `in_trade`, `in_market`, `in_expedition`, `in_battle`, `dismantled`. State plus reservation operation/revision controls exclusivity. A battle atomically promotes the existing equipped reservation into a session binding and restores the same still-valid loadout generation on completion; it never adds a second competing lock or makes active instances tradable. Section 13 defines stale-generation handling. Favoriting is a protection flag, not a new owner state: require explicit unfavorite before sale/dismantle. Dismantling consumes a duplicate instance and grants versioned dust once; no refund or reroll on response failure.

All command examples here are **proposed**, with corresponding prefix forms required by command contracts: `/card collection`, `!card collection`; `/card inspect id:...`, `!card inspect ...`; `/card equip id:... slot:1`, `!card equip ... --slot 1`; `/card favorite id:...`, `!card favorite ...`; `/card dismantle id:...`, `!card dismantle ...`. Final registration must fit Discord command nesting limits and preserve existing anime names.

## 6. Combat: exact C1 resolution

### Match snapshot and actions

Candidate mode is 3v3 with a fixed ordered roster per side. A match freezes card/gear/content/rules versions, effective starting stats, RNG seed commitment and participants before acceptance. Equipped assets are reserved for the run; inventory edits afterward do not change the snapshot. One living card gets one action opportunity per round in descending effective SPD; equal SPD uses stable side/slot order stored in the snapshot, with starting-side selection seeded once. Recompute order at round start, not mid-round after a slow.

An authenticated action submits match ID, expected revision, active-card ID, action/target and operation key. Supported actions: basic attack, skill, guard, consumable and surrender. Candidate player choice timeout 30 seconds chooses guard; three consecutive missed opportunities for a player forfeits PvP after an explicit warning. PvE can suspend at a safe persisted choice boundary. Match hard limit 30 rounds yields PvP draw/refund according to wager policy; PvE failure. No infinite waiting/combat loop.

### Round and action phases

1. **Round start:** validate nonterminal state; activate scheduled environmental/enrage effects; calculate living-card SPD/order from snapshot plus active effects. Apply round-start scripts in stable IDs.
2. **Own opportunity start:** increment card opportunity counter; expire effects/cooldowns whose recorded boundary is reached; regenerate 10 MP up to effective max; check death/control skip. Freeze consumes the opportunity and sets immunity; it does not suppress record advancement.
3. **Action validation:** recheck actor/turn/revision, target eligibility, MP/cooldown/item availability and action limits. Invalid request does not consume MP/item/RNG; legal timeout action is explicit.
4. **Pay and calculate:** consume MP or reserved consumable, set skill next-available opportunity, consume designated RNG draws, resolve ward and numeric damage under formulas below.
5. **Apply:** shields then HP loss, death prevention/revival, actual-damage healing, nonrecursive on-hit/counter effects and status application in defined order. Dead targets do not receive later ordinary heals; explicit revive may apply once.
6. **Action commit:** append deterministic action events and updated revision/counters. Check whole-team defeat after resolving action/death-prevention batch. Same revision retry returns result.
7. **Round end:** apply ordered DoTs then regeneration for surviving cards, process deaths, decrement round-based effect durations, evaluate victory/draw, persist next-round state. Effects applied in this round tick at this round end unless definition explicitly says next round.

A skill used at own opportunity t with cooldown 2 is next eligible at t+2, not immediately after a same-turn decrement. Candidate basic attack costs 0 MP/power 10000; ordinary skill costs 40 MP/power 18000/cooldown 2. Guard adds 2500 mitigation until next own opportunity. A combat potion consumes the action; no free potion plus skill in one opportunity except an explicit content effect granting an action.

### Integer damage and limits

Let `B=10000` and `mul(x,m)=floor(x*m/B)`. Compute catalog-level stats, then enhanced flat gear, then additive capped percentage gear/buffs, flooring each stage. Preserve the exact order in rules version. Candidate crit cap 5000, armor pierce cap 8000, summed mitigation cap 7500; effective stat floors HP 1/ATK 1/DEF 0/SPD 1/MP 1.

```text
D_eff = floor(DEF * (10000 - pierce_bp) / 10000)
raw   = max(1, floor(ATK * power_bp * 100 / (10000 * (100 + D_eff))))
x1    = floor(raw * element_bp / 10000)
x2    = floor(x1 * crit_bp / 10000)       # 15000 on critical, otherwise 10000
x3    = floor(x2 * bonus_damage_bp / 10000)
damage= max(1, floor(x3 * (10000 - mitigation_bp) / 10000))
```

A valid attack normally hits; C1 has no independent accuracy/evasion draw. Crit uses uniform integer 0..9999 and succeeds below effective crit chance. Immunity/ward returns zero by explicit rule before `max(1)`. Ordinary shield absorbs first; HP damage is min(remaining damage,current HP). Healing/leeches use actual HP loss, never raw/overkill damage. All intermediate arithmetic uses bounded wide integers; reject invalid content/overflow before starting a run.

True damage bypasses DEF, element, crit and normal shield only when the effect explicitly says so; it still respects encounter wards/invulnerability and declared reduction policy. It never recursively crits, leeches or activates on-hit chains. Healing clamps to max HP, cannot revive unless marked revive, and uses explicit healing modifiers. Ward is a mechanic distinct from numeric shield: one matching-element damaging action breaks one layer and deals zero HP damage; nonmatching hits cannot break it. Multihit/true-damage perks do not bypass this rule.

### Worked replay

Fire attacker: ATK 300, skill power 18000, crit chance 2500, MP 100. Ice defender: DEF 120, shield 100, HP 1000. No pierce; element 15000; RNG crit draw 1234 succeeds; damage bonus 11000; mitigation 1000. Compute raw 245 -> element 367 -> crit 550 -> bonus 605 -> final 544. Shield absorbs 100, HP loses 444 and becomes 556. A12% leech heals `floor(444*1200/10000)=53` up to attacker missing HP. Skill leaves 60 MP; cooldown next eligible t+2.

If that skill also has a declared 100%-application Burn at 10% snapshot ATK for 2 rounds, store 30 tick damage. At round end, with shield now 0, defender goes 556 ->526, then any separately active regeneration resolves. DoT does not crit/leech. Replay records draw 1234, every intermediate value, shield/HP deltas, MP, cooldown and effect application; the same seed/version/actions must reproduce the same terminal hash.

This example is arithmetic evidence, not a tested combat implementation. A reducer must reject unknown action/content versions, unauthorized targets and duplicate move sequences, and bound triggers/events per action (candidate 64) to contain malicious or cyclic content definitions. Engine failure quarantines the run and preserves snapshots instead of granting victory/reward.

## 7. Tutorial, seasons and dungeon scaling

### Tutorial T1–T4

Tutorial uses loaner cards/items with fixed deterministic encounters so a new player is not blocked by rarity ownership. Entry costs 0 energy; repeated runs grant no repeatable economy reward. One completion receipt per player grants the starter bundle once: fixed starter card, Common Novice Blade, 3 Minor HP Potions and `TUTORIAL_COMPLETE`. Loaner inventory cannot be traded, dismantled or retained accidentally.

| Floor | Lesson | Observable completion condition |
|---|---|---|
| T1 Elemental Resonance | Fire/Ice and reverse resistance | Player inspects preview and lands a favorable-element hit; show exact multiplier |
| T2 Mana and skills | MP, cooldown, basic attack fallback | Spend MP on a skill then use basic attack while skill unavailable |
| T3 Tactical supplies | HP/MP potion cost, clamping and action consumption | Use supplied potion on a valid target; invalid/full target consumes nothing |
| T4 Layered wards | Required-element sequence and shields | Break displayed Fire→Lightning→Ice required-attack layers, then defeat training boss |

Tutorial hints teach mechanics without changing server-side validation. Completion unlocks seasonal/competitive entry; accessible text equivalents accompany images. A reconnect resumes the persisted tutorial step, never grants another starter bundle.

### Seasons, progression and finite execution of open-ended floors

Candidate seasons last 60–90 days, but actual start/end instants and reward cutoff are published explicitly. `S1`, `S2`, `S3` identify content versions, with a historical Hall of Fame snapshot on archive. Sequential F1,F2,... has no designed final floor; F50 is a milestone, not the end. Every 5th floor is an elite, every 10th a major boss; major classification **replaces**, not multiplies, elite bonus.

“Infinite floors” means an extendable positive-integer namespace and deterministic generation, not unbounded memory/arithmetic or infinitely many precreated rows. Materialize a bounded frontier (candidate 100 floors) and generate the next reviewed range as progression approaches it. Validate stat/iteration limits before publishing; a floor beyond the supported frontier is visibly unavailable until content validation extends it. Never overflow integers, hang the worker or quietly change the formula to keep running. Design new mechanics/limits before numbers exceed safe supported ranges.

Run start checks unlocked floor, active season, energy, roster and content version, then reserves/promotes assets and charges energy atomically. Completion records result, first-clear claim, progress and reward bundle once. Two parallel finishes cannot both obtain first-clear reward. Store individual floor reward receipt, not only highest-cleared value. Candidate one active expedition/battle reservation per asset; a player may browse while a run is active.

At season end no new run starts; an already accepted run has a published grace deadline (candidate 24 hours), then resolves as timeout under its original version. History/owned loot survives archive. Seasonal leaderboard/rating reset does not wipe global cards/COIN/XP. New season rules never mutate a frozen old run.

### Environmental affixes and wards

| Season candidate | Exact C1 affix interpretation |
|---|---|
| S1 Infernal Crucible | Scorched Earth deals 6% max HP at even round ends unless an explicit Earth ward or current-round Water cleanse marks protection. Heat Haze subtracts 1500 crit basis points from non-Fire cards, floor 0 |
| S2 Abyssal Maelstrom | Deluge multiplies SPD by 7500 basis points at round order calculation. Designated Lightning skills chain to adjacent living roster slots with 12000 power multiplier for the chain hit; one chain depth, no recursive bounce. Boss Tidal Barrier heals 8% max HP at end of every 3rd round only if no Freeze/Shock was successfully applied during those three rounds |
| S3 Celestial Twilight | Light↔Shadow chart entries become 20000 for this season. HP healing multiplier 6000 applies to direct heals, regeneration and leech; explicit revival, shields and energy restoration are exempt |

Affix application order follows combat phases and stable effect IDs. Percentages affect effective values at defined boundaries, not repeated compounding on every UI refresh. Preview shows active affixes and modifiers before spending energy.

High-floor wards expose required attacking-element sequence (e.g. Fire→Lightning→Ice). A matching action breaks one layer and does no HP damage; nonmatching/true-damage hits cannot bypass it. Element-based ward requirements must be reachable through loaner/earned roster options before gating mandatory progression. This offers tactical diversity; it does not prove every historical Mythic remains competitively equal.

Candidate boss soft enrage begins round 10: attack multiplier `1+max(0,round-9)` (2x at 10, 3x at 11), applied to baseline encounter ATK rather than compounding last round. Designated enrage true-damage strike occurs once per boss opportunity using its frozen content rule. Hard round cap still ends the fight. Any alternative cadence/damage must be a new published content version.

### Four scaling models with one rounding rule

Let `x=F-1`; input base stats are HP 1200/ATK 120/DEF 80/SPD 25. Candidate boss multiplier is 1.00 normal, 1.75 elite, 3.20 major. Apply the same selected scalar to each listed base stat and **floor once at the final stat expression** using exact rational arithmetic; do not round recursively after each floor.

| Model | Candidate definition and constraints |
|---|---|
| Linear | `S(F)=1+k*x`, candidate k=0.10 |
| Polynomial | `S(F)=1+a*x+b*x*x`, candidates a=0.05,b=0.005; coefficients nonnegative |
| Exponential | `S(F)=(1+r)^x`, candidate r=0.085; use rational 10850/10000 exponentiation |
| Hybrid | F≤10: `1+0.10*x`; 11≤F≤25: `1.9*(1.06)^(F-10)`; F≥26: `1.9*(1.06)^15*(1.085)^(F-25)`; boundary continuity explicit |

For each stat, `Stat(F)=floor(Base*S(F)*BossMultiplier)`. Config ranges/coefficients require monotonicity, overflow/resource and reachable progression checks. Stats are wide integers; UI abbreviations never feed combat arithmetic. Speed may grow beyond catalog-card bounds for enemies, which highlights balance risk rather than silently capping this table.

Exact-rational exponential sample, r=0.085:

| Floor | Type | HP | ATK | DEF | SPD |
|---|---|---:|---:|---:|---:|
| F1 | Normal |1200|120|80|25|
| F5 | Elite |2910|291|194|60|
| F10 | Major |8002|800|533|166|
| F20 | Major |18092|1809|1206|376|
| F30 | Major |40906|4090|2727|852|
| F40 | Major |92489|9248|6165|1926|
| F50 | Major |209116|20911|13941|4356|
| F100 | Major |12355926|1235592|823728|257415|

These values are recomputed from the equation; the compared Gemini table did not match its stated formula. The steep late-floor SPD/DEF makes the candidate unsuitable for acceptance without balance simulations, alternate per-stat curves and achievable team tests. Formula correctness is not game-balance proof. A visualizer must derive the same integer engine values rather than plot a different approximation.

## 8. Gear, accessories and enhancement

Each owned card has six candidate slots: Weapon, Armor, Relic, Ring, Amulet and Talisman. Each item instance occupies at most one slot/card; compatible owner, state and slot are checked transactionally. Flat enhanced gear is added before capped percentage modifiers. Inventory selection shows the exact before/after stat preview and preserves original version for an active match.

| Slot | Candidate focus | Example |
|---|---|---|
| Weapon | ATK, crit chance/damage, attack perk | Obsidian Katana, Solar Lance |
| Armor | HP, DEF, mitigation, defensive perk | Dragonscale Plate, Glacial Aegis |
| Relic | SPD, mana/element utility, tactical perk | Chronos Hourglass, Phoenix Feather |
| Ring | ATK percentage, crit, pierce | Ring of the Blazing Sun |
| Amulet | HP/DEF percentage, elemental resistance | Heart of the Mountain |
| Talisman | SPD, MP capacity/regeneration | Windwalker Talisman |

Perk candidates preserve all compared rarity roles but receive bounded trigger semantics:

| Tier | Example perk and C1 bounds |
|---|---|
| Common/Uncommon | Raw stats or small modifier such as +10 ATK/+2% DEF, no proc chain |
| Rare | Sharpened Edge +8% direct physical damage against a target with Armor slot occupied; included once in bonus stage |
| SR | Vampiric Touch heals 12% actual direct HP damage; enhancement milestones 18%/+5 and 25%/+10; no DoT/reflection/overkill |
| UR | Glacial Counter 25% chance to Freeze a direct attacker once per defender own-opportunity interval; control immunity applies; no counter-to-counter loop |
| SEC | Mana Conduit 25% MP cost reduction, final cost rounded up with minimum 1 for nonfree skill; +25 max/starting MP |
| SIR | Phoenix Ward revives once per match at 35% max HP after fatal damage, clears disabling effects, consumes revive marker before follow-up triggers |
| Mythic | Cosmic Cataclysm at each 3rd own opportunity emits one 200%-ATK true-damage strike at a deterministic chosen target; bypasses ordinary shield/DEF, never encounter ward or reaction limits |

Cosmic strike resolves in own-opportunity phase only after control skip check, before selected action, and can terminate the encounter before further action. It cannot activate during Freeze, clone itself through extra actions, or trigger leech/crit. Perks are typed content identifiers with parameters, not user-authored scripts. Rarity alone does not automatically grant the named perk to every item.

Candidate enhancement is +0..+10 with deterministic success in C1, avoiding an undefined loss/reroll system. Flat gear bonus at enhancement n is `floor(baseBonus*(10000+500*n)/10000)` (+5% additive each level). Percent affixes do not automatically compound; only specified +5/+10 perk milestones change them. Enhancing from n to n+1 costs `10*(n+1)` Crafting Dust and `100*(n+1)` COIN units; both are candidate sinks. +10 total cost is 550 dust/5500 COIN. Separate material/ledger and item-revision changes commit once under request identity.

Dismantling duplicates yields a versioned dust table, candidate 10/20/40/80/160/320/640/1280 for the eight tiers. Reject favorite/reserved/equipped/last protected starter items; show confirmation with immutable instance ID/revision and expected material yield. Dismantled instances remain tombstoned in ownership history. Item enhancement never secretly consumes equipped materials or allows changing a battle snapshot mid-run.

## 9. Consumables and limits

C1 resolves the compared “300 HP or 25%” ambiguity by choosing a specific effect per item. Potions clamp to missing HP/MP and ordinarily require a living eligible target. No-effect full-resource use is rejected without consuming inventory. An accepted effect consumes stack quantity and applies combat/energy change in one transaction or match-event commit.

| Item | Candidate effect | Acquisition |
|---|---|---|
| Minor HP Potion | Restore 300 HP | Basic shop/tutorial |
| Major HP Potion | Restore 1200 HP | Dungeon/crafting |
| Elixir of Full Vitality | Restore to max HP and clear negative effects | High-tier quest/boss; no revive |
| Mana Draught | Restore 30 MP | Basic shop |
| Greater Mana Potion | Restore 70 MP | Mid-tier dungeon/quest |
| Cosmic Ether | Restore max MP and grant one next-opportunity free skill ignoring its cooldown; token expires after that opportunity and does not grant extra action | Raid-exclusive |
| Stamina Candy / shop Energy Biscuit | Restore 15 energy up to capacity | At most 1 shop purchase per player UTC day |
| Grand Stamina Flask | Restore 30 energy up to capacity | Limited loot/rewards |
| Celestial Ambrosia | Fill total energy up to current capacity | Rare achievements/events; does not add an entire capacity above existing energy |

Candidate combat limit:3 consumable actions per player per match, each consumes that player's current card opportunity. Tutorial loaners are exempt from economic consumption but not action rules. Candidate energy-restorer cap:3 items per player UTC day across all guilds and all restore tiers; Ambrosia also counts. Shop purchase cap and consumption cap are different durable counters. A retry or two simultaneous uses cannot consume the same last item/counter slot twice.

Energy potions are unavailable during a combat action and cannot change already paid entry cost. Rare explicit bonus-energy awards are a separate content effect, with a bounded bonus allowance, not an unbounded potion side effect. Basic shop never sells unlimited restores or high-tier gear. Cosmetic/premium monetization is not introduced by this candidate design.

## 10. Energy lifecycle and reset races

Energy derives from the player's global progression level chosen by the shared XP rules; a Discord server's local ranking level must not increase a global energy pool. For capacity only, let `L=max(1, derivedGlobalLevel)`: a new player whose economy level is 0 therefore receives the level-1 capacity, while their displayed progression level remains 0. The derived level comes from the shared global XP curve; this mapping does not award XP.

```text
milestone(L) = 0 for 1..9; 5 for 10..24; 15 for 25..49;
               30 for 50..74; 50 for 75..99; 75 for 100+
C(L) = min(300, 100 + 2*(L-1) + milestone(L))
```

| Level | Uncapped | Capacity C |
|---|---:|---:|
|1|100|100|
|10|123|123|
|20|143|143|
|25|163|163|
|40|193|193|
|50|228|228|
|60|248|248|
|75|298|298|
|90|328|300|
|100|373|300|

Store regular pool E, separate bonus pool B, capacity/rules revision, last reset UTC date, daily restore count and energy transaction identity. Normally 0≤E≤C and B≥0; total available isE+B. Bonus is granted only by explicit content receipts with a proposed 100-unit new-bonus ceiling; existing grandfathered bonus is never deleted merely for exceeding a later ceiling.

**Once per new UTC date**, in the same transaction as the first operation or scheduled reset, set `E'=max(E,max(0,C-B))`, keep B unchanged, reset the daily restore-use counter and advance reset date. This yields total `max(oldTotal,C)` and preserves overflow without adding a fresh full capacity on top. Same-day reads/claims never refill. Missed dates do not accumulate many daily refills. Scheduled and lazy reset contend on the same expected revision/date; only one applies.

Before applying a new lower capacity version, normalize any E excess into grandfathered B: `excess=max(0,E-C); E-=excess; B+=excess`, audit once under that rules transition. Total is preserved. Then apply daily top-up only if a new day is due. Higher capacity/level-up changes the ceiling without automatic immediate refill; next eligible reset or explicit restore follows normal rules. No level oscillation can farm refill. Candidate spending consumes B first then E; refund uses original operation receipt exactly once and restores recorded amounts under explicit cap/grandfather rules.

Example: C=100, E=80, B=35, total 115. Midnight leaves E=80/B=35/total 115, not 215. Spend 30 leaves E=80/B=5/total 85. Same-day read stays 85. Next day top-up sets E=95 and B=5, total 100. Concurrent midnight dungeon entry and reset both use the same row/revision: serialize reset then entry in one transaction so entry cost cannot disappear under a later refill.

| Activity | Candidate energy cost |
|---|---:|
| Tutorial T1–T4 |0|
| Expedition 1h /4h /8h |10 /25 /45|
| Dungeon F1–10 /F11–25 /F26–40 /F41+ |10 /15 /20 /25|
| World or player-guild boss attempt |30|
| Ranked PvP duel |5 per player|

Charge only when an accepted run is durably created. User defeat/surrender does not refund entry; verified system failure before meaningful execution can issue an audited idempotent refund. A UI timeout alone does not prove system failure. No per-minute regeneration is enabled in C1; adding it is a new rules change with anti-double-credit tests.

## 11. Shop, loot, quests and expeditions

Basic town shop offers Common/Uncommon gear, basic Ring/Amulet/Talisman and minor potions for COIN. Candidate examples: Novice Blade, Iron Hauberk, Wooden Buckler, Scout Boomerang, Copper Band, Leather Choker and Simple Bangle. Content defines exact slot compatibility; a buckler cannot invent an extra seventh equipment slot. Each stock version has price, quantity, UTC per-player purchase cap and availability window. Price is quoted with version/expiry; transaction rechecks stock, funds, item rules and receipt before debit/mint.

Rare+ loot is earned through accepted gameplay, not unlimited basic-shop purchase: F1–25 Rare, F26–50 SR, F51–100 UR/SEC, raids SIR/Mythic fragments or curated awards. These brackets are candidate access bands, not guaranteed every-run drops. A loot table has integer weights, eligible pool, roll count, per-run caps, pity eligibility and guaranteed/minimum slots. Store the draw/result at settlement; delayed claiming cannot reroll or use a newer table. Separate card, gear, materials and consumable pools avoid accidentally making rare artwork probability equal to rare equipment probability.

Expeditions reserve selected idle/equipped-eligible cards through a promoted expedition reservation, freeze party/content/duration, charge energy and create due job. At due time compute/recover the stored seed/version outcome, settle rewards once and restore prior compatible reservation state. Cancellation policy is shown before start: candidate no reward/no entry refund after departure; operator/system cancellation can use reviewed compensation. No polling UI or process uptime determines completion.

Daily/weekly quests instantiate from versioned templates using player + template + UTC period identity. Candidate goals include valid dungeon clears, varied combat actions, eligible card acquisition and faction contribution; raw chat count is not a direct mint trigger. Progress consumes unique accepted domain events, not repeated Discord notifications. Daily resets at 00:00 UTC, weekly Monday 00:00 UTC; late events use persisted occurrence/acceptance policy, never whichever worker wakes first. A completed quest locks its reward version and is claimed once before its declared grace deadline. Chain reactions are bounded: reward acquisition does not recursively trigger unlimited reward quests.

## 12. Achievements: six tracks, five tiers

Tracks: Collector, Combatant, Tycoon, Blacksmith, Devotion and Guild Hero. Every track supports Bronze, Silver, Gold, Platinum and Mythic definitions. A tier is a content difficulty/reward category, not an automatic repeatable payout. Candidate progress metrics and tier thresholds:

| Track | Metric | Bronze / Silver / Gold / Platinum / Mythic |
|---|---|---|
| Collector | Distinct catalog cards ever legitimately acquired |10 /50 /150 /400 /1000|
| Combatant | Eligible victories with repeat-opponent abuse filtering |1 /25 /100 /500 /2000|
| Tycoon | Net eligible market seller proceeds in COIN; excludes self/collusive reversals |1000 /10000 /100000 /1000000 /10000000|
| Blacksmith | Successful distinct item enhancement milestone events |1 /10 /50 /200 /1000|
| Devotion | Accepted economy daily-claim streak sequence |3 /7 /30 /90 /365|
| Guild Hero | Eligible faction contribution XP |100 /1000 /10000 /100000 /1000000|

Devotion consumes the economy daily-claim event and its authoritative streak value: the candidate rolling policy allows a new claim after 24 hours and preserves continuity through 36 hours. It does not create a second coin claim or a midnight reset. UTC quest, potion and energy periods remain separate.

Additional named achievements can use other predicates: all seven elements, a first Mythic, floor 50, +10 enhancement or total accepted raid damage. Retain state needed for historical metrics: selling a card does not erase “ever acquired”, while “currently own one of each element” is a different predicate. A trade between alternate accounts must not farm repeated acquisition rewards.

Candidate bundles preserving the compared design's breadth:

| Code | Requirement / tier | Candidate one-time reward |
|---|---|---|
| `COLL_INITIATE` |10 unique cards, Bronze |500 XP, 1000 COIN, 2 Minor HP Potions|
| `COLL_ELEMENTAL` |Own all 7 elements, Silver |1500 XP, 5000 COIN, Rare Prismatic Charm accessory|
| `COLL_MYTHIC_LEGEND` |First eligible Mythic, Mythic |10000 XP, 50000 COIN, Celestial Architect title, 1 Ambrosia|
| `BATTLE_FIRST_BLOOD` |First eligible PvP victory, Bronze |250 XP, 500 COIN, 1 Mana Draught|
| `BATTLE_DUNGEON_50` |First F50 clear, Gold |5000 XP, 20000 COIN, UR Glacial Aegis, 2 Grand Flasks|
| `BATTLE_BOSS_SLAYER` |1000000 accepted raid damage, Platinum |8000 XP, 35000 COIN, SIR armor, curated exclusive card|
| `CRAFT_MASTER_FORGE` |First +10 item, Gold |4000 XP, 15000 COIN, 500 dust, SEC Chrono Core|
| `DEVOTION_STREAK_30` |30-day claim streak, Gold |6000 XP, 25000 COIN, 3 Grand Flasks, Unyielding Flame badge|

Bundle can include XP, COIN, cards/tickets, gear/accessories, limited consumables and cosmetic titles/badges. A second “gems” currency is not silently added; it requires an explicit currency design. These rewards are deliberately unbalanced candidates until economic simulations constrain supply.

Progress, unlock and claim are distinct. Consume deduplicated domain events; on unlock create notification intent, not an impossible unsolicited ephemeral response. Notify via permitted channel/DM or show on the next user interaction. Claim checks user/achievement/period/version and atomically transitions unclaimed→claimed with ledger, XP, items/card ownership and reward receipt. Claim-all is a bounded set of individually replay-safe claims, returning partial failures clearly; one corrupt reward definition must not duplicate already committed awards. Achievement reward events cannot unlock their own source recursively.

## 13. Trades, market and player guilds

### Trading and reservation promotion

A card/equipment has **one authoritative exclusive reservation**. Equipping creates a loadout reservation; starting a battle/expedition atomically promotes/binds that existing reservation to the session and records its previous owner/generation. It must not acquire a second competing reservation that rejects every equipped squad. Finish restores the same still-valid loadout generation, otherwise returns safely to idle under current ownership. New session/owner revisions cannot be overwritten by a stale finish.

Trade proposal stores two parties, exact normalized asset rows/quantities, COIN offers, offer revision, expiry and request receipt. Offered assets reserve once; COIN uses held funds in the same global account realm. A hold reduces spendable `posted-held`; it is not an additional posted transfer to escrow. Acceptance captures posted debit and releases held amount once while crediting the other party. Do not reserve and transfer the same money twice.

Every edit invalidates both confirmations. Both actors confirm the same current offer revision; reject bots/self-trades or other disallowed participants under policy. Settlement visits accounts/assets in canonical order, verifies owners/states/holds, transfers all assets and balances, records ownership/ledger events and marks settled in one transaction. Repeated confirmation returns receipt. Reject/cancel/expire conditionally releases only matching reservation/holds. A crashed UI cannot strand funds forever; durable expiry remains authoritative.

### Marketplace

Candidate listing duration 7 days and sale fee 5% (500 basis points). Choose **fee on successful sale** in C1; no extra listing fee. Fee is `floor(price*500/10000)` with a candidate minimum 1 unit when price>0, capped at price. Publish fee/version/net proceeds before listing. Buyer pays price, seller receives price-fee, treasury/sink receives fee in a balanced COIN transaction. Cancellation/expiry before sale charges no fee.

Listing requires idle tradeable nonfavorite instance, positive bounded integer price, matching owner and unique reservation. Buy/cancel/expire compete on active state/revision. In one transaction check buyer funds, capture payment, move ownership, record fee and purchase, release listing reservation and mark sold. Exactly one buyer wins. A seller cannot change price under an old quoted purchase; stale quote conflicts. Asset image removal keeps mechanical ownership but displays placeholder and clear listing notice.

Browse filters rarity/element/type/price with stable cursors; show sold/expired state after stale click. Anti-abuse policies flag wash trades/manipulated achievements without rewriting legitimate completed ledger history. Refund/dispute handling uses compensating operations and explicit ownership feasibility, not deleting old transactions.

### WaifuGuild administration

Candidate faction creation has unique normalized name, emblem/motto, leader, member ranks, capacity/XP progression and ledger-backed bank. Global COIN remains in the **same global currency realm**; a treasury account changes owner kind to player-guild and owner ID, not currency/scope conversion. Deposits debit player/credit treasury; spending requires faction capability and configured ceilings.

| Role | Candidate authority |
|---|---|
| Leader | Transfer leadership, assign officers, publish faction policies, approve treasury spends/disband under safeguards |
| Officer | Invite/manage eligible lower ranks, schedule approved quests/raids, limited spending only when delegated |
| Member | Contribute, participate, view permitted treasury/progress data |
| Discord manager | Configure local bot access; no automatic faction ownership or treasury right |
| Bot operator | Enforce global safety/freeze/recovery through audited administrative actions, not silent asset seizure |

Membership limit is a versioned rule; one-player-one-faction is a candidate constraint, not assumed database magic. Contributions are unique accepted events. Leadership transfer atomically ensures exactly one leader; departure/disband cannot orphan active holds, raids or treasury. Candidate disband first freezes admission/spending, settles/cancels active work and follows a published treasury disposition; no arbitrary leader cashout is implied. Guild quests, bosses and leaderboards use faction identity distinct from Discord channel destination.

## 14. PvP, cooperative raids and settlement

PvP challenges bind participants, 3-card rosters, rules/mode, wager and expiry. Both accept before energy/wager admission. Ranked mode may use a separately published stat normalization/gear restriction to avoid raw rarity domination; default candidate has no real-money advantage. Candidate no wager in tutorial/unranked practice.

Wager admission follows the economy escrow contract: each player first holds the agreed stake; both accepting the same revision atomically captures both holds into match escrow and releases their held amounts. Cancellation before capture releases holds. After capture, victory pays the winner and published fee from escrow; draw or eligible system cancellation refunds the original stakes from escrow, never adds a second hold release or wallet credit. For the shared candidate example, two 100-COIN stakes fund escrow 200; victory pays winner 190 and fee treasury 10, while a draw refunds 100 to each. One settlement identity makes victory, timeout and cancellation mutually exclusive. Timeout/surrender is a declared loss, not a free cancellation exploit.

Cooperative boss attempt freezes player party and boss/content state for simulation, then conditionally applies damage to shared boss HP. Store simulated damage and accepted `min(simulated,currentHP)` separately; two finishing attacks cannot both claim the same final HP/reward. Participation rewards use accepted damage and eligibility, not raw overkill. One final settlement closes the boss and publishes a bounded eligible-player reward set with unique claims. A queued run after boss death follows published refund/participation policy and cannot create a second kill.

Faction/world raid rewards, daily/weekly missions and achievement events derive from settled records. Notifications may replay; reward issuance cannot. Disconnect does not decide victory, and the LLM never chooses ownership or payout. Sessions/replays retain enough bounded evidence to explain a result without publishing private credentials or future RNG seeds.

## 15. Versioned administration and safety

All example UI/commands are future proposals. Use valid root/group/subcommand shape, e.g. `/tcg-admin energy set max-cap:300 pot-limit:3`, `/tcg-admin dungeon set model:exponential growth-bp:850`, with corresponding prefix wrappers and the same service. Do not invent deeper slash nesting or imply those commands exist now. Global settings are exposed only through an authenticated operator plane; local guild forms show only their permitted subset.

| Setting group | Candidate values / bounds | Authority and activation |
|---|---|---|
| Global energy | Base 100 (50..200), growth 2 (1..5), cap 300 (100..1000), restore 3 (1..10) | Operator; versioned migration/reset policy; no immediate repeated refill |
| Global content | Eight rarity weights, card/item/loot versions, enhancement costs, pity policy | Operator/content reviewer; validate supply/simulation before publish |
| Dungeon | Four models, growth 850bp candidate (300..2500), boss multipliers, affix IDs | Operator/season editor; preview exact arithmetic/frontier and freeze active runs |
| Local drops | Channel/hours/interval/activity/claim duration/local enablement | Guild manager or explicitly delegated role within global ceilings |
| Faction policy | Ranks, invite/spending ceilings, raid schedule | Faction leader/delegated capability only |
| Recovery | Freeze, compensate, quarantine/requeue, source removal | Explicit audited operator action with original operation references |

Configuration flow is draft → schema validation → dependency/curve/supply simulation → review → publish immutable version → activate at declared time/scope. Edits use displayed revision and conflict UX. Never hot-reload battle arithmetic into an active match. New global rarity/supply settings cannot be set by a local manager role. Seasonal “affix JSON” is schema-validated typed content, not arbitrary JavaScript/SQL or unchecked recursive effects.

Audit includes actor, scope, before/after version, reason, activation, simulation/reference and compensation identity. Rollback activates a previous compatible version for new work; it does not rewrite settled combat or erase mint/transfer records. Exposed dashboards should show current/pending version, last validation and permitted controls without implementation secrets.

### Proposed player entry points

These are a registration proposal, not currently callable commands. Slash and prefix wrappers resolve to the same service, operation identity and permission checks. Identifiers/options are illustrative; autocomplete can help select eligible assets without relaxing server-side validation.

| Workflow | Slash proposal | Prefix counterpart |
|---|---|---|
| Exploration / expedition | `/game explore duration:1h` | `!game explore --duration 1h` |
| Daily/weekly quests | `/game quest period:daily` | `!game quest --period daily` |
| PvP challenge | `/game pvp opponent:@user wager:100` | `!game pvp @user --wager 100` |
| Cooperative boss | `/game boss action:join id:...` | `!game boss join ...` |
| Dungeon admission | `/dungeon enter floor:5` | `!dungeon enter --floor 5` |
| Trade proposal | `/game trade user:@user` | `!game trade @user` |
| Market browse / purchase | `/game market browse`, `/game market buy listing:...` | `!game market browse`, `!game market buy ...` |
| Player faction | `/game guild status`, `/game guild contribute amount:100` | `!game guild status`, `!game guild contribute 100` |
| Achievement claim | `/achievement claim id:...` or `id:all` | `!achievement claim ...` or `!achievement claim all` |
| Inventory / potion | `/inventory view`, `/inventory use item:...` | `!inventory view`, `!inventory use ...` |

A button-based continuation stores session/offer revision and actor binding; it cannot replace required counterparty consent. Claims return bounded receipts and accessible text when a card render fails. Expired controls show the authoritative terminal state and a fresh entry point. Registration must reconcile shared economy inventory names and preserved legacy command names before release.

## 16. Acceptance and release gates

| Area | Required deterministic/concurrent scenario |
|---|---|
| Ingestion | Duplicate source/hash retains all credits; failed stage commit and removal preserve ownership |
| Rarity/pity | Every interval endpoint, zero/invalid weights, empty pool, exact pity boundary, request replay and counter rollback |
| Drops | Concurrent claim/expiry, duplicate announcement, spam window replay, wrong actor/guild/channel |
| Collection | Other-user instance denied; stable pagination; favorite/dismantle protection |
| Battle | Same seed/snapshot/actions → same hash; rounding example; crit/status boundaries; cooldown/freeze/perk loop bounds; stale move |
| Equipment | One instance/slot; promotion of equipped reservation; stale finish cannot restore wrong generation |
| Energy | UTC reset versus simultaneous spend/restore; missed days; cap decrease preserves total; level-up no refill farming |
| Dungeon | T1–T4 grant once; major replaces elite; exact scaling values; first-clear race; season grace/archive/version |
| Inventory/shop | Last-stack race, daily buy/use counters, no-effect potion, quote/version conflict, atomic resource consumption |
| Achievements | Duplicate events, unlock/claim separation, multiasset rollback, bounded claim-all and anti-recursive reward |
| Trading/market | Offer edit clears acceptance; cancel/settle/expire race; hold capture once; fee conservation; two buyers |
| Factions/raids | Global treasury conservation, leader transfer/disband, final-HP race, one final reward set |
| Operations | Crash/restart at receipt boundaries, provider/Discord failure, retention/restore, no false completion claims |

Simulation must evaluate rarity supply, time-to-competitive roster, energy-limited daily rewards, inflation/sinks, potion access, reachable seasonal floors, first/second-player win rates and rarity/gear/element matchups. Report seeds/sample size/confidence and pathological builds; no “mathematically balanced” label follows from a distribution summing to 100%. Run real SQLite/PostgreSQL transaction and failure tests before exposing ownership or funds. No such TCG test suite exists yet; this document's arithmetic checks validate examples only.

Release incrementally within groomed tickets: provenance/catalog/ownership → safe draws/collection → inventory/energy and combat reducer → tutorial/dungeons/quests → market/factions/competitive modes, with each exposed slice fully validated. This is dependency guidance, not permission to start multiple tickets or bypass the epic PR checkpoint. Remaining balance choices, real source access, renderer output and gameplay usability remain explicit acceptance work.
