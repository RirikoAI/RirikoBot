# Adventure progression balance comparison

Regenerate with `node --import tsx scripts/adventure-reward-balance.ts`. Rank E / level 18 targets 10% above repeat floor 34 at 20 energy. 10,000 seeded runs per scenario/rank, fixed WATER companion with 150 ATK/DEF/SPD and sufficient currency/offering items. Standard policy chooses uniformly among all buttons, including paid and losing routes. Free-only E rows show choice-policy sensitivity; they do not set the target. Net credits subtract paid credits, losses and item offerings at canonical shop prices. Energy is actual modeled entry plus drain minus restoration (new cap 7), assuming 100 initial energy and no concurrent energy changes. Loot counts are successful card intents with available definitions; companion XP is the grant budget before rarity-cap clipping. Higher ranks intentionally retain the requested multipliers, rather than remaining only 10% ahead of floor 34. Solo runs grant no companion XP. These estimates are not guaranteed payouts or optimal-route claims.

[Full rank and sensitivity figures](adventure-reward-balance.json). No solution routes are included.

| Adventure | Net credits | Player XP | Dust | Companion XP budget | Net energy | Card chance* | Credit advantage | Free-only net credits |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| The Goblin Bazaar of Whispers | 770.0 | 153.0 | 61.5 | 780.7 | 15.9 | 35.4% | 10.7% | 797.4 |
| The Sunken Shrine of Leviathans | 808.2 | 161.0 | 64.5 | 821.7 | 16.7 | 29.6% | 10.6% | 773.9 |
| The Cursed Crypt of the Forgotten King | 959.7 | 190.7 | 76.4 | 974.8 | 20.0 | 17.1% | 9.5% | 959.7 |
| The Celestial Peaks of Aether | 644.4 | 128.2 | 51.6 | 655.4 | 13.4 | 30.4% | 10.3% | 644.4 |
| The Highwayman’s Ambush | 739.9 | 147.3 | 59.3 | 754.0 | 15.5 | 35.6% | 9.2% | 778.9 |
| The Clockwork Orchard | 743.8 | 147.8 | 58.9 | 757.5 | 15.4 | 25.8% | 10.4% | 753.3 |
| The Lantern Marsh | 739.1 | 147.3 | 58.0 | 753.1 | 15.4 | 25.4% | 9.5% | 739.1 |
| The Glass Desert | 805.0 | 159.5 | 64.1 | 816.3 | 16.6 | 24.6% | 11.1% | 805.0 |
| The Wandering Library | 720.8 | 143.7 | 57.8 | 733.9 | 15.0 | 29.6% | 9.8% | 731.0 |
| The Ember Forge | 794.0 | 158.1 | 62.4 | 808.2 | 16.5 | 24.8% | 10.1% | 794.0 |
| The Moonlit Menagerie | 722.1 | 143.2 | 57.5 | 733.3 | 15.0 | 29.5% | 10.0% | 722.1 |
| The Storm Train | 795.4 | 158.0 | 62.8 | 806.5 | 16.4 | 22.2% | 11.1% | 808.1 |
| The Coral Court | 733.3 | 145.7 | 58.1 | 745.3 | 15.2 | 25.4% | 10.0% | 733.3 |
| The Hollow Theater | 746.7 | 147.0 | 58.5 | 754.0 | 15.4 | 25.3% | 10.7% | 746.7 |
| The Frostbound Lighthouse | 748.7 | 150.2 | 60.1 | 764.8 | 15.7 | 25.1% | 8.8% | 748.7 |
| The Sleeping Colossus | 753.5 | 149.3 | 59.5 | 765.4 | 15.6 | 28.5% | 10.4% | 753.5 |
| The Mushroom Post | 721.4 | 144.0 | 57.8 | 734.0 | 15.0 | 29.9% | 9.9% | 729.1 |
| The Silver Mill | 732.7 | 145.7 | 58.4 | 744.6 | 15.2 | 25.3% | 10.1% | 732.7 |
| The Thorn Castle | 745.1 | 149.3 | 59.1 | 760.7 | 15.5 | 25.9% | 9.9% | 745.1 |
| The Starfall Crater | 818.7 | 162.8 | 65.0 | 830.7 | 16.9 | 24.6% | 10.9% | 838.9 |
| The Paper Palace | 733.5 | 146.0 | 58.2 | 747.0 | 15.2 | 26.5% | 10.2% | 733.5 |
| The Dragon Kitchen | 720.6 | 142.7 | 57.2 | 731.1 | 15.0 | 29.7% | 9.8% | 720.6 |
| The Drowned Bell | 730.7 | 145.8 | 57.8 | 745.9 | 15.2 | 26.4% | 9.8% | 730.7 |
| The Mirror Lake | 747.8 | 148.6 | 59.5 | 759.5 | 15.5 | 24.5% | 10.4% | 758.0 |
| The Ash Caravan | 752.8 | 150.4 | 59.4 | 767.8 | 15.6 | 26.2% | 10.2% | 777.4 |
| The Windmill Sky | 723.1 | 143.5 | 56.9 | 734.1 | 15.0 | 26.0% | 10.3% | 739.0 |
| The Forgotten Observatory | 734.8 | 146.5 | 58.5 | 748.1 | 15.3 | 30.2% | 9.8% | 734.8 |
| The Silk Labyrinth | 756.2 | 150.5 | 60.5 | 767.8 | 15.7 | 26.1% | 10.3% | 756.2 |
| The Honey Citadel | 721.2 | 144.0 | 57.1 | 734.9 | 15.0 | 30.0% | 9.9% | 721.2 |
| The Ghost Regatta | 728.1 | 144.5 | 57.8 | 740.2 | 15.2 | 30.7% | 9.9% | 728.1 |
| The Basalt Garden | 750.2 | 149.4 | 59.2 | 763.2 | 15.5 | 25.5% | 10.4% | 750.2 |
| The Midnight Bakery | 721.8 | 143.6 | 57.0 | 733.8 | 15.0 | 30.0% | 10.0% | 726.8 |
| The Thunderstep Arena | 807.4 | 159.7 | 63.3 | 818.7 | 16.6 | 27.0% | 11.2% | 807.4 |
| The Last Snowglobe | 741.2 | 147.1 | 58.9 | 751.2 | 15.4 | 30.0% | 10.3% | 741.2 |
| The Dawn Archive | 739.1 | 146.4 | 58.7 | 753.1 | 15.4 | 29.6% | 9.9% | 739.1 |

*Mean cards per run, including authored guaranteed cards; this is not a rarity-upgrade chance. Ordinary progression is calibrated independently of card/item value. Failures still have reduced completion rewards, while decisions retain their authored bonuses, losses and loot. Authored fixed wager components remain fixed; every finished run also receives its calibrated completion rewards.
