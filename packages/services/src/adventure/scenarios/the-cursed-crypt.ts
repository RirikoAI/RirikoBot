import type { AdventureScenario } from '../types.js';

export const cursedCrypt: AdventureScenario = {
  id: 'the-cursed-crypt',
  version: 1,
  title: 'The Cursed Crypt of the Forgotten King',
  description:
    'Stand before a forgotten king whose gifts and curses share the same glittering crown.',
  color: 7020968,
  risk: 'HIGH_RISK',
  elements: ['LIGHT', 'SHADOW'],
  totalDecisions: 4,
  energyCost: 15,
  rootNodeId: 'root',
  nodes: {
    root: {
      type: 'decision',
      id: 'root',
      stage: 1,
      title: 'The Cursed Crypt of the Forgotten King',
      narrative:
        'An obsidian door bears a crown split between sun and shadow. Beyond it, something scratches against the stone in time with your breathing.',
      choices: [
        {
          id: '1',
          label: 'Channel LIGHT',
          transition: {
            type: 'element',
            element: 'LIGHT',
            success: 'purified',
            failure: 'alarm',
          },
        },
        {
          id: '2',
          label: 'use SHADOW',
          transition: {
            type: 'element',
            element: 'SHADOW',
            success: 'shadow',
            failure: 'alarm',
          },
        },
        {
          id: '3',
          label: 'break door',
          transition: {
            type: 'direct',
            target: 'alarm',
          },
        },
      ],
    },
    purified: {
      type: 'decision',
      id: 'purified',
      stage: 2,
      title: 'Purified',
      narrative:
        'Pale light reveals generations of names carved into the hall. Offerings remain untouched beneath their portraits.',
      choices: [
        {
          id: '1',
          label: 'Pay respects',
          transition: {
            type: 'direct',
            target: 'audience',
          },
        },
        {
          id: '2',
          label: 'raid bowls',
          transition: {
            type: 'direct',
            target: 'avarice',
          },
        },
      ],
    },
    shadow: {
      type: 'decision',
      id: 'shadow',
      stage: 2,
      title: 'Shadow',
      narrative:
        'Whispers drift through a passage no map records. A trail of coins glitters in the opposite direction from the voice.',
      choices: [
        {
          id: '1',
          label: 'Follow whisper',
          transition: {
            type: 'direct',
            target: 'throne',
          },
        },
        {
          id: '2',
          label: 'take gold',
          transition: {
            type: 'direct',
            target: 'avarice',
          },
        },
      ],
    },
    alarm: {
      type: 'decision',
      id: 'alarm',
      stage: 2,
      title: 'Alarm',
      narrative:
        'Wraiths lift their spears as the broken door falls inward. You can stand your ground or retreat deeper into a side corridor.',
      choices: [
        {
          id: '1',
          label: 'Fight (attack ≥1200)',
          transition: {
            type: 'stat',
            stat: 'attack',
            minimum: 1200,
            success: 'throne',
            failure: 'pursuit',
          },
        },
        {
          id: '2',
          label: 'fall back',
          transition: {
            type: 'direct',
            target: 'pursuit',
          },
        },
      ],
    },
    audience: {
      type: 'decision',
      id: 'audience',
      stage: 3,
      title: 'Audience',
      narrative:
        'The king sits upright without disturbing the dust on his throne. He asks whether you came to prove your courage or name your price.',
      choices: [
        {
          id: '1',
          label: 'Accept trial',
          transition: {
            type: 'direct',
            target: 'armory_gate',
          },
        },
        {
          id: '2',
          label: 'demand treasure',
          transition: {
            type: 'direct',
            target: 'curse_gate',
          },
        },
      ],
    },
    throne: {
      type: 'decision',
      id: 'throne',
      stage: 3,
      title: 'Throne',
      narrative:
        'A sealed sarcophagus rests beneath the empty throne. The crown beside it is real enough to bend the velvet under its weight.',
      choices: [
        {
          id: '1',
          label: 'Open sarcophagus (50%)',
          transition: {
            type: 'skill',
            chance: 0.5,
            success: 'armory_gate',
            failure: 'curse_gate',
          },
        },
        {
          id: '2',
          label: 'take crown',
          transition: {
            type: 'direct',
            target: 'crown_gate',
          },
        },
      ],
    },
    avarice: {
      type: 'decision',
      id: 'avarice',
      stage: 3,
      title: 'Avarice',
      narrative:
        'The coins in your hands grow colder with every heartbeat. The hall is listening for either a confession or another excuse.',
      choices: [
        {
          id: '1',
          label: 'Confess',
          transition: {
            type: 'direct',
            target: 'curse_gate',
          },
        },
        {
          id: '2',
          label: 'hoard treasure',
          transition: {
            type: 'direct',
            target: 'avarice_gate',
          },
        },
      ],
    },
    pursuit: {
      type: 'decision',
      id: 'pursuit',
      stage: 3,
      title: 'Pursuit',
      narrative:
        'The wraiths scrape at a door you can still barricade. Beyond the next arch, the king waits without his guards.',
      choices: [
        {
          id: '1',
          label: 'Barricade door',
          transition: {
            type: 'direct',
            target: 'retreat_gate',
          },
        },
        {
          id: '2',
          label: 'face king',
          transition: {
            type: 'direct',
            target: 'curse_gate',
          },
        },
      ],
    },
    armory_gate: {
      type: 'decision',
      id: 'armory_gate',
      stage: 4,
      title: 'Armory Gate',
      narrative:
        'The armory opens beneath a sky painted with forgotten battles. A solar lance and an aegis barrier await a bearer willing to swear the final oath.',
      choices: [
        {
          id: '1',
          label: 'Choose solar lance',
          transition: {
            type: 'direct',
            target: 'lance',
          },
        },
        {
          id: '2',
          label: 'choose aegis',
          transition: {
            type: 'direct',
            target: 'aegis',
          },
        },
      ],
    },
    curse_gate: {
      type: 'decision',
      id: 'curse_gate',
      stage: 4,
      title: 'Curse Gate',
      narrative:
        'Black light binds the crown to your shadow. The seal can be shattered, or its claim surrendered before the outer door closes.',
      choices: [
        {
          id: '1',
          label: 'Shatter seal',
          transition: {
            type: 'direct',
            target: 'cursed',
          },
        },
        {
          id: '2',
          label: 'surrender crown',
          transition: {
            type: 'direct',
            target: 'retreat',
          },
        },
      ],
    },
    crown_gate: {
      type: 'decision',
      id: 'crown_gate',
      stage: 4,
      title: 'Crown Gate',
      narrative:
        'The crown grows heavier as the exit draws near. A final offering bowl stands between its promise of wealth and the king’s mercy.',
      choices: [
        {
          id: '1',
          label: 'Keep crown',
          transition: {
            type: 'direct',
            target: 'crown',
          },
        },
        {
          id: '2',
          label: 'return it',
          transition: {
            type: 'direct',
            target: 'mercy',
          },
        },
      ],
    },
    avarice_gate: {
      type: 'decision',
      id: 'avarice_gate',
      stage: 4,
      title: 'Avarice Gate',
      narrative:
        'The hoard whispers your name in a hundred voices. Letting it fall may break its hold, but keeping it means accepting the price.',
      choices: [
        {
          id: '1',
          label: 'Keep hoard',
          transition: {
            type: 'direct',
            target: 'consumed',
          },
        },
        {
          id: '2',
          label: 'abandon it',
          transition: {
            type: 'direct',
            target: 'cursed',
          },
        },
      ],
    },
    retreat_gate: {
      type: 'decision',
      id: 'retreat_gate',
      stage: 4,
      title: 'Retreat Gate',
      narrative:
        'Dawn shines through a crack in the outer door. A trapped spirit reaches toward it, too weak to cross alone.',
      choices: [
        {
          id: '1',
          label: 'Flee',
          transition: {
            type: 'direct',
            target: 'retreat',
          },
        },
        {
          id: '2',
          label: 'aid a spirit',
          transition: {
            type: 'direct',
            target: 'mercy',
          },
        },
      ],
    },
    lance: {
      type: 'terminal',
      id: 'lance',
      title: 'Lance',
      outcome: {
        type: 'CRITICAL_SUCCESS',
        narrative:
          'The solar lance warms your hand as the king accepts your oath. His armory closes behind a gift freely given.',
        rewards: {
          credits: {
            min: 800,
            max: 800,
          },
          card: {
            chance: 1,
            minRarity: 'RARE',
          },
          items: [
            {
              code: 'WEAPON_SOLAR_LANCE',
              quantity: 1,
              chance: 1,
            },
          ],
        },
      },
    },
    aegis: {
      type: 'terminal',
      id: 'aegis',
      title: 'Aegis',
      outcome: {
        type: 'CRITICAL_SUCCESS',
        narrative:
          'The aegis answers your oath with a ring of pale light. The king finally rests, leaving his protection in living hands.',
        rewards: {
          credits: {
            min: 800,
            max: 800,
          },
          card: {
            chance: 1,
            minRarity: 'RARE',
          },
          items: [
            {
              code: 'ARMOR_AEGIS_BARRIER',
              quantity: 1,
              chance: 1,
            },
          ],
        },
      },
    },
    crown: {
      type: 'terminal',
      id: 'crown',
      title: 'Crown',
      outcome: {
        type: 'SUCCESS',
        narrative:
          'You step into daylight with the crown and its attendant wealth. The silent mausoleum offers no further claim.',
        rewards: {
          credits: {
            min: 500,
            max: 500,
          },
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
    mercy: {
      type: 'terminal',
      id: 'mercy',
      title: 'Mercy',
      outcome: {
        type: 'MIXED',
        narrative:
          'The spirit crosses into dawn beside you. No treasure follows, but the weight of the crypt lifts from your shoulders.',
        rewards: {
          xp: 100,
        },
      },
    },
    consumed: {
      type: 'terminal',
      id: 'consumed',
      title: 'Consumed',
      outcome: {
        type: 'CRITICAL_FAILURE',
        narrative:
          'The hoard crumbles into cold dust. What it takes from your purse is the last price of refusing to let go.',
        rewards: {},
        penalties: {
          credits: {
            min: 250,
            max: 250,
          },
        },
      },
    },
    cursed: {
      type: 'terminal',
      id: 'cursed',
      title: 'Cursed',
      outcome: {
        type: 'FAILURE',
        narrative:
          'The seal shatters and the curse tears through your pack. You escape its reach with enough strength to remember the warning.',
        rewards: {},
        penalties: {
          credits: {
            min: 200,
            max: 200,
          },
          energy: 10,
        },
      },
    },
    retreat: {
      type: 'terminal',
      id: 'retreat',
      title: 'Retreat',
      outcome: {
        type: 'FAILURE',
        narrative:
          'You stumble past the outer door as the wraiths strike stone behind you. The crypt keeps its tribute and its king.',
        rewards: {},
        penalties: {
          credits: {
            min: 150,
            max: 150,
          },
          energy: 5,
        },
      },
    },
  },
};
