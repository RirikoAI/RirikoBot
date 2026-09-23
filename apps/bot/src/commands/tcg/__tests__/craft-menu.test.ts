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

  it('paginates recipes when list exceeds 25 (BUG-0016)', () => {
    const manyRecipes = Array.from({ length: 27 }, (_, i) =>
      recipeStatus({
        recipe: {
          code: `CRAFT_ITEM_${i + 1}`,
          outputCode: `ITEM_${i + 1}`,
          outputQuantity: 1,
          dustCost: 50,
          creditCost: 1000,
          unlockFloor: 1,
        },
        outputItem: {
          code: `ITEM_${i + 1}`,
          name: `Craftable Item ${i + 1}`,
          description: `Description ${i + 1}`,
          type: 'EQUIPMENT',
          subtype: 'WEAPON',
          rarity: 'COMMON',
          baseStats: { attack: 10 + i },
          battlePerks: [],
        } as unknown as GameItem,
      }),
    );

    // Page 0 (recipes 1-25)
    const view0 = buildCraftMenuView(state({ recipes: manyRecipes, page: 0, selectedIndex: 0 }));
    expect(view0.embed.data.description).toContain('Showing 1–25 of 27 (Page 1/2)');
    expect(view0.components).toHaveLength(4); // category select, recipe select, pagination row, action row

    const pageRow0 = view0.components[2]!.toJSON() as {
      components: Array<{ custom_id: string; disabled?: boolean; label: string }>;
    };
    const b0 = Object.fromEntries(pageRow0.components.map((b) => [b.custom_id, b]));
    expect(b0['craft:prev']!.disabled).toBe(true);
    expect(b0['craft:page_info']!.label).toBe('Page 1 / 2');
    expect(b0['craft:next']!.disabled).toBe(false);

    // Page 1 (recipes 26-27)
    const view1 = buildCraftMenuView(state({ recipes: manyRecipes, page: 1, selectedIndex: 25 }));
    expect(view1.embed.data.description).toContain('Showing 26–27 of 27 (Page 2/2)');
    expect(view1.embed.data.description).toContain('Craftable Item 26');
    const pageRow1 = view1.components[2]!.toJSON() as {
      components: Array<{ custom_id: string; disabled?: boolean; label: string }>;
    };
    const b1 = Object.fromEntries(pageRow1.components.map((b) => [b.custom_id, b]));
    expect(b1['craft:prev']!.disabled).toBe(false);
    expect(b1['craft:next']!.disabled).toBe(true);
  });
});
