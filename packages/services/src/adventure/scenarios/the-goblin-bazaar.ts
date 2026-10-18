import type { AdventureScenario } from '../types.js';

export const goblinBazaar: AdventureScenario = {
  id: 'the-goblin-bazaar',
  version: 1,
  title: 'The Goblin Bazaar of Whispers',
  description:
    'Bargain beneath the city, outwit smugglers, and carry your prize past the sewer guards.',
  color: 9133302,
  risk: 'BALANCED',
  elements: ['SHADOW', 'LIGHTNING'],
  totalDecisions: 5,
  energyCost: 15,
  rootNodeId: 'root',
  nodes: {
    root: {
      type: 'decision',
      id: 'root',
      stage: 1,
      title: 'The Goblin Bazaar of Whispers',
      narrative:
        'Lanterns swing over a sewer gate, illuminating a goblin with an open palm. Behind him, the night market hums with bargains nobody will admit making.',
      choices: [
        {
          id: '1',
          label: 'Bribe keeper (pay 50)',
          transition: {
            type: 'direct',
            target: 'market',
          },
          cost: {
            credits: 50,
          },
        },
        {
          id: '2',
          label: 'sneak (SHADOW, 50% base)',
          transition: {
            type: 'skill',
            chance: 0.5,
            element: 'SHADOW',
            elementBonus: 0.25,
            success: 'market',
            failure: 'detention',
          },
        },
        {
          id: '3',
          label: 'force entry',
          transition: {
            type: 'direct',
            target: 'brawl',
          },
        },
      ],
    },
    market: {
      type: 'decision',
      id: 'market',
      stage: 2,
      title: 'Market',
      narrative:
        'Griznak waves a velvet pouch while smugglers exchange coded greetings. From the tavern comes the unmistakable sound of dice and an argument about loaded bones.',
      choices: [
        {
          id: '1',
          label: 'Visit Griznak',
          transition: {
            type: 'direct',
            target: 'relic',
          },
        },
        {
          id: '2',
          label: 'follow smugglers',
          transition: {
            type: 'direct',
            target: 'vault',
          },
        },
        {
          id: '3',
          label: 'visit tavern',
          transition: {
            type: 'direct',
            target: 'tavern',
          },
        },
      ],
    },
    detention: {
      type: 'decision',
      id: 'detention',
      stage: 2,
      title: 'Detention',
      narrative:
        'The cell smells of wet copper. A guard jingles his keys beside a drain just wide enough to swallow your pride.',
      choices: [
        {
          id: '1',
          label: 'Bribe guard (pay 100)',
          transition: {
            type: 'direct',
            target: 'relic',
          },
          cost: {
            credits: 100,
          },
        },
        {
          id: '2',
          label: 'use drain',
          transition: {
            type: 'direct',
            target: 'vault',
          },
          effects: {
            penalties: {
              credits: {
                min: 25,
                max: 25,
              },
            },
          },
        },
      ],
    },
    brawl: {
      type: 'decision',
      id: 'brawl',
      stage: 2,
      title: 'Brawl',
      narrative:
        'Your entrance has overturned a stall and scattered its guards. The crowd opens around a contraband door, then closes again toward the tavern.',
      choices: [
        {
          id: '1',
          label: 'Press attack',
          transition: {
            type: 'direct',
            target: 'vault',
          },
          effects: {
            penalties: {
              credits: {
                min: 50,
                max: 50,
              },
            },
          },
        },
        {
          id: '2',
          label: 'retreat into crowd',
          transition: {
            type: 'direct',
            target: 'tavern',
          },
        },
      ],
    },
    relic: {
      type: 'decision',
      id: 'relic',
      stage: 3,
      title: 'Relic',
      narrative:
        'Griznak turns a cloudy relic beneath his lamp. He promises it remembers mountains that no longer exist; his samples look suspiciously similar.',
      choices: [
        {
          id: '1',
          label: 'Buy relic (pay 200)',
          transition: {
            type: 'direct',
            target: 'appraiser',
          },
          cost: {
            credits: 200,
          },
        },
        {
          id: '2',
          label: 'haggle (60%)',
          transition: {
            type: 'skill',
            chance: 0.6,
            success: 'appraiser',
            failure: 'counterfeit',
          },
        },
        {
          id: '3',
          label: "inspect the dealer's samples",
          transition: {
            type: 'direct',
            target: 'counterfeit',
          },
        },
      ],
    },
    vault: {
      type: 'decision',
      id: 'vault',
      stage: 3,
      title: 'Vault',
      narrative:
        'A heavy chest sits beside a neatly wrapped parcel. Footsteps approach the vault, leaving time to carry only one.',
      choices: [
        {
          id: '1',
          label: 'Take chest',
          transition: {
            type: 'direct',
            target: 'pursuit',
          },
        },
        {
          id: '2',
          label: 'take small parcel',
          transition: {
            type: 'direct',
            target: 'quiet_exit',
          },
        },
      ],
    },
    tavern: {
      type: 'decision',
      id: 'tavern',
      stage: 3,
      title: 'Tavern',
      narrative:
        'The dealer spreads his hands over the Rat’s Tail table. Two hundred credits buy a single throw; listeners can learn plenty without sitting down.',
      choices: [
        {
          id: '1',
          label: 'Stake 200 (pay once, 50%)',
          cost: { credits: 200 },
          transition: {
            type: 'skill',
            chance: 0.5,
            success: 'winning_table',
            failure: 'losing_table',
          },
        },
        {
          id: '2',
          label: 'gather intel',
          transition: {
            type: 'direct',
            target: 'quiet_exit',
          },
        },
      ],
    },
    appraiser: {
      type: 'decision',
      id: 'appraiser',
      stage: 4,
      title: 'Appraiser',
      narrative:
        'Fine writing circles the relic’s seal. An appraiser offers to trace its history, though her ink and expertise have a price.',
      choices: [
        {
          id: '1',
          label: 'Break seal',
          transition: {
            type: 'direct',
            target: 'relic_exit',
          },
        },
        {
          id: '2',
          label: 'pay for provenance (pay 25)',
          transition: {
            type: 'direct',
            target: 'relic_exit',
          },
          cost: {
            credits: 25,
          },
          effects: {
            rewards: {
              credits: {
                min: 50,
                max: 50,
              },
            },
          },
        },
      ],
    },
    counterfeit: {
      type: 'decision',
      id: 'counterfeit',
      stage: 4,
      title: 'Counterfeit',
      narrative:
        'A second dealer displays an identical one-of-a-kind relic. His distracted accomplice leaves a stall unattended while the argument grows louder.',
      choices: [
        {
          id: '1',
          label: 'Confront dealer',
          transition: {
            type: 'direct',
            target: 'scam_exit',
          },
        },
        {
          id: '2',
          label: 'search stall',
          transition: {
            type: 'direct',
            target: 'scam_exit',
          },
          effects: {
            rewards: {
              credits: {
                min: 25,
                max: 25,
              },
            },
            penalties: {
              credits: {
                min: 50,
                max: 50,
              },
            },
          },
        },
      ],
    },
    pursuit: {
      type: 'decision',
      id: 'pursuit',
      stage: 4,
      title: 'Pursuit',
      narrative:
        'Smugglers spill into the alley behind you. The chest catches on every corner, and the narrow stalls offer cover at the cost of a bruising climb.',
      choices: [
        {
          id: '1',
          label: 'Sprint through alley',
          transition: {
            type: 'direct',
            target: 'chest_exit',
          },
        },
        {
          id: '2',
          label: 'hide in stalls',
          transition: {
            type: 'direct',
            target: 'chest_exit',
          },
          effects: {
            rewards: {
              xp: 25,
            },
            penalties: {
              energy: 5,
            },
          },
        },
      ],
    },
    quiet_exit: {
      type: 'decision',
      id: 'quiet_exit',
      stage: 4,
      title: 'Quiet Exit',
      narrative:
        'A patrol passes beneath the sewer lamps. Its captain is collecting information as enthusiastically as taxes.',
      choices: [
        {
          id: '1',
          label: 'Wait for patrol',
          transition: {
            type: 'direct',
            target: 'safe_exit',
          },
        },
        {
          id: '2',
          label: 'trade intel',
          transition: {
            type: 'direct',
            target: 'safe_exit',
          },
          effects: {
            rewards: {
              credits: {
                min: 25,
                max: 25,
              },
            },
            penalties: {
              credits: {
                min: 50,
                max: 50,
              },
            },
          },
        },
      ],
    },
    winning_table: {
      type: 'decision',
      id: 'winning_table',
      stage: 4,
      title: 'Winning Table',
      narrative:
        'The cashier stacks your promised winnings behind the counter. A tray of cards waits nearby, but the room is growing restless.',
      choices: [
        {
          id: '1',
          label: 'Collect winnings',
          transition: {
            type: 'direct',
            target: 'cash_exit',
          },
        },
        {
          id: '2',
          label: 'help cashier',
          transition: {
            type: 'direct',
            target: 'cash_exit',
          },
          effects: {
            rewards: {
              xp: 25,
            },
            penalties: {
              energy: 5,
            },
          },
        },
      ],
    },
    losing_table: {
      type: 'decision',
      id: 'losing_table',
      stage: 4,
      title: 'Losing Table',
      narrative:
        'The dice stop on the wrong face and the dealer pockets your stake. An exhausted server motions toward the abandoned tables.',
      choices: [
        {
          id: '1',
          label: 'Slip away',
          transition: {
            type: 'direct',
            target: 'broke_exit',
          },
        },
        {
          id: '2',
          label: 'clear tables',
          transition: {
            type: 'direct',
            target: 'broke_exit',
          },
          effects: {
            rewards: {
              xp: 25,
            },
            penalties: {
              energy: 5,
            },
          },
        },
      ],
    },
    relic_exit: {
      type: 'decision',
      id: 'relic_exit',
      stage: 5,
      title: 'Relic Exit',
      narrative:
        'At the final grate, an honest collector recognizes the relic. You can keep its weight in your pack or trade it for an easier journey.',
      choices: [
        {
          id: '1',
          label: 'Keep relic',
          transition: {
            type: 'direct',
            target: 'appraised',
          },
        },
        {
          id: '2',
          label: 'sell it',
          transition: {
            type: 'direct',
            target: 'clean',
          },
        },
      ],
    },
    scam_exit: {
      type: 'decision',
      id: 'scam_exit',
      stage: 5,
      title: 'Scam Exit',
      narrative:
        'The dealer’s accomplices wait beyond the lantern light. Exposing the fraud may cost you your purse; slipping away leaves another parcel within reach.',
      choices: [
        {
          id: '1',
          label: 'Expose scam',
          transition: {
            type: 'direct',
            target: 'scammed',
          },
        },
        {
          id: '2',
          label: 'escape quietly',
          transition: {
            type: 'direct',
            target: 'clean',
          },
        },
      ],
    },
    chest_exit: {
      type: 'decision',
      id: 'chest_exit',
      stage: 5,
      title: 'Chest Exit',
      narrative:
        'A barricade blocks the last alley. The smugglers offer a smaller parcel if you surrender their chest, but its contents still rattle invitingly.',
      choices: [
        {
          id: '1',
          label: 'Keep chest',
          transition: {
            type: 'direct',
            target: 'chased',
          },
        },
        {
          id: '2',
          label: 'surrender it for side parcel',
          transition: {
            type: 'direct',
            target: 'clean',
          },
        },
      ],
    },
    safe_exit: {
      type: 'decision',
      id: 'safe_exit',
      stage: 5,
      title: 'Safe Exit',
      narrative:
        'Two passages lead back to daylight. One follows familiar patrol marks; the dealer’s shortcut disappears beneath a broken sign.',
      choices: [
        {
          id: '1',
          label: 'Follow safe route',
          transition: {
            type: 'direct',
            target: 'clean',
          },
        },
        {
          id: '2',
          label: "try dealer's shortcut",
          transition: {
            type: 'direct',
            target: 'scammed',
          },
        },
      ],
    },
    cash_exit: {
      type: 'decision',
      id: 'cash_exit',
      stage: 5,
      title: 'Cash Exit',
      narrative:
        'The cashier’s runner catches you at the grate with your prize. She offers supplies in exchange if carrying a valuable card seems too conspicuous.',
      choices: [
        {
          id: '1',
          label: 'Keep card prize',
          transition: {
            type: 'direct',
            target: 'jackpot',
          },
        },
        {
          id: '2',
          label: 'exchange for supplies',
          terminalRankScaling: 'none',
          transition: {
            type: 'direct',
            target: 'clean',
          },
        },
      ],
    },
    broke_exit: {
      type: 'decision',
      id: 'broke_exit',
      stage: 5,
      title: 'Broke Exit',
      narrative:
        'The market noise fades behind an empty purse. A courier needs one last delivery before sunrise and promises enough to soften the loss.',
      choices: [
        {
          id: '1',
          label: 'Leave',
          transition: {
            type: 'direct',
            target: 'broke',
          },
        },
        {
          id: '2',
          label: 'run courier errand',
          transition: {
            type: 'direct',
            target: 'recovery',
          },
        },
      ],
    },
    appraised: {
      type: 'terminal',
      id: 'appraised',
      title: 'Appraised',
      outcome: {
        type: 'SUCCESS',
        narrative:
          'The relic answers the morning light with the outline of a mountain. For once, Griznak sold something real.',
        rewards: {
          credits: {
            min: 150,
            max: 150,
          },
          xp: 100,
          items: [
            {
              code: 'AMULET_MOUNTAIN',
              quantity: 1,
              chance: 1,
            },
          ],
        },
      },
    },
    scammed: {
      type: 'terminal',
      id: 'scammed',
      title: 'Scammed',
      outcome: {
        type: 'FAILURE',
        narrative:
          'The shortcut ends at an empty stall. By the time you find daylight, your purse is lighter and the dealer is gone.',
        rewards: {},
        penalties: {
          credits: {
            min: 75,
            max: 150,
          },
        },
      },
    },
    chased: {
      type: 'terminal',
      id: 'chased',
      title: 'Chased',
      outcome: {
        type: 'MIXED',
        narrative:
          'You clear the barricade with the chest intact. Some coins pay for your escape, but the card inside is worth remembering.',
        rewards: {
          card: {
            chance: 1,
            minRarity: 'RARE',
          },
        },
        penalties: {
          credits: {
            min: 50,
            max: 50,
          },
        },
      },
    },
    clean: {
      type: 'terminal',
      id: 'clean',
      title: 'Clean',
      outcome: {
        type: 'SUCCESS',
        narrative:
          'The patrol never looks twice at your parcel. You leave the bazaar with honest supplies acquired in a thoroughly dishonest place.',
        rewards: {
          credits: {
            min: 300,
            max: 300,
          },
          dust: 50,
        },
      },
    },
    jackpot: {
      type: 'terminal',
      id: 'jackpot',
      title: 'Jackpot',
      outcome: {
        type: 'CRITICAL_SUCCESS',
        narrative:
          'The cashier honors the winning throw. You pocket the prize and leave before anyone suggests one more round.',
        rewards: {
          rankScaling: 'none',
          credits: {
            min: 400,
            max: 400,
          },
          card: {
            chance: 1,
            minRarity: 'UNCOMMON',
          },
        },
      },
    },
    broke: {
      type: 'terminal',
      id: 'broke',
      title: 'Broke',
      outcome: {
        type: 'FAILURE',
        narrative:
          'The dealer keeps the stake already on his table. Dawn finds you wiser about goblin dice and no richer for the lesson.',
        rewards: {},
      },
    },
    recovery: {
      type: 'terminal',
      id: 'recovery',
      title: 'Recovery',
      outcome: {
        type: 'MIXED',
        narrative:
          'The courier pays as promised. It does not erase the lost wager, but it buys a much better ending to the night.',
        rewards: {
          credits: {
            min: 50,
            max: 50,
          },
          xp: 25,
        },
      },
    },
  },
};
