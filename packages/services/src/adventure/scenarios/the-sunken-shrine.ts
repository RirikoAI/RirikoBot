import type { AdventureScenario } from '../types.js';

export const sunkenShrine: AdventureScenario = {
  id: 'the-sunken-shrine',
  version: 1,
  title: 'The Sunken Shrine of Leviathans',
  description: 'Enter a shrine beneath the tide and decide what its ancient guardian is owed.',
  color: 440020,
  risk: 'BALANCED',
  elements: ['WATER', 'ICE'],
  totalDecisions: 5,
  energyCost: 15,
  rootNodeId: 'root',
  nodes: {
    root: {
      type: 'decision',
      id: 'root',
      stage: 1,
      title: 'The Sunken Shrine of Leviathans',
      narrative:
        'The tide reveals a stone doorway covered in coral. Beyond it, luminous water climbs the walls instead of falling from them.',
      choices: [
        {
          id: '1',
          label: 'Wade',
          transition: {
            type: 'direct',
            target: 'antechamber',
          },
        },
        {
          id: '2',
          label: 'build ice bridge (ICE gate)',
          transition: {
            type: 'element',
            element: 'ICE',
            success: 'sanctum',
            failure: 'antechamber',
          },
        },
        {
          id: '3',
          label: 'dive (speed ≥150)',
          transition: {
            type: 'stat',
            stat: 'speed',
            minimum: 150,
            success: 'grotto',
            failure: 'whirlpool',
          },
        },
      ],
    },
    antechamber: {
      type: 'decision',
      id: 'antechamber',
      stage: 2,
      title: 'Antechamber',
      narrative:
        'Glyphs pulse beneath the shallow water. A school of silver fish keeps circling a passage where something enormous breathes.',
      choices: [
        {
          id: '1',
          label: 'Read glyphs',
          transition: {
            type: 'direct',
            target: 'puzzle',
          },
        },
        {
          id: '2',
          label: 'follow fish',
          transition: {
            type: 'direct',
            target: 'guardian',
          },
        },
      ],
    },
    sanctum: {
      type: 'decision',
      id: 'sanctum',
      stage: 2,
      title: 'Sanctum',
      narrative:
        'An altar crystal hangs above a dry circle in the flooded shrine. Small chests line the edge of a floor suspiciously free of sand.',
      choices: [
        {
          id: '1',
          label: 'Touch crystal',
          transition: {
            type: 'direct',
            target: 'blessing',
          },
        },
        {
          id: '2',
          label: 'search treasure',
          transition: {
            type: 'direct',
            target: 'trap',
          },
        },
      ],
    },
    grotto: {
      type: 'decision',
      id: 'grotto',
      stage: 2,
      title: 'Grotto',
      narrative:
        'Moonpearls gleam inside shells along the grotto wall. An eel sleeps beneath them, curled around a carved guardian’s mask.',
      choices: [
        {
          id: '1',
          label: 'Harvest pearls',
          transition: {
            type: 'direct',
            target: 'blessing',
          },
        },
        {
          id: '2',
          label: 'disturb eel',
          transition: {
            type: 'direct',
            target: 'guardian',
          },
        },
      ],
    },
    whirlpool: {
      type: 'decision',
      id: 'whirlpool',
      stage: 2,
      title: 'Whirlpool',
      narrative:
        'The current folds around your legs and begins to turn. A broken stair offers purchase, while a quieter stream runs toward the sentinel hall.',
      choices: [
        {
          id: '1',
          label: 'Struggle free',
          transition: {
            type: 'direct',
            target: 'puzzle',
          },
          effects: {
            penalties: {
              energy: 10,
            },
          },
        },
        {
          id: '2',
          label: 'ride current',
          transition: {
            type: 'direct',
            target: 'guardian',
          },
          effects: {
            penalties: {
              energy: 5,
            },
          },
        },
      ],
    },
    puzzle: {
      type: 'decision',
      id: 'puzzle',
      stage: 3,
      title: 'Puzzle',
      narrative:
        'Coral glyphs shift whenever your shadow crosses them. Their rhythm suggests an answer, but the brittle panel could also be broken.',
      choices: [
        {
          id: '1',
          label: 'Decode (60%)',
          transition: {
            type: 'skill',
            chance: 0.6,
            success: 'treasure',
            failure: 'flood',
          },
        },
        {
          id: '2',
          label: 'smash panel',
          transition: {
            type: 'direct',
            target: 'flood',
          },
        },
      ],
    },
    guardian: {
      type: 'decision',
      id: 'guardian',
      stage: 3,
      title: 'Guardian',
      narrative:
        'The coral sentinel opens an eye bright as a lighthouse. Its open palm resembles an offering bowl, and a spillway runs behind its throne.',
      choices: [
        {
          id: '1',
          label: 'Challenge (WATER, 50% base)',
          transition: {
            type: 'skill',
            chance: 0.5,
            element: 'WATER',
            elementBonus: 0.25,
            success: 'victory',
            failure: 'flood',
          },
        },
        {
          id: '2',
          label: 'offer POTION_MINOR_HP (consume 1)',
          transition: {
            type: 'direct',
            target: 'treasure',
          },
          cost: {
            items: [
              {
                code: 'POTION_MINOR_HP',
                quantity: 1,
              },
            ],
          },
        },
        {
          id: '3',
          label: 'use spillway',
          transition: {
            type: 'direct',
            target: 'flood',
          },
        },
      ],
    },
    blessing: {
      type: 'decision',
      id: 'blessing',
      stage: 3,
      title: 'Blessing',
      narrative:
        'A cool presence brushes your thoughts without words. Pearls rise through the water around you, while the altar offers understanding instead of wealth.',
      choices: [
        {
          id: '1',
          label: 'Accept blessing',
          transition: {
            type: 'direct',
            target: 'treasure',
          },
          effects: {
            rewards: {
              xp: 25,
            },
          },
        },
        {
          id: '2',
          label: 'collect pearls',
          transition: {
            type: 'direct',
            target: 'treasure',
          },
          effects: {
            rewards: {
              credits: {
                min: 25,
                max: 25,
              },
            },
          },
        },
      ],
    },
    trap: {
      type: 'decision',
      id: 'trap',
      stage: 3,
      title: 'Trap',
      narrative:
        'A pressure plate clicks beneath your heel. A falling slab leaves a narrow gap and a crawlspace strewn with sharp coral.',
      choices: [
        {
          id: '1',
          label: 'Dodge (speed ≥150)',
          transition: {
            type: 'stat',
            stat: 'speed',
            minimum: 150,
            success: 'treasure',
            failure: 'bruised',
          },
        },
        {
          id: '2',
          label: 'shield (defense ≥800)',
          transition: {
            type: 'stat',
            stat: 'defense',
            minimum: 800,
            success: 'treasure',
            failure: 'bruised',
          },
        },
        {
          id: '3',
          label: 'crawl through debris',
          transition: {
            type: 'direct',
            target: 'bruised',
          },
        },
      ],
    },
    treasure: {
      type: 'decision',
      id: 'treasure',
      stage: 4,
      title: 'Treasure',
      narrative:
        'The chest is sealed by a lock grown from living coral. A careful reading may open it cleanly; forcing it could expose a hidden compartment.',
      choices: [
        {
          id: '1',
          label: 'Study lock',
          transition: {
            type: 'direct',
            target: 'reward_exit',
          },
        },
        {
          id: '2',
          label: 'pry lid',
          transition: {
            type: 'direct',
            target: 'reward_exit',
          },
          effects: {
            rewards: {
              credits: {
                min: 50,
                max: 50,
              },
            },
            penalties: {
              energy: 5,
            },
          },
        },
      ],
    },
    flood: {
      type: 'decision',
      id: 'flood',
      stage: 4,
      title: 'Flood',
      narrative:
        'The chamber fills faster than the tide outside. A relic fragment spins in the current beneath the nearest safe ledge.',
      choices: [
        {
          id: '1',
          label: 'Climb ledge',
          transition: {
            type: 'direct',
            target: 'flood_exit',
          },
        },
        {
          id: '2',
          label: 'rescue fragment',
          transition: {
            type: 'direct',
            target: 'flood_exit',
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
    victory: {
      type: 'decision',
      id: 'victory',
      stage: 4,
      title: 'Victory',
      narrative:
        'The defeated sentinel bows its enormous head. Its pedestal opens, revealing offerings left by travelers who never returned.',
      choices: [
        {
          id: '1',
          label: 'Honor sentinel',
          transition: {
            type: 'direct',
            target: 'victory_exit',
          },
          effects: {
            rewards: {
              xp: 25,
            },
          },
        },
        {
          id: '2',
          label: 'search pedestal',
          transition: {
            type: 'direct',
            target: 'victory_exit',
          },
          effects: {
            rewards: {
              credits: {
                min: 25,
                max: 25,
              },
            },
          },
        },
      ],
    },
    bruised: {
      type: 'decision',
      id: 'bruised',
      stage: 4,
      title: 'Bruised',
      narrative:
        'The broken corridor finally rises above the water. Coins glitter between the stones where you could rest and bind your wounds.',
      choices: [
        {
          id: '1',
          label: 'Bind wounds',
          transition: {
            type: 'direct',
            target: 'bruised_exit',
          },
        },
        {
          id: '2',
          label: 'salvage coins',
          transition: {
            type: 'direct',
            target: 'bruised_exit',
          },
          effects: {
            rewards: {
              credits: {
                min: 25,
                max: 25,
              },
            },
            penalties: {
              energy: 5,
            },
          },
        },
      ],
    },
    reward_exit: {
      type: 'decision',
      id: 'reward_exit',
      stage: 5,
      title: 'Reward Exit',
      narrative:
        'The last tide draws back from the shore path. The shrine will let you carry its treasure away—or accept it as an offering for renewed strength.',
      choices: [
        {
          id: '1',
          label: 'Carry treasure',
          transition: {
            type: 'direct',
            target: 'treasure_room',
          },
        },
        {
          id: '2',
          label: 'donate for blessing',
          transition: {
            type: 'direct',
            target: 'restored',
          },
        },
      ],
    },
    flood_exit: {
      type: 'decision',
      id: 'flood_exit',
      stage: 5,
      title: 'Flood Exit',
      narrative:
        'An escape hatch opens onto the surf. A purse catches on its hinge just as another wave begins to rise.',
      choices: [
        {
          id: '1',
          label: 'Escape flood',
          transition: {
            type: 'direct',
            target: 'flooded',
          },
        },
        {
          id: '2',
          label: 'salvage purse',
          transition: {
            type: 'direct',
            target: 'bruised_but_through',
          },
        },
      ],
    },
    victory_exit: {
      type: 'decision',
      id: 'victory_exit',
      stage: 5,
      title: 'Victory Exit',
      narrative:
        'The sentinel’s voice follows you to the tidegate. It offers a companion’s card or the supplies entrusted to its keeping.',
      choices: [
        {
          id: '1',
          label: 'Accept card',
          transition: {
            type: 'direct',
            target: 'guardian_victory',
          },
        },
        {
          id: '2',
          label: 'choose supplies',
          transition: {
            type: 'direct',
            target: 'treasure_room',
          },
        },
      ],
    },
    bruised_exit: {
      type: 'decision',
      id: 'bruised_exit',
      stage: 5,
      title: 'Bruised Exit',
      narrative:
        'The shoreline is visible through two openings. One is painfully narrow; the other carries the full force of the returning sea.',
      choices: [
        {
          id: '1',
          label: 'Take narrow path',
          transition: {
            type: 'direct',
            target: 'bruised_but_through',
          },
        },
        {
          id: '2',
          label: 'brave flood',
          transition: {
            type: 'direct',
            target: 'flooded',
          },
        },
      ],
    },
    treasure_room: {
      type: 'terminal',
      id: 'treasure_room',
      title: 'Treasure Room',
      outcome: {
        type: 'SUCCESS',
        narrative:
          'The tidegate closes behind the treasure you carried out. A final pulse of blue light follows you to shore.',
        rewards: {
          credits: {
            min: 300,
            max: 300,
          },
          dust: 50,
          items: [
            {
              code: 'POTION_MAJOR_HP',
              quantity: 1,
              chance: 1,
            },
          ],
        },
      },
    },
    restored: {
      type: 'terminal',
      id: 'restored',
      title: 'Restored',
      outcome: {
        type: 'SUCCESS',
        narrative:
          'Your offering sinks into clear water. The sea returns only strength, and for a moment that feels like more than treasure.',
        rewards: {
          xp: 100,
          energy: 15,
        },
      },
    },
    flooded: {
      type: 'terminal',
      id: 'flooded',
      title: 'Flooded',
      outcome: {
        type: 'FAILURE',
        narrative:
          'The surf throws you onto the sand. The shrine keeps what slipped from your pack, but it lets you keep the story.',
        rewards: {},
        penalties: {
          credits: {
            min: 100,
            max: 100,
          },
        },
      },
    },
    guardian_victory: {
      type: 'terminal',
      id: 'guardian_victory',
      title: 'Guardian Victory',
      outcome: {
        type: 'CRITICAL_SUCCESS',
        narrative:
          'The sentinel marks your courage with a companion’s card. Its watch resumes as the shrine disappears beneath the tide.',
        rewards: {
          xp: 250,
          card: {
            chance: 1,
            minRarity: 'SUPER_RARE',
          },
        },
      },
    },
    bruised_but_through: {
      type: 'terminal',
      id: 'bruised_but_through',
      title: 'Bruised But Through',
      outcome: {
        type: 'MIXED',
        narrative:
          'You reach the shore scraped and soaked, still clutching the rescued purse. The sea has taken its share of the journey.',
        rewards: {
          credits: {
            min: 150,
            max: 150,
          },
        },
        penalties: {
          energy: 5,
        },
      },
    },
  },
};
