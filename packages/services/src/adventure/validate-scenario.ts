import type { AdventureEffects, AdventureScenario, AdventureTransition } from './types.js';

export const ADVENTURE_RARITIES = [
  'COMMON',
  'UNCOMMON',
  'RARE',
  'SUPER_RARE',
  'ULTRA_RARE',
  'SECRET_RARE',
  'SIR',
  'MYTHIC',
] as const;
const ELEMENTS = ['FIRE', 'ICE', 'EARTH', 'LIGHTNING', 'WATER', 'LIGHT', 'SHADOW'];

export function adventureTargets(transition: AdventureTransition): string[] {
  return transition.type === 'direct'
    ? [transition.target]
    : [transition.success, transition.failure];
}

/** Fail closed at startup, before a malformed catalog can charge a player. */
export function validateAdventureScenario(
  scenario: AdventureScenario,
  itemCodes?: ReadonlySet<string>,
): void {
  const fail = (message: string): never => {
    throw new Error(`Adventure ${scenario.id}: ${message}`);
  };
  const integer = (value: number, name: string): void => {
    if (!Number.isSafeInteger(value) || value < 0) fail(`invalid ${name}`);
  };
  const chance = (value: number): void => {
    if (!Number.isFinite(value) || value < 0 || value > 1) fail('invalid probability');
  };
  const item = (code: string, quantity: number): void => {
    if (!/^[A-Z][A-Z0-9_]+$/.test(code) || (itemCodes && !itemCodes.has(code)))
      fail(`unknown item ${code}`);
    integer(quantity, 'item quantity');
    if (quantity === 0) fail('empty item quantity');
  };
  const effects = (value: AdventureEffects): void => {
    if (
      value.rewards?.rankScaling !== undefined &&
      !['standard', 'none'].includes(value.rewards.rankScaling)
    )
      fail('invalid rank scaling');
    for (const range of [value.rewards?.credits, value.penalties?.credits]) {
      if (range) {
        integer(range.min, 'credit minimum');
        integer(range.max, 'credit maximum');
        if (range.min > range.max) fail('inverted credit range');
      }
    }
    for (const amount of [
      value.rewards?.xp,
      value.rewards?.dust,
      value.rewards?.energy,
      value.penalties?.energy,
    ]) {
      if (amount !== undefined) integer(amount, 'effect amount');
    }
    if (value.rewards?.card) {
      chance(value.rewards.card.chance);
      if (!ADVENTURE_RARITIES.includes(value.rewards.card.minRarity)) fail('invalid rarity floor');
    }
    for (const drop of value.rewards?.items ?? []) {
      if (drop.code === 'CRAFTING_DUST') fail('use rewards.dust for crafting dust');
      item(drop.code, drop.quantity);
      chance(drop.chance);
    }
  };
  if (!scenario.id || !scenario.title || !scenario.description) fail('missing scenario text');
  if (scenario.scene !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scenario.scene))
    fail('invalid scene asset name');
  integer(scenario.version, 'version');
  if (
    scenario.version === 0 ||
    ![4, 5].includes(scenario.totalDecisions) ||
    scenario.energyCost !== 15
  )
    fail('invalid scenario settings');
  if (!['SAFE', 'BALANCED', 'HIGH_RISK', 'EXTREME'].includes(scenario.risk)) fail('invalid risk');
  integer(scenario.color, 'color');
  if (scenario.color > 0xffffff || scenario.elements.some((element) => !ELEMENTS.includes(element)))
    fail('invalid theme');
  const root = scenario.nodes[scenario.rootNodeId];
  if (!root || root.type !== 'decision' || root.stage !== 1) fail('invalid root');
  for (const [id, node] of Object.entries(scenario.nodes)) {
    if (id !== node.id || !node.title) fail(`invalid node ${id}`);
    if (node.type === 'terminal') {
      effects(node.outcome);
      if (
        !node.outcome.narrative ||
        !['CRITICAL_SUCCESS', 'SUCCESS', 'MIXED', 'FAILURE', 'CRITICAL_FAILURE'].includes(
          node.outcome.type,
        )
      )
        fail(`invalid terminal ${id}`);
      continue;
    }
    if (
      !node.narrative ||
      !Number.isInteger(node.stage) ||
      node.stage < 1 ||
      node.stage > scenario.totalDecisions
    )
      fail(`invalid decision ${id}`);
    if (node.choices.length < 2 || node.choices.length > 4) fail(`invalid choice count at ${id}`);
    const ids = new Set<string>();
    const consequences = new Set<string>();
    if (!node.choices.some((choice) => !choice.cost && choice.transition.type === 'direct'))
      fail(`no free ungated choice at ${id}`);
    for (const choice of node.choices) {
      if (
        choice.terminalRankScaling !== undefined &&
        (choice.terminalRankScaling !== 'none' || node.stage !== scenario.totalDecisions)
      )
        fail('invalid terminal rank scaling');
      if (!choice.id || ids.has(choice.id) || !choice.label || choice.label.length > 80)
        fail(`invalid choice at ${id}`);
      ids.add(choice.id);
      const consequence = JSON.stringify({
        transition: choice.transition,
        cost: choice.cost ?? null,
        effects: choice.effects ?? null,
      });
      if (consequences.has(consequence)) fail(`identical choice consequences at ${id}`);
      consequences.add(consequence);
      if (choice.effects) effects(choice.effects);
      if (choice.cost?.credits !== undefined) {
        integer(choice.cost.credits, 'price');
        if (!choice.cost.credits) fail('empty price');
      }
      for (const cost of choice.cost?.items ?? []) item(cost.code, cost.quantity);
      if (choice.cost && !choice.cost.credits && !choice.cost.items?.length) fail('empty cost');
      const transition = choice.transition;
      if (transition.type === 'skill') {
        chance(transition.chance);
        if (transition.elementBonus !== undefined) chance(transition.elementBonus);
      }
      if (
        'element' in transition &&
        transition.element !== undefined &&
        !ELEMENTS.includes(transition.element)
      )
        fail('invalid element');
      if (transition.type === 'stat') {
        if (!['attack', 'defense', 'speed'].includes(transition.stat)) fail('invalid stat');
        integer(transition.minimum, 'stat threshold');
      }
      for (const target of adventureTargets(transition)) {
        const next = scenario.nodes[target];
        if (!next) return fail(`missing target ${target}`);
        if (
          next.type === 'terminal'
            ? node.stage !== scenario.totalDecisions
            : next.stage !== node.stage + 1
        )
          fail(`invalid depth from ${id} to ${target}`);
      }
    }
  }
  const visited = new Set<string>();
  const walk = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = scenario.nodes[id];
    if (node?.type === 'decision')
      for (const choice of node.choices)
        for (const target of adventureTargets(choice.transition)) walk(target);
  };
  walk(scenario.rootNodeId);
  if (visited.size !== Object.keys(scenario.nodes).length) fail('unreachable nodes');
}
