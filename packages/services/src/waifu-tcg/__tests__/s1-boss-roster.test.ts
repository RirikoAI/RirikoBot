import { describe, it, expect } from 'vitest';
import { resolveWorkspacePath } from '@ririko/core';
import { loadBossCatalog, planSeasonFloors } from '../dungeon/boss-catalog.js';
import { ElementalWard } from '../dungeon/elemental-ward.js';

describe('Season 1 Infernal Crucible roster (STORY-154)', () => {
  const catalog = loadBossCatalog(
    resolveWorkspacePath('assets/tcg/catalog/bosses/s1_infernal_crucible.json'),
  );
  const plan = planSeasonFloors(catalog);

  it('covers all 50 floors with unique mini/major bosses', () => {
    expect(catalog.seasonId).toBe('s1_infernal_crucible');
    expect(plan).toHaveLength(50);

    const bossFloors = plan.filter((f) => f.tier !== 'STANDARD');
    expect(bossFloors.map((f) => f.floorNumber)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
    expect(new Set(bossFloors.map((f) => f.bossKey)).size).toBe(10);
  });

  it('keeps standard floors fresh: no back-to-back repeats, new faces after F20', () => {
    const standard = plan.filter((f) => f.tier === 'STANDARD');
    for (let i = 1; i < standard.length; i++) {
      expect(standard[i]!.bossKey).not.toBe(standard[i - 1]!.bossKey);
    }

    const early = new Set(standard.filter((f) => f.floorNumber < 20).map((f) => f.bossKey));
    const late = new Set(standard.filter((f) => f.floorNumber > 20).map((f) => f.bossKey));
    expect([...early].filter((k) => late.has(k))).toEqual([]);

    const appearances = new Map<string, number>();
    for (const f of standard) appearances.set(f.bossKey, (appearances.get(f.bossKey) ?? 0) + 1);
    expect(Math.max(...appearances.values())).toBeLessThanOrEqual(3);
    expect(new Set(catalog.bosses.map((b) => b.key))).toEqual(new Set(plan.map((f) => f.bossKey)));
  });

  it('gives every boss a title, flavor text, element theme and a named skill', () => {
    for (const boss of catalog.bosses) {
      expect(boss.title, boss.key).toBeTruthy();
      expect(boss.flavorText, boss.key).toBeTruthy();
      expect(['FIRE', 'EARTH'], boss.key).toContain(boss.element);
      expect(boss.definition?.skill?.name, boss.key).toBeTruthy();
    }
    const skills = catalog.bosses.map((b) => b.definition?.skill?.name);
    expect(new Set(skills).size).toBe(skills.length);
  });
});

describe('Elemental ward off-element chip', () => {
  it('lets off-element strikes chip seasonal wards but not tutorial wards', () => {
    const seasonal = new ElementalWard([{ element: 'WATER', health: 100 }], {
      offElementChip: 0.25,
    });
    const hit = seasonal.processAttack('FIRE', 200);
    expect(seasonal.getCurrentLayer()?.currentHealth).toBe(50);
    expect(hit.message).toContain('chipped');

    const strict = new ElementalWard([{ element: 'WATER', health: 100 }]);
    expect(strict.processAttack('FIRE', 200).damagePassedToBoss).toBe(0);
    expect(strict.getCurrentLayer()?.currentHealth).toBe(100);

    const broken = strict.processAttack('WATER', 130);
    expect(broken).toMatchObject({ allWardsBroken: true, damagePassedToBoss: 30 });
  });
});
