import type { AdventureScenario } from '../types.js';

export const banditAmbush: AdventureScenario = {
  id: 'the-bandit-ambush',
  version: 1,
  title: 'The Highwayman’s Ambush',
  description: 'Turn a roadside ambush into a dangerous opportunity—or find a way home.',
  color: 15680580,
  risk: 'HIGH_RISK',
  elements: ['FIRE'],
  totalDecisions: 4,
  energyCost: 15,
  rootNodeId: 'root',
  nodes: {
    root: {
      type: 'decision',
      id: 'root',
      stage: 1,
      title: 'The Highwayman’s Ambush',
      narrative:
        'A rope snaps taut across the turnpike and bandits rise from the ditch. Their leader names a toll while the brush behind you rustles with more footsteps.',
      choices: [
        {
          id: '1',
          label: 'Fight (FIRE, 50% base)',
          transition: {
            type: 'skill',
            chance: 0.5,
            element: 'FIRE',
            elementBonus: 0.25,
            success: 'scattered',
            failure: 'overpowered',
          },
        },
        {
          id: '2',
          label: 'pay toll (pay 150)',
          transition: {
            type: 'direct',
            target: 'passage',
          },
          cost: {
            credits: 150,
          },
        },
        {
          id: '3',
          label: 'escape (speed ≥150)',
          transition: {
            type: 'stat',
            stat: 'speed',
            minimum: 150,
            success: 'escaped',
            failure: 'briar',
          },
        },
        {
          id: '4',
          label: 'take cover',
          transition: {
            type: 'direct',
            target: 'overpowered',
          },
        },
      ],
    },
    scattered: {
      type: 'decision',
      id: 'scattered',
      stage: 2,
      title: 'Scattered',
      narrative:
        'Your attackers scatter between the trees. Their unattended camp lies close, but their leader is still within reach.',
      choices: [
        {
          id: '1',
          label: 'Loot camp',
          transition: {
            type: 'direct',
            target: 'camp',
          },
        },
        {
          id: '2',
          label: 'chase leader',
          transition: {
            type: 'direct',
            target: 'duel',
          },
        },
      ],
    },
    overpowered: {
      type: 'decision',
      id: 'overpowered',
      stage: 2,
      title: 'Overpowered',
      narrative:
        'A boot pins your weapon to the road. The bandits argue over whether you are worth more as labor or as a warning.',
      choices: [
        {
          id: '1',
          label: 'Negotiate',
          transition: {
            type: 'direct',
            target: 'job',
          },
        },
        {
          id: '2',
          label: 'play dead',
          transition: {
            type: 'direct',
            target: 'sneak',
          },
        },
      ],
    },
    passage: {
      type: 'decision',
      id: 'passage',
      stage: 2,
      title: 'Passage',
      narrative:
        'The bandits wave you through with practiced courtesy. Their tracks reveal a camp they probably hoped you would overlook.',
      choices: [
        {
          id: '1',
          label: 'Follow bandits',
          transition: {
            type: 'direct',
            target: 'camp',
          },
        },
        {
          id: '2',
          label: 'continue safely',
          transition: {
            type: 'direct',
            target: 'road',
          },
        },
      ],
    },
    escaped: {
      type: 'decision',
      id: 'escaped',
      stage: 2,
      title: 'Escaped',
      narrative:
        'The ambush disappears behind a bend in the road. You can keep your freedom or spend it on a dangerous return.',
      choices: [
        {
          id: '1',
          label: 'Circle back',
          transition: {
            type: 'direct',
            target: 'camp',
          },
        },
        {
          id: '2',
          label: 'keep running',
          transition: {
            type: 'direct',
            target: 'road',
          },
          effects: {
            rewards: {
              xp: 25,
            },
          },
        },
      ],
    },
    briar: {
      type: 'decision',
      id: 'briar',
      stage: 2,
      title: 'Briar',
      narrative:
        'Thorns catch every strap on your pack. The road is close enough to struggle toward; the camp can be reached by crawling beneath the roots.',
      choices: [
        {
          id: '1',
          label: 'Struggle free',
          transition: {
            type: 'direct',
            target: 'road',
          },
          effects: {
            penalties: {
              credits: {
                min: 50,
                max: 50,
              },
              energy: 5,
            },
          },
        },
        {
          id: '2',
          label: 'crawl toward camp',
          transition: {
            type: 'direct',
            target: 'sneak',
          },
        },
      ],
    },
    camp: {
      type: 'decision',
      id: 'camp',
      stage: 3,
      title: 'Camp',
      narrative:
        'Stolen goods fill the camp’s rough shelters. A large chest has fresh scratches around its lock; a smaller supply box stands beside it.',
      choices: [
        {
          id: '1',
          label: 'Ransack (60%)',
          transition: {
            type: 'skill',
            chance: 0.6,
            success: 'hoard_gate',
            failure: 'trap_gate',
          },
        },
        {
          id: '2',
          label: 'take small chest',
          transition: {
            type: 'direct',
            target: 'supply_gate',
          },
        },
      ],
    },
    duel: {
      type: 'decision',
      id: 'duel',
      stage: 3,
      title: 'Duel',
      narrative:
        'The bandit lord circles with a blade held low. His impatience leaves openings, but a reckless strike may be exactly what he wants.',
      choices: [
        {
          id: '1',
          label: 'Attack (attack ≥1000)',
          transition: {
            type: 'stat',
            stat: 'attack',
            minimum: 1000,
            success: 'hoard_gate',
            failure: 'trap_gate',
          },
        },
        {
          id: '2',
          label: 'defend',
          transition: {
            type: 'direct',
            target: 'duel_gate',
          },
        },
      ],
    },
    job: {
      type: 'decision',
      id: 'job',
      stage: 3,
      title: 'Job',
      narrative:
        'The bandits offer work at a price nobody would call fair. Accepting would put you near their treasure; refusing means walking past the guards.',
      choices: [
        {
          id: '1',
          label: 'Accept and betray',
          transition: {
            type: 'direct',
            target: 'hoard_gate',
          },
        },
        {
          id: '2',
          label: 'refuse',
          transition: {
            type: 'direct',
            target: 'refusal_gate',
          },
        },
      ],
    },
    sneak: {
      type: 'decision',
      id: 'sneak',
      stage: 3,
      title: 'Sneak',
      narrative:
        'Sleeping sentries line the camp’s edge. A bag of loot hangs from a low branch, close enough to lift without waking its owner.',
      choices: [
        {
          id: '1',
          label: 'Grab bag',
          transition: {
            type: 'direct',
            target: 'sneak_gate',
          },
        },
        {
          id: '2',
          label: 'leave quietly',
          transition: {
            type: 'direct',
            target: 'road_gate',
          },
        },
      ],
    },
    road: {
      type: 'decision',
      id: 'road',
      stage: 3,
      title: 'Road',
      narrative:
        'The last mile is quiet at last. A stranded traveler watches you inspect a disturbed patch of earth beside the ditch.',
      choices: [
        {
          id: '1',
          label: 'Search roadside',
          transition: {
            type: 'direct',
            target: 'road_gate',
          },
        },
        {
          id: '2',
          label: 'escort traveler',
          transition: {
            type: 'direct',
            target: 'diplomacy_gate',
          },
        },
      ],
    },
    hoard_gate: {
      type: 'decision',
      id: 'hoard_gate',
      stage: 4,
      title: 'Hoard Gate',
      narrative:
        'The treasure wagon waits behind a fallen fence. The main chest is heavy, but a smaller bag of supplies would be easier to carry.',
      choices: [
        {
          id: '1',
          label: 'Open main chest',
          transition: {
            type: 'direct',
            target: 'jackpot',
          },
        },
        {
          id: '2',
          label: 'take supply bag',
          transition: {
            type: 'direct',
            target: 'supplies',
          },
        },
      ],
    },
    trap_gate: {
      type: 'decision',
      id: 'trap_gate',
      stage: 4,
      title: 'Trap Gate',
      narrative:
        'A wire runs from the chest lock to a barrel that smells of powder. Forcing it risks everything; leaving empty-handed means meeting the guards again.',
      choices: [
        {
          id: '1',
          label: 'Force lock',
          transition: {
            type: 'direct',
            target: 'explosion',
          },
        },
        {
          id: '2',
          label: 'abandon chest',
          transition: {
            type: 'direct',
            target: 'refused',
          },
        },
      ],
    },
    supply_gate: {
      type: 'decision',
      id: 'supply_gate',
      stage: 4,
      title: 'Supply Gate',
      narrative:
        'You reach the fence with supplies under one arm. A sentry offers safe passage in exchange, plainly tired of fighting.',
      choices: [
        {
          id: '1',
          label: 'Keep supplies',
          transition: {
            type: 'direct',
            target: 'supplies',
          },
        },
        {
          id: '2',
          label: 'exchange for passage',
          transition: {
            type: 'direct',
            target: 'diplomacy',
          },
        },
      ],
    },
    duel_gate: {
      type: 'decision',
      id: 'duel_gate',
      stage: 4,
      title: 'Duel Gate',
      narrative:
        'The leader’s blade lands in the dust. He offers information if you spare him, though the bounty on his head remains yours to claim.',
      choices: [
        {
          id: '1',
          label: 'Take bounty',
          transition: {
            type: 'direct',
            target: 'duel_won',
          },
        },
        {
          id: '2',
          label: 'spare leader for intel',
          transition: {
            type: 'direct',
            target: 'road_reward',
          },
        },
      ],
    },
    refusal_gate: {
      type: 'decision',
      id: 'refusal_gate',
      stage: 4,
      title: 'Refusal Gate',
      narrative:
        'The guards close ranks at the camp exit. They can be forced aside, or persuaded that letting you leave would save them trouble.',
      choices: [
        {
          id: '1',
          label: 'Push past guards',
          transition: {
            type: 'direct',
            target: 'refused',
          },
        },
        {
          id: '2',
          label: 'negotiate safe conduct',
          transition: {
            type: 'direct',
            target: 'diplomacy',
          },
        },
      ],
    },
    sneak_gate: {
      type: 'decision',
      id: 'sneak_gate',
      stage: 4,
      title: 'Sneak Gate',
      narrative:
        'The last sentry stirs as you cross the clearing. Dropping the bag would make escape easy; keeping it requires one more quiet step.',
      choices: [
        {
          id: '1',
          label: 'Keep loot',
          transition: {
            type: 'direct',
            target: 'sneak_loot',
          },
        },
        {
          id: '2',
          label: 'drop it and flee',
          transition: {
            type: 'direct',
            target: 'road_reward',
          },
        },
      ],
    },
    road_gate: {
      type: 'decision',
      id: 'road_gate',
      stage: 4,
      title: 'Road Gate',
      narrative:
        'A roadside cache lies half buried beneath a milestone. Farther down the road, a traveler struggles with a broken wheel.',
      choices: [
        {
          id: '1',
          label: 'Search cache',
          transition: {
            type: 'direct',
            target: 'road_reward',
          },
        },
        {
          id: '2',
          label: 'aid traveler',
          transition: {
            type: 'direct',
            target: 'diplomacy',
          },
        },
      ],
    },
    diplomacy_gate: {
      type: 'decision',
      id: 'diplomacy_gate',
      stage: 4,
      title: 'Diplomacy Gate',
      narrative:
        'The caravan reaches a guarded crossing. Its captain offers thanks, while the unscouted road ahead may still conceal something valuable.',
      choices: [
        {
          id: '1',
          label: 'Accept thanks',
          transition: {
            type: 'direct',
            target: 'diplomacy',
          },
        },
        {
          id: '2',
          label: 'scout ahead',
          transition: {
            type: 'direct',
            target: 'road_reward',
          },
        },
      ],
    },
    jackpot: {
      type: 'terminal',
      id: 'jackpot',
      title: 'Jackpot',
      outcome: {
        type: 'CRITICAL_SUCCESS',
        narrative:
          'The main chest opens without a sound. You leave the bandits with an empty wagon and a story they will not enjoy telling.',
        rewards: {
          credits: {
            min: 350,
            max: 350,
          },
          xp: 100,
          items: [
            {
              code: 'WEAPON_OBSIDIAN_KATANA',
              quantity: 1,
              chance: 1,
            },
          ],
          card: {
            chance: 1,
            minRarity: 'RARE',
          },
        },
      },
    },
    supplies: {
      type: 'terminal',
      id: 'supplies',
      title: 'Supplies',
      outcome: {
        type: 'SUCCESS',
        narrative:
          'The supply bag carries everything needed for a safer road. Behind you, the bandit camp wakes to an unexpectedly lean morning.',
        rewards: {
          credits: {
            min: 250,
            max: 250,
          },
          items: [
            {
              code: 'POTION_MINOR_HP',
              quantity: 1,
              chance: 1,
            },
          ],
        },
      },
    },
    duel_won: {
      type: 'terminal',
      id: 'duel_won',
      title: 'Duel Won',
      outcome: {
        type: 'SUCCESS',
        narrative:
          'The defeated leader gives up his bounty before the guards arrive. For once, the turnpike will be quieter because of you.',
        rewards: {
          credits: {
            min: 350,
            max: 350,
          },
          xp: 100,
        },
      },
    },
    sneak_loot: {
      type: 'terminal',
      id: 'sneak_loot',
      title: 'Sneak Loot',
      outcome: {
        type: 'MIXED',
        narrative:
          'The sentry settles back to sleep as you vanish between the trees. A small card case survives the hurried escape.',
        rewards: {
          credits: {
            min: 100,
            max: 100,
          },
          card: {
            chance: 1,
            minRarity: 'COMMON',
          },
        },
      },
    },
    road_reward: {
      type: 'terminal',
      id: 'road_reward',
      title: 'Road Reward',
      outcome: {
        type: 'SUCCESS',
        narrative:
          'The roadside cache yields a modest reward. It is enough to make the remaining mile feel like the beginning of a better day.',
        rewards: {
          credits: {
            min: 50,
            max: 50,
          },
          xp: 75,
        },
      },
    },
    diplomacy: {
      type: 'terminal',
      id: 'diplomacy',
      title: 'Diplomacy',
      outcome: {
        type: 'MIXED',
        narrative:
          'The caravan reaches its crossing safely. Its captain remembers your help, and the road finally asks nothing more of you.',
        rewards: {
          xp: 50,
        },
      },
    },
    refused: {
      type: 'terminal',
      id: 'refused',
      title: 'Refused',
      outcome: {
        type: 'FAILURE',
        narrative:
          'The guards take their frustration out on your pack before letting you pass. The camp fades behind a painful lesson.',
        rewards: {},
        penalties: {
          credits: {
            min: 200,
            max: 200,
          },
        },
      },
    },
    explosion: {
      type: 'terminal',
      id: 'explosion',
      title: 'Explosion',
      outcome: {
        type: 'CRITICAL_FAILURE',
        narrative:
          'The barrel bursts before the lock gives way. You reach the road singed, shaken, and considerably lighter.',
        rewards: {},
        penalties: {
          credits: {
            min: 250,
            max: 250,
          },
          energy: 10,
        },
      },
    },
  },
};
