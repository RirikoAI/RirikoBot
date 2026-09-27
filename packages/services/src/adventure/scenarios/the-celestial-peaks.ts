import type { AdventureScenario } from '../types.js';

export const celestialPeaks: AdventureScenario = {
  id: 'the-celestial-peaks',
  version: 1,
  title: 'The Celestial Peaks of Aether',
  description: 'Climb through crystal caves and lightning storms to the star-bloom altar.',
  color: 16498468,
  risk: 'BALANCED',
  elements: ['LIGHTNING', 'EARTH'],
  totalDecisions: 5,
  energyCost: 15,
  rootNodeId: 'root',
  nodes: {
    root: {
      type: 'decision',
      id: 'root',
      stage: 1,
      title: 'The Celestial Peaks of Aether',
      narrative:
        'Storm clouds gather below the mountain’s summit. A worn trail, a sheer cliff, and a humming cavern offer very different beginnings.',
      choices: [
        {
          id: '1',
          label: 'Take trail',
          transition: {
            type: 'direct',
            target: 'switchbacks',
          },
        },
        {
          id: '2',
          label: 'scale cliff (EARTH gate)',
          transition: {
            type: 'element',
            element: 'EARTH',
            success: 'nest',
            failure: 'switchbacks',
          },
        },
        {
          id: '3',
          label: 'enter cavern',
          transition: {
            type: 'direct',
            target: 'caverns',
          },
        },
      ],
    },
    switchbacks: {
      type: 'decision',
      id: 'switchbacks',
      stage: 2,
      title: 'Switchbacks',
      narrative:
        'Loose stone tumbles over the trail. Above the slide stands a shrine, while the exposed ridge still offers a way around.',
      choices: [
        {
          id: '1',
          label: 'Push through rockslide',
          transition: {
            type: 'direct',
            target: 'ridge',
          },
        },
        {
          id: '2',
          label: 'wait',
          transition: {
            type: 'direct',
            target: 'hermit',
          },
        },
      ],
    },
    nest: {
      type: 'decision',
      id: 'nest',
      stage: 2,
      title: 'Nest',
      narrative:
        'A griffin spreads its wings over a nest threaded with lightning. One egg glows softly beneath the feathers.',
      choices: [
        {
          id: '1',
          label: 'Befriend griffin (LIGHTNING, 50% base)',
          transition: {
            type: 'skill',
            chance: 0.5,
            element: 'LIGHTNING',
            elementBonus: 0.25,
            success: 'flight',
            failure: 'chase',
          },
        },
        {
          id: '2',
          label: 'steal egg',
          transition: {
            type: 'direct',
            target: 'chase',
          },
        },
      ],
    },
    caverns: {
      type: 'decision',
      id: 'caverns',
      stage: 2,
      title: 'Caverns',
      narrative:
        'Thunder crystals fill the cavern with a steady blue pulse. Deeper within, that pulse answers something that sounds almost like a voice.',
      choices: [
        {
          id: '1',
          label: 'Mine crystals',
          transition: {
            type: 'direct',
            target: 'ridge',
          },
          effects: {
            rewards: {
              dust: 50,
            },
          },
        },
        {
          id: '2',
          label: 'explore',
          transition: {
            type: 'direct',
            target: 'elemental',
          },
        },
      ],
    },
    ridge: {
      type: 'decision',
      id: 'ridge',
      stage: 3,
      title: 'Ridge',
      narrative:
        'Lightning walks along the ridge from peak to peak. A rocky shelter lies within reach, though the storm seems to recognize certain companions.',
      choices: [
        {
          id: '1',
          label: 'Ride lightning (LIGHTNING gate)',
          transition: {
            type: 'element',
            element: 'LIGHTNING',
            success: 'summit_approach',
            failure: 'shelter',
          },
        },
        {
          id: '2',
          label: 'take shelter',
          transition: {
            type: 'direct',
            target: 'shelter',
          },
        },
      ],
    },
    hermit: {
      type: 'decision',
      id: 'hermit',
      stage: 3,
      title: 'Hermit',
      narrative:
        'A hermit tends a tiny fire in the lee of the mountain. There is room to rest, or work enough to earn a bottle from his pack.',
      choices: [
        {
          id: '1',
          label: 'Rest',
          transition: {
            type: 'direct',
            target: 'shelter',
          },
          effects: {
            rewards: {
              energy: 15,
            },
          },
        },
        {
          id: '2',
          label: 'help hermit',
          transition: {
            type: 'direct',
            target: 'shelter',
          },
          effects: {
            rewards: {
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
      ],
    },
    flight: {
      type: 'decision',
      id: 'flight',
      stage: 3,
      title: 'Flight',
      narrative:
        'The griffin carries you into a river of cold air. The summit shines above; scattered campfires mark travelers struggling below.',
      choices: [
        {
          id: '1',
          label: 'Fly high',
          transition: {
            type: 'direct',
            target: 'summit_approach',
          },
        },
        {
          id: '2',
          label: 'scout camps',
          transition: {
            type: 'direct',
            target: 'shelter',
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
    chase: {
      type: 'decision',
      id: 'chase',
      stage: 3,
      title: 'Chase',
      narrative:
        'The griffin’s shadow swallows the trail behind you. You can risk the sprint or return what should never have left its nest.',
      choices: [
        {
          id: '1',
          label: 'Outrun griffin (speed ≥200)',
          transition: {
            type: 'stat',
            stat: 'speed',
            minimum: 200,
            success: 'summit_approach',
            failure: 'shelter',
          },
        },
        {
          id: '2',
          label: 'return egg',
          transition: {
            type: 'direct',
            target: 'shelter',
          },
        },
      ],
    },
    elemental: {
      type: 'decision',
      id: 'elemental',
      stage: 3,
      title: 'Elemental',
      narrative:
        'A figure made of lightning steps from the crystal wall. Its stance suggests a challenge, but it has not yet barred the passage.',
      choices: [
        {
          id: '1',
          label: 'Fight (attack ≥1000)',
          transition: {
            type: 'stat',
            stat: 'attack',
            minimum: 1000,
            success: 'summit_approach',
            failure: 'shelter',
          },
        },
        {
          id: '2',
          label: 'negotiate',
          transition: {
            type: 'direct',
            target: 'shelter',
          },
          effects: {
            rewards: {
              xp: 25,
            },
          },
        },
      ],
    },
    summit_approach: {
      type: 'decision',
      id: 'summit_approach',
      stage: 4,
      title: 'Summit Approach',
      narrative:
        'A crystal bridge reaches toward the star-bloom altar. Rare flowers grow along a dangerous ledge beneath it.',
      choices: [
        {
          id: '1',
          label: 'Cross bridge',
          transition: {
            type: 'direct',
            target: 'summit_choice',
          },
        },
        {
          id: '2',
          label: 'collect flowers',
          transition: {
            type: 'direct',
            target: 'summit_choice',
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
    shelter: {
      type: 'decision',
      id: 'shelter',
      stage: 4,
      title: 'Shelter',
      narrative:
        'A sheltered camp is waiting for a fire. An injured traveler watches you sort the dry wood, trying to hide a badly twisted ankle.',
      choices: [
        {
          id: '1',
          label: 'Gather firewood',
          transition: {
            type: 'direct',
            target: 'camp_choice',
          },
        },
        {
          id: '2',
          label: 'tend traveler',
          transition: {
            type: 'direct',
            target: 'camp_choice',
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
    summit_choice: {
      type: 'decision',
      id: 'summit_choice',
      stage: 5,
      title: 'Summit Choice',
      narrative:
        'The star-bloom altar opens beneath the night sky. A relic measures time in falling light, while the path down promises warmth and company.',
      choices: [
        {
          id: '1',
          label: 'Accept relic',
          transition: {
            type: 'direct',
            target: 'summit',
          },
        },
        {
          id: '2',
          label: 'leave relic and descend',
          transition: {
            type: 'direct',
            target: 'camp',
          },
        },
      ],
    },
    camp_choice: {
      type: 'decision',
      id: 'camp_choice',
      stage: 5,
      title: 'Camp Choice',
      narrative:
        'The fire finally takes and voices drift across the camp. You can rest beside it or trade the story of your climb for the travelers’ gratitude.',
      choices: [
        {
          id: '1',
          label: 'Rest',
          transition: {
            type: 'direct',
            target: 'camp',
          },
        },
        {
          id: '2',
          label: 'trade stories',
          transition: {
            type: 'direct',
            target: 'stories',
          },
        },
      ],
    },
    summit: {
      type: 'terminal',
      id: 'summit',
      title: 'Summit',
      outcome: {
        type: 'CRITICAL_SUCCESS',
        narrative:
          'The relic settles into your hands beneath a sky full of stars. Even the storm falls quiet for the descent.',
        rewards: {
          credits: {
            min: 500,
            max: 500,
          },
          xp: 200,
          items: [
            {
              code: 'RELIC_CHRONOS_HOURGLASS',
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
    camp: {
      type: 'terminal',
      id: 'camp',
      title: 'Camp',
      outcome: {
        type: 'SUCCESS',
        narrative:
          'Warmth returns slowly beside the campfire. The travelers share supplies and make room for one more survivor of the peaks.',
        rewards: {
          credits: {
            min: 250,
            max: 250,
          },
          xp: 100,
          energy: 15,
        },
      },
    },
    stories: {
      type: 'terminal',
      id: 'stories',
      title: 'Stories',
      outcome: {
        type: 'SUCCESS',
        narrative:
          'Your tale keeps the camp awake long after the storm passes. By morning, the travelers have repaid it in supplies and coin.',
        rewards: {
          credits: {
            min: 300,
            max: 300,
          },
          xp: 125,
        },
      },
    },
  },
};
