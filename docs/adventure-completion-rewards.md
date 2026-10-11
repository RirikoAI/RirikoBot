# Adventure Rewards and Ranks

This page explains what an adventure pays and how your companion's level changes it. For the rules of the game, read [adventure-game.md](adventure-game.md).

## 1. What You Get

Every finished adventure pays rewards. This includes bad endings.

- **Credits**
- **Player XP**
- **Crafting Dust**
- **Companion XP.** Your active card gets XP. A solo run gives none.
- **Items and cards.** These depend on the story and on luck.

The final ending sets how much you get:

| Ending | Reward size |
|---|---|
| Critical success | The largest |
| Success | Large |
| Mixed | Medium |
| Failure | Small |
| Critical failure | The smallest |

Costs you paid during the story and credits you lost to bad events are taken off your total. Ririko shows the real change in the result message. It leaves out values that are zero.

The route you pick and the costs you pay change the real result.

## 2. Reward Ranks

Your rank comes from the level of your companion at the moment you start. The rank stays the same until the story ends. A level-up in the middle changes nothing.

| Rank | Companion level | Bonus |
|---|---|---|
| F | No companion, or levels 1 to 9 | None |
| E | 10 to 19 | +50% |
| D | 20 to 29 | +100% |
| C | 30 to 39 | +150% |
| B | 40 to 59 | +200% |
| A | 60 to 79 | +300% |
| S | 80 to 99 | +400% |
| S+ | 100 | +500% |

Run `/adventure action:ranks` (or `!adv ranks`) to see this table in Discord.

The bonus raises:

- credits,
- player XP,
- Crafting Dust,
- companion XP,
- the chance of an item or a card drop. The chance never goes above 100%. For example, at S+ a 10% chance becomes 60%.

The bonus does not change:

- the price of a choice,
- credit losses and energy losses,
- fixed wager results,
- the number of cards you get.

## 3. Card Chances

Each ending has a chance to give you a card. The chance is higher at higher ranks.

| Ending | Base chance | At rank E | Lowest rarity |
|---|---|---|---|
| Success or critical success | 20% | 30% | Rare |
| Mixed | 15% | 22.5% | Rare |
| Failure or critical failure | 10% | 15% | Uncommon |

Some stories have their own sure drops. They stay. If a story already gave you a card, Ririko does not add another card chance. If no card of the needed rarity exists, you get no card, and the result says so. You never get a card of a lower rarity.

## 4. Companion XP

- The XP goes to the card that started the story. You must still own it. It must not be in a trade or a market listing.
- A card at its highest level for its rarity gets no more XP.
- If the card is not available, the other rewards still arrive.

## 5. Energy

- An adventure costs 15 energy.
- A finished adventure can give back at most 7 energy.
- Events in the story can take energy away. Ririko shows one final number that includes the 15 energy of the entry.

For example, a story that costs 15 energy and takes away 5 more shows `Energy: -20`. If you abandon a story, Ririko gives back 7 of the 15 energy, so you lose 8.

When an admin turns energy off for a server, a story neither costs nor restores energy. You wait 15 minutes between starts.
