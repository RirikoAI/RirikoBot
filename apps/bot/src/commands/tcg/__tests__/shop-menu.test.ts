import { describe, it, expect } from 'vitest';
import type { GameItem } from '@ririko/database';
import { buildShopView, type ShopMenuState } from '../shop-menu.js';

const katana = {
  code: 'WEAPON_OBSIDIAN_KATANA',
  name: 'Obsidian Katana',
  description: 'Volcanic blade.',
  type: 'EQUIPMENT',
  subtype: 'WEAPON',
  rarity: 'RARE',
  baseStats: { attack: 110, critRate: 0.08 },
  battlePerks: ['SHARPENED_EDGE'],
  shopPrice: 2250,
  maxDailyPurchases: 1,
} as unknown as GameItem;

const potion = {
  code: 'POTION_MINOR_HP',
  name: 'Minor HP Potion',
  description: 'Heals.',
  type: 'CONSUMABLE',
  subtype: 'HP_POTION',
  rarity: 'COMMON',
  baseStats: {},
  battlePerks: [],
  shopPrice: 50,
  maxDailyPurchases: 10,
} as unknown as GameItem;

function buttonRow(view: ReturnType<typeof buildShopView>, index: number) {
  const row = view.components[index]!.toJSON() as {
    components: Array<{ custom_id: string; disabled?: boolean; style: number }>;
  };
  return Object.fromEntries(row.components.map((b) => [b.custom_id, b]));
}

describe('Town shop menu (STORY-158)', () => {
  const base: ShopMenuState = { category: 'DAILY', items: [katana, potion], selectedIndex: 0 };

  it('compares gear with the equipped card and offers Buy & Equip', () => {
    const view = buildShopView({
      ...base,
      vanguardName: 'Shana',
      equippedName: 'Novice Blade',
      equippedStats: { attack: 25, critRate: 0.02 },
    });
    const text = view.embed.data.description ?? '';
    expect(view.embed.data.title).toContain('Daily Deals');
    expect(text).toContain('Drop-only gear, on sale today only');
    expect(text).toContain('on **Shana** (Novice Blade): ATK +85 ▲ · CRIT +6% ▲');

    const buy = buttonRow(view, 2);
    expect(buy['shop:buy_equip']!.disabled).toBe(false);
    expect(buy['shop:buy:5']!.disabled).toBe(true); // gear buys one at a time
    expect(buttonRow(view, 0)['shop:cat:DAILY']!.style).toBe(1); // Primary = active category
  });

  it('keeps Buy & Equip off for potions and when no card is equipped', () => {
    const potionView = buildShopView({ ...base, category: 'CONSUMABLE', selectedIndex: 1 });
    const buy = buttonRow(potionView, 2);
    expect(buy['shop:buy_equip']!.disabled).toBe(true);
    expect(buy['shop:buy:5']!.disabled).toBe(false);

    expect(buttonRow(buildShopView(base), 2)['shop:buy_equip']!.disabled).toBe(true);
  });

  it('shows an empty category without item controls', () => {
    const view = buildShopView({ category: 'ACCESSORY', items: [], selectedIndex: 0 });
    expect(view.components).toHaveLength(1);
    expect(view.embed.data.description).toContain('Nothing in stock');
  });

  it('paginates shop items when catalog exceeds 25 items (BUG-0016)', () => {
    const manyItems = Array.from(
      { length: 28 },
      (_, i) =>
        ({
          code: `SHOP_ITEM_${i + 1}`,
          name: `Shop Item ${i + 1}`,
          description: `Item description ${i + 1}`,
          type: 'EQUIPMENT',
          subtype: 'WEAPON',
          rarity: 'COMMON',
          baseStats: { attack: 10 + i },
          battlePerks: [],
          shopPrice: 100 * (i + 1),
          maxDailyPurchases: 5,
        }) as unknown as GameItem,
    );

    // Page 0 (items 1-25)
    const view0 = buildShopView({ category: 'ALL', items: manyItems, selectedIndex: 0, page: 0 });
    expect(view0.embed.data.description).toContain('Showing 1–25 of 28 (Page 1/2)');
    expect(view0.components).toHaveLength(4); // category row, select menu, buy buttons, pagination buttons

    const pageRow0 = view0.components[3]!.toJSON() as {
      components: Array<{ custom_id: string; disabled?: boolean; label: string }>;
    };
    const b0 = Object.fromEntries(pageRow0.components.map((b) => [b.custom_id, b]));
    expect(b0['shop:prev']!.disabled).toBe(true);
    expect(b0['shop:page_info']!.label).toBe('Page 1 / 2');
    expect(b0['shop:next']!.disabled).toBe(false);

    // Page 1 (items 26-28)
    const view1 = buildShopView({ category: 'ALL', items: manyItems, selectedIndex: 25, page: 1 });
    expect(view1.embed.data.description).toContain('Showing 26–28 of 28 (Page 2/2)');
    expect(view1.embed.data.description).toContain('Shop Item 26');
    const pageRow1 = view1.components[3]!.toJSON() as {
      components: Array<{ custom_id: string; disabled?: boolean; label: string }>;
    };
    const b1 = Object.fromEntries(pageRow1.components.map((b) => [b.custom_id, b]));
    expect(b1['shop:prev']!.disabled).toBe(false);
    expect(b1['shop:next']!.disabled).toBe(true);
  });
});
