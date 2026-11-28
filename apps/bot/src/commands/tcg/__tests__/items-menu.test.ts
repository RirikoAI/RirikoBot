import { describe, expect, it } from 'vitest';
import {
  ITEMS_PAGE_SIZE,
  buildItemsView,
  entriesInCategory,
  loadItemEntries,
  loadItemsOverview,
  pageCount,
  parseItemCategory,
  selectedEntry,
  type ItemEntry,
  type ItemsViewState,
} from '../items-menu.js';
import type { BotServices } from '../../../services.js';

const entry = (over: Partial<ItemEntry> = {}): ItemEntry => ({
  key: 'tcg:1',
  source: 'tcg',
  category: 'EQUIPMENT',
  id: '1',
  code: 'SWORD',
  name: 'Sword',
  rarity: 'RARE',
  description: 'A sword.',
  quantity: 1,
  level: 0,
  perks: [],
  stackable: false,
  canUse: false,
  canEnhance: true,
  ...over,
});

const state = (over: Partial<ItemsViewState> = {}): ItemsViewState => ({
  ownerName: 'Ann',
  category: 'EQUIPMENT',
  page: 0,
  entries: [entry()],
  overview: {},
  readOnly: false,
  ...over,
});

const ids = (view: ReturnType<typeof buildItemsView>) =>
  view.components.flatMap((row) => row.components.map((c) => (c.toJSON() as any).custom_id));

describe('parseItemCategory', () => {
  it('reads category words, plurals and the gear synonyms', () => {
    expect(parseItemCategory('Potions')).toBe('POTIONS');
    expect(parseItemCategory('gear')).toBe('EQUIPMENT');
    expect(parseItemCategory('accessory')).toBe('ACCESSORIES');
    expect(parseItemCategory('materials')).toBe('MATERIALS');
    expect(parseItemCategory('bag')).toBe('BAG');
    expect(parseItemCategory('all')).toBe('OVERVIEW');
  });

  it('returns undefined for empty or unknown input', () => {
    expect(parseItemCategory(undefined)).toBeUndefined();
    expect(parseItemCategory(null)).toBeUndefined();
    expect(parseItemCategory('')).toBeUndefined();
    expect(parseItemCategory('shoes')).toBeUndefined();
  });
});

describe('buildItemsView', () => {
  it('builds the overview with the figures and no item menu', () => {
    const view = buildItemsView(
      state({
        category: 'OVERVIEW',
        overview: {
          energy: { current: 5, max: 10, bonus: 2 },
          potionsUsed: 1,
          potionLimit: 3,
          dust: 9,
        },
      }),
    );
    const text = view.embed.data.description!;
    expect(text).toContain('5/12');
    expect(text).toContain('1/3');
    expect(text).toContain('Crafting Dust**: `9`');
    expect(ids(view)).toEqual(['items:category', 'items:craft']);
  });

  it('omits the overview figures that are unknown', () => {
    const text = buildItemsView(state({ category: 'OVERVIEW' })).embed.data.description!;
    expect(text).not.toContain('Energy**');
    expect(text).not.toContain('Dust');
  });

  it('offers the right buttons for gear, usable items and read-only views', () => {
    expect(ids(buildItemsView(state()))).toEqual([
      'items:category',
      'items:item',
      'items:enhance',
      'items:craft',
    ]);
    const usable = entry({ canUse: true, canEnhance: false, category: 'ENERGY' });
    expect(ids(buildItemsView(state({ category: 'ENERGY', entries: [usable] })))).toContain(
      'items:use',
    );
    expect(ids(buildItemsView(state({ readOnly: true })))).toEqual([
      'items:category',
      'items:item',
    ]);
  });

  it('pages 25 items at a time and disables Previous and Next at the ends', () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry({ key: `tcg:${i}`, id: `${i}` }));
    expect(pageCount(30)).toBe(2);
    expect(pageCount(0)).toBe(1);
    const first = buildItemsView(state({ entries }));
    const buttons = first.components[2]!.components.map((c) => c.toJSON() as any);
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(false);
    expect((first.components[1]!.components[0]!.toJSON() as any).options).toHaveLength(
      ITEMS_PAGE_SIZE,
    );
    const last = buildItemsView(state({ entries, page: 5 }));
    expect((last.components[1]!.components[0]!.toJSON() as any).options).toHaveLength(5);
    expect((last.components[2]!.components[1]!.toJSON() as any).disabled).toBe(true);
    expect(last.embed.data.footer!.text).toContain('Page 2/2');
  });

  it('keeps long lists within the description budget', () => {
    const entries = Array.from({ length: 25 }, (_, i) =>
      entry({
        key: `tcg:${i}`,
        id: `${i}`,
        name: 'N'.repeat(100),
        level: 3,
        slot: 'ARMOR',
        wornBy: 'W'.repeat(100),
        description: 'D'.repeat(500),
        perks: ['A', 'B'],
      }),
    );
    const text = buildItemsView(state({ entries })).embed.data.description!;
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toContain('more on this page');
  });

  it('shows details, stackable quantity, hints and unknown wearers', () => {
    const potion = entry({
      key: 'bag:p',
      source: 'bag',
      category: 'BAG',
      name: 'Potion',
      stackable: true,
      quantity: 4,
      canEnhance: false,
      hint: 'Use it wisely.',
      wornBy: 'Aria',
    });
    const text = buildItemsView(
      state({ category: 'BAG', entries: [potion], selectedKey: 'bag:p', notice: 'Done!' }),
    ).embed.data.description!;
    expect(text).toContain('Done!');
    expect(text).toContain('(Quantity: 4)');
    expect(text).toContain('Code: `SWORD`');
    expect(text).toContain('Worn by: Aria');
    expect(text).toContain('Use it wisely.');
    const unknown = buildItemsView(state({ entries: [entry({ slot: 'WEAPON' })] })).embed.data
      .description!;
    expect(unknown).toContain('on unknown card');
  });

  it('names items with a level and an empty description in the menu', () => {
    const view = buildItemsView(state({ entries: [entry({ level: 4, description: '' })] }));
    const option = (view.components[1]!.components[0]!.toJSON() as any).options[0];
    expect(option.label).toBe('Sword (+4)');
    expect(option.description).toBe('RARE item');
  });

  it('disables every component when the view is disabled', () => {
    const view = buildItemsView(
      state({
        disabled: true,
        entries: Array.from({ length: 30 }, (_, i) => entry({ key: `k${i}` })),
      }),
    );
    for (const row of view.components) {
      for (const c of row.components) expect((c.toJSON() as any).disabled).toBe(true);
    }
  });
});

describe('selectedEntry and entriesInCategory', () => {
  it('prefers the selected key, else the first entry of the page', () => {
    const entries = [entry({ key: 'a' }), entry({ key: 'b' })];
    expect(selectedEntry(state({ entries, selectedKey: 'b' }))?.key).toBe('b');
    expect(selectedEntry(state({ entries }))?.key).toBe('a');
    expect(selectedEntry(state({ entries: [] }))).toBeUndefined();
    expect(entriesInCategory(entries, 'OVERVIEW')).toEqual([]);
  });
});

describe('loadItemEntries and loadItemsOverview', () => {
  const def = (over: Record<string, unknown>) => ({
    id: 'd',
    code: 'C',
    name: 'N',
    type: 'EQUIPMENT',
    subtype: 'WEAPON',
    rarity: 'COMMON',
    description: 'desc',
    battlePerks: null,
    ...over,
  });
  const inv = (id: string, itemId: string, over: Record<string, unknown> = {}) => ({
    id,
    itemId,
    quantity: 1,
    enhancementLevel: 0,
    state: 'IDLE',
    slot: 'NONE',
    equippedToCardId: null,
    ...over,
  });

  it('sorts every item type into its category and drops unknown definitions', async () => {
    const defs: Record<string, any> = {
      weapon: def({ id: 'weapon' }),
      ring: def({ id: 'ring', type: 'ACCESSORY' }),
      hp: def({ id: 'hp', type: 'CONSUMABLE', subtype: 'HP_POTION' }),
      energy: def({ id: 'energy', type: 'CONSUMABLE', subtype: 'ENERGY_POTION' }),
      ore: def({ id: 'ore', type: 'MATERIAL', subtype: 'ORE' }),
    };
    const services = {
      userInventoryItemRepo: {
        findByUser: async () => [
          inv('1', 'weapon'),
          inv('2', 'ring'),
          inv('3', 'hp'),
          inv('4', 'energy'),
          inv('5', 'ore'),
          inv('6', 'gone'),
        ],
      },
      gameItemRepo: { findById: async (id: string) => defs[id] ?? null },
      waifuCardRepo: {},
      inventoryService: {
        getUserInventory: async () => [
          {
            itemId: 'b1',
            quantity: 2,
            item: {
              code: 'x',
              name: 'X',
              rarity: 'RARE',
              description: 'd',
              metadata: { itemType: 'ENERGY_RESTORE' },
            },
          },
          {
            itemId: 'b2',
            quantity: 1,
            item: {
              code: 'v',
              name: 'V',
              rarity: 'RARE',
              description: 'd',
              metadata: { itemType: 'PROFILE_BG_TOKEN' },
            },
          },
          { itemId: 'b3', quantity: 1, item: null },
        ],
      },
    } as unknown as BotServices;

    const entries = await loadItemEntries(services, 'u');
    const by = (key: string) => entries.find((e) => e.key === key)!;
    expect(entries).toHaveLength(8);
    expect(by('tcg:1').category).toBe('EQUIPMENT');
    expect(by('tcg:1').canEnhance).toBe(true);
    expect(by('tcg:2').category).toBe('ACCESSORIES');
    expect(by('tcg:3').category).toBe('POTIONS');
    expect(by('tcg:3').canUse).toBe(false);
    expect(by('tcg:4').category).toBe('ENERGY');
    expect(by('tcg:4').canUse).toBe(true);
    expect(by('tcg:5').category).toBe('MATERIALS');
    expect(by('bag:b1').category).toBe('ENERGY');
    expect(by('bag:b1').canUse).toBe(true);
    expect(by('bag:b2').category).toBe('BAG');
    expect(by('bag:b2').canUse).toBe(false);
    expect(by('bag:b3').name).toBe('b3');
    expect(by('bag:b3').canUse).toBe(true);
  });

  it('reads the overview figures and leaves out the ones that fail', async () => {
    const ok = await loadItemsOverview(
      {
        energyLifecycleService: {
          getOrReconcileUserEnergy: async () => ({
            currentEnergy: 1,
            maxEnergy: 2,
            bonusEnergy: 3,
            dailyEnergyPotsUsed: 4,
          }),
          rules: async () => ({ dailyPotionLimit: 5 }),
        },
        enhancementService: { getDustBalance: async () => 6 },
      } as unknown as BotServices,
      'u',
    );
    expect(ok).toEqual({
      energy: { current: 1, max: 2, bonus: 3 },
      potionsUsed: 4,
      potionLimit: 5,
      dust: 6,
    });

    const broken = await loadItemsOverview({} as unknown as BotServices, 'u');
    expect(broken).toEqual({});
  });
});
