import { describe, it, expect } from 'vitest';
import type { GameItem, UserInventoryItem } from '@ririko/database';
import { buildGearMenuView, formatStatDelta, type GearMenuState } from '../gear-menu.js';

const item = (name: string, rarity = 'RARE') =>
  ({ name, rarity, code: name.toUpperCase() }) as GameItem;
const inv = (id: string, enhancementLevel = 0) => ({ id, enhancementLevel }) as UserInventoryItem;

function state(overrides: Partial<GearMenuState> = {}): GearMenuState {
  return {
    cards: [
      { userCardId: 'c1', label: 'Shana Lv.5 [FIRE] ⭐' },
      { userCardId: 'c2', label: 'Holo Lv.3 [EARTH]' },
    ],
    cardId: 'c1',
    cardLabel: 'Shana Lv.5 [FIRE] ⭐',
    loadout: {
      cardId: 'c1',
      weapon: {
        inventoryItem: inv('w1', 2),
        item: item('Novice Blade', 'COMMON'),
        effectiveStats: { attack: 29 },
        effectivePerks: [],
      },
      aggregateStats: { attack: 29 },
      activePerks: [],
    },
    slot: 'WEAPON',
    candidates: [
      {
        inventoryItem: inv('w2'),
        item: item('Obsidian Katana'),
        stats: { attack: 110, critRate: 0.08 },
      },
    ],
    enhanceCost: { dustCost: 75, creditCost: 600 },
    dust: 300,
    ...overrides,
  };
}

function buttons(view: ReturnType<typeof buildGearMenuView>) {
  const row = view.components.at(-1)!.toJSON() as {
    components: Array<{ custom_id: string; disabled?: boolean; label: string }>;
  };
  return Object.fromEntries(row.components.map((b) => [b.custom_id, b]));
}

describe('Gear menu (STORY-157)', () => {
  it('formats stat changes with direction arrows', () => {
    expect(formatStatDelta({ attack: 110, critRate: 0.08 }, { attack: 29, speed: 5 })).toBe(
      'ATK +81 ▲ · CRIT +8% ▲ · SPD -5 ▼',
    );
    expect(formatStatDelta({ attack: 10 }, { attack: 10 })).toBe('No stat change');
  });

  it('shows the loadout, card/slot/item dropdowns and enables actions by context', () => {
    const view = buildGearMenuView(state());
    const text = view.embed.data.description ?? '';
    expect(text).toContain('Novice Blade +2');
    expect(view.embed.data.footer?.text).toContain('300');
    expect(view.components).toHaveLength(4); // card, slot, item, buttons

    const b = buttons(view);
    expect(b['gear:equip']!.disabled).toBe(true); // nothing selected yet
    expect(b['gear:unequip']!.disabled).toBe(false);
    expect(b['gear:enhance']!.label).toContain('75 dust');
    expect(b['gear:unequip_all']!.disabled).toBe(false);

    const selected = buildGearMenuView(state({ selectedItemId: 'w2' }));
    expect(selected.embed.data.description).toContain('ATK +81 ▲');
    expect(buttons(selected)['gear:equip']!.disabled).toBe(false);
  });

  it('handles an empty slot with no spare gear', () => {
    const view = buildGearMenuView(state({ slot: 'RING', candidates: [], enhanceCost: undefined }));
    expect(view.components).toHaveLength(3); // no item dropdown
    expect(view.embed.data.description).toContain('You own no spare gear');
    const b = buttons(view);
    expect(b['gear:unequip']!.disabled).toBe(true);
    expect(b['gear:enhance']!.disabled).toBe(true);
  });

  it('disables Unequip All when the card wears no gear', () => {
    const view = buildGearMenuView(
      state({ loadout: { cardId: 'c1', aggregateStats: {}, activePerks: [] }, enhanceCost: undefined }),
    );
    expect(buttons(view)['gear:unequip_all']!.disabled).toBe(true);
  });

  it('paginates cards and candidate gear when lists exceed 25 (BUG-0016)', () => {
    const allCards = Array.from({ length: 30 }, (_, i) => ({
      userCardId: `card-${i + 1}`,
      label: `Waifu ${i + 1} Lv.1 [FIRE]`,
    }));

    // Page 0 (cards 1-25)
    const page0Cards = allCards.slice(0, 25);
    const view0 = buildGearMenuView(
      state({
        allCards,
        cards: page0Cards,
        cardPage: 0,
        cardId: 'card-1',
      }),
    );
    expect(view0.embed.data.description).toContain('Cards 1–25 of 30 (Page 1/2)');
    expect(view0.components).toHaveLength(5); // card, slot, item, action buttons, pagination buttons

    const pageRow0 = view0.components.at(-1)!.toJSON() as {
      components: Array<{ custom_id: string; disabled?: boolean; label: string }>;
    };
    const b0 = Object.fromEntries(pageRow0.components.map((b) => [b.custom_id, b]));
    expect(b0['gear:card_prev']!.disabled).toBe(true);
    expect(b0['gear:card_page_info']!.label).toBe('Cards 1/2');
    expect(b0['gear:card_next']!.disabled).toBe(false);

    // Page 1 (cards 26-30)
    const page1Cards = allCards.slice(25, 30);
    const view1 = buildGearMenuView(
      state({
        allCards,
        cards: page1Cards,
        cardPage: 1,
        cardId: 'card-26',
      }),
    );
    expect(view1.embed.data.description).toContain('Cards 26–30 of 30 (Page 2/2)');
    const pageRow1 = view1.components.at(-1)!.toJSON() as {
      components: Array<{ custom_id: string; disabled?: boolean; label: string }>;
    };
    const b1 = Object.fromEntries(pageRow1.components.map((b) => [b.custom_id, b]));
    expect(b1['gear:card_prev']!.disabled).toBe(false);
    expect(b1['gear:card_next']!.disabled).toBe(true);

    // Combined pagination when candidates also exceed 25
    const allCandidates = Array.from({ length: 28 }, (_, i) => ({
      inventoryItem: inv(`w-${i + 1}`),
      item: item(`Blade ${i + 1}`),
      stats: { attack: 10 + i },
    }));
    const viewBoth = buildGearMenuView(
      state({
        allCards,
        cards: page0Cards,
        cardPage: 0,
        allCandidates,
        candidates: allCandidates.slice(0, 25),
        candidatePage: 0,
      }),
    );
    const bothRow = viewBoth.components.at(-1)!.toJSON() as {
      components: Array<{ custom_id: string; disabled?: boolean; label: string }>;
    };
    expect(bothRow.components).toHaveLength(4); // [◀ Card] [Card ▶] [◀ Gear] [Gear ▶]
  });
});
