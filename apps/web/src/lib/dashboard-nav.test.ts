import { describe, expect, it } from 'vitest';
import { GUILD_NAV_GROUPS, GUILD_NAV_ITEMS } from './dashboard-nav';

describe('guild dashboard navigation', () => {
  it('gives every item a known group', () => {
    const groups = new Set<string>(GUILD_NAV_GROUPS.map((group) => group.id));
    for (const item of GUILD_NAV_ITEMS) expect(groups.has(item.group)).toBe(true);
  });

  it('has at least one item in every group', () => {
    for (const group of GUILD_NAV_GROUPS) {
      expect(GUILD_NAV_ITEMS.some((item) => item.group === group.id)).toBe(true);
    }
  });

  it('keeps each group contiguous and in group order', () => {
    const order = GUILD_NAV_ITEMS.map((item) => item.group);
    const seen = order.filter((group, index) => group !== order[index - 1]);
    expect(seen).toEqual(GUILD_NAV_GROUPS.map((group) => group.id));
  });

  it('has unique slugs and labels', () => {
    const slugs = GUILD_NAV_ITEMS.map((item) => item.slug);
    const labels = GUILD_NAV_ITEMS.map((item) => item.label);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('starts at the overview page, the default landing page', () => {
    expect(GUILD_NAV_ITEMS[0].slug).toBe('overview');
  });
});
