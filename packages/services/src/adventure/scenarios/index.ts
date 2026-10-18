import type { AdventureScenario } from '../types.js';
import { validateAdventureScenario } from '../validate-scenario.js';
import { CANONICAL_ITEMS } from '../../waifu-tcg/equipment/catalog.js';
import { goblinBazaar } from './the-goblin-bazaar.js';
import { sunkenShrine } from './the-sunken-shrine.js';
import { cursedCrypt } from './the-cursed-crypt.js';
import { celestialPeaks } from './the-celestial-peaks.js';
import { banditAmbush } from './the-bandit-ambush.js';
import { wonderStories } from './expansion-wonders.js';
import { nightfallStories } from './expansion-nightfall.js';
import { wildStories } from './expansion-wilds.js';
import { crossingStories } from './expansion-crossings.js';
import { heightStories } from './expansion-heights.js';
import { dawnStories } from './expansion-dawn.js';

export const ADVENTURE_SCENARIOS: readonly AdventureScenario[] = [
  goblinBazaar,
  sunkenShrine,
  cursedCrypt,
  celestialPeaks,
  banditAmbush,
  ...wonderStories,
  ...nightfallStories,
  ...wildStories,
  ...crossingStories,
  ...heightStories,
  ...dawnStories,
];
if (new Set(ADVENTURE_SCENARIOS.map((scenario) => scenario.id)).size !== ADVENTURE_SCENARIOS.length)
  throw new Error('Duplicate adventure scenario ID');
const itemCodes = new Set(CANONICAL_ITEMS.map((item) => item.code));
for (const scenario of ADVENTURE_SCENARIOS) validateAdventureScenario(scenario, itemCodes);

/** Discord autocomplete has a 25-result limit; searching keeps the entire catalog accessible. */
export function searchAdventureScenarios(query: string): AdventureScenario[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return ADVENTURE_SCENARIOS.filter((scenario) => {
    const text =
      `${scenario.id} ${scenario.title} ${scenario.description} ${scenario.elements.join(' ')}`.toLowerCase();
    return words.every((word) => text.includes(word));
  }).slice(0, 25);
}

export function pickRandomScenario(random: () => number): AdventureScenario {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1)
    throw new Error('Random value must be in [0, 1)');
  return ADVENTURE_SCENARIOS[Math.floor(value * ADVENTURE_SCENARIOS.length)]!;
}

export function getAdventureScenario(id: string, version = 1): AdventureScenario {
  const scenario = ADVENTURE_SCENARIOS.find(
    (entry) => entry.id === id && entry.version === version,
  );
  if (!scenario) throw new Error(`Unknown adventure scenario ${id}@${version}`);
  return scenario;
}
