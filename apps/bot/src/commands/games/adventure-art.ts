import { existsSync } from 'node:fs';
import { AttachmentBuilder } from 'discord.js';
import { resolveWorkspacePath } from '@ririko/core';
import { ADVENTURE_SCENARIOS } from '@ririko/services';

/** Related branches share a setting; every authored decision and ending is mapped explicitly. */
export const ADVENTURE_SCENE_GROUPS: Record<string, Record<string, readonly string[]>> = {
  ...Object.fromEntries(
    ADVENTURE_SCENARIOS.flatMap((scenario) =>
      scenario.scene ? [[scenario.id, { [scenario.scene]: Object.keys(scenario.nodes) }]] : [],
    ),
  ),
  'the-goblin-bazaar': {
    'bazaar-market': [
      'root',
      'market',
      'detention',
      'brawl',
      'relic',
      'appraiser',
      'counterfeit',
      'appraised',
      'scammed',
      'recovery',
    ],
    'bazaar-tavern': [
      'tavern',
      'winning_table',
      'losing_table',
      'cash_exit',
      'broke_exit',
      'jackpot',
      'broke',
    ],
    'bazaar-vault': [
      'vault',
      'pursuit',
      'quiet_exit',
      'relic_exit',
      'scam_exit',
      'chest_exit',
      'safe_exit',
      'chased',
      'clean',
    ],
  },
  'the-sunken-shrine': {
    'shrine-entry': ['root', 'antechamber', 'grotto', 'whirlpool'],
    'shrine-sanctum': [
      'sanctum',
      'puzzle',
      'guardian',
      'blessing',
      'trap',
      'flood',
      'victory',
      'bruised',
      'flood_exit',
      'bruised_exit',
      'flooded',
      'bruised_but_through',
    ],
    'shrine-treasure': [
      'treasure',
      'reward_exit',
      'victory_exit',
      'treasure_room',
      'restored',
      'guardian_victory',
    ],
  },
  'the-cursed-crypt': {
    'crypt-entry': ['root', 'purified', 'shadow', 'alarm', 'pursuit', 'retreat_gate', 'retreat'],
    'crypt-throne': [
      'audience',
      'throne',
      'curse_gate',
      'crown_gate',
      'crown',
      'mercy',
      'consumed',
      'cursed',
    ],
    'crypt-armory': ['avarice', 'armory_gate', 'avarice_gate', 'lance', 'aegis'],
  },
  'the-celestial-peaks': {
    'peaks-trail': ['root', 'switchbacks', 'ridge', 'hermit', 'chase', 'stories'],
    'peaks-cavern': ['caverns', 'elemental', 'shelter', 'camp_choice', 'camp'],
    'peaks-summit': ['nest', 'flight', 'summit_approach', 'summit_choice', 'summit'],
  },
  'the-bandit-ambush': {
    'bandit-road': [
      'root',
      'scattered',
      'overpowered',
      'passage',
      'road',
      'road_gate',
      'diplomacy_gate',
      'road_reward',
      'diplomacy',
    ],
    'bandit-camp': [
      'camp',
      'duel',
      'job',
      'sneak',
      'hoard_gate',
      'trap_gate',
      'supply_gate',
      'duel_gate',
      'refusal_gate',
      'sneak_gate',
      'jackpot',
      'supplies',
      'duel_won',
      'sneak_loot',
      'refused',
      'explosion',
    ],
    'bandit-escape': ['escaped', 'briar'],
  },
};

export function adventureScene(scenarioId: string, nodeId: string): string | undefined {
  return Object.entries(ADVENTURE_SCENE_GROUPS[scenarioId] ?? {}).find(([, nodes]) =>
    nodes.includes(nodeId),
  )?.[0];
}

export function adventureArtwork(
  scenarioId: string,
  nodeId: string,
): AttachmentBuilder | undefined {
  const scene = adventureScene(scenarioId, nodeId);
  if (!scene) return undefined;
  const path = resolveWorkspacePath(`assets/adventure/scenes/${scene}.png`);
  // Text adventures remain usable when optional artwork is absent from a deployment.
  return existsSync(path)
    ? new AttachmentBuilder(path, { name: 'adventure-scene.png' })
    : undefined;
}
