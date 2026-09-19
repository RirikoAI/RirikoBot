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
});
