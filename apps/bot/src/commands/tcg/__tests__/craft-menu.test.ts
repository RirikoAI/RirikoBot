import { describe, it, expect } from 'vitest';
import type { GameItem } from '@ririko/database';
import type { RecipeStatus } from '@ririko/services';
import { buildCraftMenuView, type CraftMenuState } from '../craft-menu.js';

function recipeStatus(overrides: Partial<RecipeStatus> = {}): RecipeStatus {
  const outputItem = {
    code: 'WEAPON_OBSIDIAN_KATANA',
    name: 'Obsidian Katana',
    description: 'A volcanic blade.',
    type: 'EQUIPMENT',
    subtype: 'WEAPON',
    rarity: 'RARE',
    baseStats: { attack: 110, critRate: 0.08 },
    battlePerks: ['SHARPENED_EDGE'],
  } as unknown as GameItem;

  return {
    recipe: {
      code: 'CRAFT_WEAPON_OBSIDIAN_KATANA',
      outputCode: 'WEAPON_OBSIDIAN_KATANA',
      outputQuantity: 1,
      dustCost: 90,
      creditCost: 3938,
      unlockFloor: 10,
    },
    outputItem,
    unlocked: true,
    requiredFloor: 10,
    userHighestFloor: 12,
    ownedDust: 500,
    ownedCredits: 10000,
    ingredients: [],
    affordable: true,
    ...overrides,
  };
}

function state(overrides: Partial<CraftMenuState> = {}): CraftMenuState {
  const recipes = overrides.recipes ?? [recipeStatus()];
  return {
    category: 'WEAPON',
    allRecipes: recipes,
    recipes,
    selectedIndex: 0,
    dust: 500,
    credits: 10000,
    ...overrides,
  };
}

function buttons(view: ReturnType<typeof buildCraftMenuView>) {
  const row = view.components.at(-1)!.toJSON() as {
    components: Array<{ custom_id: string; disabled?: boolean; label: string }>;
  };
  return Object.fromEntries(row.components.map((b) => [b.custom_id, b]));
}

describe('Crafting menu (TASK-1602)', () => {
  it('shows the recipe list, output stats and an enabled Craft button when affordable', () => {
    const view = buildCraftMenuView(state());
    const text = view.embed.data.description ?? '';
    expect(text).toContain('Obsidian Katana');
    expect(text).toContain('✅ Ready');
    expect(text).toContain('Output stats: ATK +110');
    expect(view.embed.data.footer?.text).toContain('500');
    expect(view.components).toHaveLength(3); // category select, recipe select, buttons

    const b = buttons(view);
    expect(b['craft:craft']!.disabled).toBe(false);
    expect(b['craft:craft']!.label).toContain('90 dust');
  });

  it('disables Craft and shows a lock icon for a locked recipe', () => {
    const locked = recipeStatus({ unlocked: false, affordable: false, requiredFloor: 30, userHighestFloor: 12 });
    const view = buildCraftMenuView(state({ recipes: [locked] }));
    const text = view.embed.data.description ?? '';
    expect(text).toContain('🔒 Floor 30');
    expect(text).toContain('requires clearing floor **30**');
    expect(buttons(view)['craft:craft']!.disabled).toBe(true);
  });

  it('disables Craft when unlocked but unaffordable, and lists ingredient shortfalls', () => {
    const short = recipeStatus({
      affordable: false,
      ownedDust: 10,
      ingredients: [{ code: 'WEAPON_OBSIDIAN_KATANA', name: 'Obsidian Katana', requiredPerCraft: 1, owned: 0, sufficient: false }],
    });
    const view = buildCraftMenuView(state({ recipes: [short], dust: 10 }));
    const text = view.embed.data.description ?? '';
    expect(text).toContain('❌ Short');
    expect(text).toContain('❌ Obsidian Katana x1 (have 0)');
    expect(buttons(view)['craft:craft']!.disabled).toBe(true);
  });

  it('shows an empty category without a recipe select menu', () => {
    const view = buildCraftMenuView(state({ recipes: [] }));
    expect(view.components).toHaveLength(2); // category select + buttons only
    expect(view.embed.data.description).toContain('No recipes in this category');
    expect(buttons(view)['craft:craft']!.disabled).toBe(true);
  });
});
