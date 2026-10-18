import { describe, expect, it } from 'vitest';
import {
  CatalogCodeSchema,
  ShopCategoryInputSchema,
  ShopItemInputSchema,
  shopItemEffectValues,
  shopItemMetadata,
} from './shop.js';

const base = {
  code: 'gem',
  name: 'Gem',
  description: 'Shiny.',
  price: 10,
  rarity: 'COMMON',
  categoryId: null,
  iconUrl: null,
  isPurchasable: true,
  dailyPurchaseLimit: null,
  itemType: 'GENERIC',
  energyRestored: null,
  dailyUsageCeiling: null,
  xpAwarded: null,
  creditsAwarded: null,
};

const issues = (value: unknown) => {
  const result = ShopItemInputSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

describe('CatalogCodeSchema', () => {
  it('lowercases and trims, and refuses other characters or lengths', () => {
    expect(CatalogCodeSchema.parse('  Big_Potion2 ')).toBe('big_potion2');
    for (const bad of ['a', 'has space', 'dash-code', 'x'.repeat(33), 42]) {
      expect(CatalogCodeSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('ShopItemInputSchema', () => {
  it('reads form strings: numbers, empty optional fields and flags', () => {
    const item = ShopItemInputSchema.parse({
      ...base,
      price: '250',
      categoryId: '',
      iconUrl: ' ',
      isPurchasable: 'off',
      dailyPurchaseLimit: '',
      itemType: 'XP_GRANT',
      xpAwarded: '150',
    });
    expect(item).toMatchObject({
      price: 250,
      categoryId: null,
      iconUrl: null,
      isPurchasable: false,
      dailyPurchaseLimit: null,
      xpAwarded: 150,
    });
  });

  it('needs the amount of the chosen effect and drops the others', () => {
    expect(issues({ ...base, itemType: 'CREDITS_GRANT' })).toEqual(['creditsAwarded']);
    const item = ShopItemInputSchema.parse({
      ...base,
      itemType: 'ENERGY_RESTORE',
      energyRestored: 50,
      xpAwarded: 10,
    });
    expect(item).toMatchObject({ energyRestored: 50, dailyUsageCeiling: 3, xpAwarded: null });
  });

  it('refuses bad values', () => {
    expect(issues({ ...base, price: -1 })).toEqual(['price']);
    expect(issues({ ...base, rarity: 'MYTHIC' })).toEqual(['rarity']);
    expect(issues({ ...base, iconUrl: 'http://example.com/a.png' })).toEqual(['iconUrl']);
    expect(issues({ ...base, name: '   ' })).toEqual(['name']);
    expect(issues({ ...base, itemType: 'TELEPORT' })).toEqual(['itemType']);
    expect(issues({ ...base, extra: 1 })).toEqual(['']);
  });
});

describe('shop item metadata', () => {
  it('keeps keys the editor does not own and replaces effect keys', () => {
    const input = ShopItemInputSchema.parse({ ...base, itemType: 'XP_GRANT', xpAwarded: 80 });
    expect(
      shopItemMetadata(input, {
        seasonTag: 'summer',
        itemType: 'ENERGY_RESTORE',
        energyRestored: 5,
      }),
    ).toEqual({ seasonTag: 'summer', itemType: 'XP_GRANT', xpAwarded: 80 });
  });

  it('reads editor values back, with unknown effects as GENERIC', () => {
    expect(
      shopItemEffectValues({
        itemType: 'ENERGY_RESTORE',
        energyRestored: 20,
        dailyPurchaseLimit: 1,
      }),
    ).toEqual({
      itemType: 'ENERGY_RESTORE',
      energyRestored: 20,
      dailyUsageCeiling: null,
      xpAwarded: null,
      creditsAwarded: null,
      dailyPurchaseLimit: 1,
    });
    expect(shopItemEffectValues({ itemType: 'LEGACY' }).itemType).toBe('GENERIC');
    expect(shopItemEffectValues(null).itemType).toBe('GENERIC');
  });
});

describe('ShopCategoryInputSchema', () => {
  it('reads an empty description as none', () => {
    expect(
      ShopCategoryInputSchema.parse({ code: 'Tools', name: ' Tools ', description: '' }),
    ).toEqual({
      code: 'tools',
      name: 'Tools',
      description: null,
    });
  });
});
