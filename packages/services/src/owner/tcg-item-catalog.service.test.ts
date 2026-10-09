import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TRACKED_ACHIEVEMENT_TYPES, ValidationError } from '@ririko/core';
import {
  AchievementRepository,
  AuditLogRepository,
  createDatabaseClient,
  GameItemRepository,
  UserInventoryItemRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import {
  GuildConfigValidationError,
  type GuildConfigActor,
} from '../guild/guild-config.service.js';
import { CANONICAL_ACHIEVEMENTS } from '../waifu-tcg/achievements/seeds.js';
import { syncCanonicalItems } from '../waifu-tcg/equipment/catalog.js';
import { TcgAchievementAdminService } from './tcg-achievement-admin.service.js';
import { TcgItemCatalogService } from './tcg-item-catalog.service.js';

const owner: GuildConfigActor = { userId: 'owner-1', source: 'dashboard' };

const gear = {
  code: ' moon_blade',
  name: 'Moon Blade',
  description: 'A blade that drinks moonlight.',
  subtype: 'WEAPON',
  rarity: 'RARE',
  battlePerks: ['SHARPENED_EDGE', 'SHARPENED_EDGE'],
  isTradeable: true,
  isShopBuyable: true,
  shopPrice: '1500',
  maxDailyPurchases: '2',
  attack: '120',
  defense: '',
  health: '',
  speed: '',
  manaShield: '',
  manaMax: '',
  critRate: '0.05',
  critDamage: '',
  mitigation: '',
  elementalMastery: '',
  armorPiercing: '',
  elementalResistance: '',
  manaRegen: '',
};

describe('Owner TCG catalog and achievements (TASK-1125)', () => {
  let db: SqliteDatabaseClient;
  let items: GameItemRepository;
  let inventories: UserInventoryItemRepository;
  let achievements: AchievementRepository;
  let catalog: TcgItemCatalogService;
  let achievementAdmin: TcgAchievementAdminService;

  const audit = () =>
    db.raw.prepare('SELECT guild_id, action, details FROM audit_logs ORDER BY rowid').all() as {
      guild_id: string | null;
      action: string;
      details: string;
    }[];

  const fieldErrors = async (promise: Promise<unknown>) => {
    const error = await promise.catch((err: unknown) => err);
    expect(error).toBeInstanceOf(GuildConfigValidationError);
    return (error as GuildConfigValidationError).fieldErrors;
  };

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    items = new GameItemRepository(db);
    inventories = new UserInventoryItemRepository(db);
    achievements = new AchievementRepository(db);
    const auditRepo = new AuditLogRepository(db);
    catalog = new TcgItemCatalogService({ db, items, inventories, audit: auditRepo });
    achievementAdmin = new TcgAchievementAdminService({ db, achievements, audit: auditRepo });
    await syncCanonicalItems(items);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('canonical items', () => {
    it('saves shop fields, marks the item overridden and keeps them through a bot restart', async () => {
      const katana = (await items.findByCode('WEAPON_OBSIDIAN_KATANA'))!;
      const { changed, item } = await catalog.updateShopFields(
        katana.id,
        { isShopBuyable: true, shopPrice: '4200', maxDailyPurchases: '1' },
        owner,
      );
      expect(changed).toBe(true);
      expect(item).toMatchObject({ isShopBuyable: true, shopPrice: 4200, ownerOverridden: true });

      await syncCanonicalItems(items);
      expect(await items.findByCode('WEAPON_OBSIDIAN_KATANA')).toMatchObject({
        isShopBuyable: true,
        shopPrice: 4200,
        maxDailyPurchases: 1,
      });

      const [entry] = audit();
      expect(entry?.guild_id).toBeNull();
      expect(entry?.action).toBe('owner.tcg_item.shop');
      expect(JSON.parse(entry!.details)).toMatchObject({
        source: 'dashboard',
        code: 'WEAPON_OBSIDIAN_KATANA',
        changes: expect.arrayContaining([
          { field: 'shopPrice', before: 1000, after: 4200 },
          { field: 'isShopBuyable', before: false, after: true },
        ]),
      });
    });

    it('writes nothing when the shop fields did not change', async () => {
      const blade = (await items.findByCode('WEAPON_NOVICE_BLADE'))!;
      const result = await catalog.updateShopFields(
        blade.id,
        { isShopBuyable: true, shopPrice: '100', maxDailyPurchases: '5' },
        owner,
      );
      expect(result.changed).toBe(false);
      expect(result.item.ownerOverridden).toBe(false);
      expect(audit()).toHaveLength(0);
    });

    it('rejects invalid shop values with field errors', async () => {
      const blade = (await items.findByCode('WEAPON_NOVICE_BLADE'))!;
      const errors = await fieldErrors(
        catalog.updateShopFields(
          blade.id,
          { isShopBuyable: true, shopPrice: '-1', maxDailyPurchases: 'x' },
          owner,
        ),
      );
      expect(Object.keys(errors).sort()).toEqual(['maxDailyPurchases', 'shopPrice']);
    });

    it('refuses full edits and deletes of built-in items', async () => {
      const blade = (await items.findByCode('WEAPON_NOVICE_BLADE'))!;
      await expect(catalog.updateGear(blade.id, gear, owner)).rejects.toBeInstanceOf(
        ValidationError,
      );
      await expect(catalog.deleteGear(blade.id, owner)).rejects.toThrow(/come back/);
    });
  });

  describe('custom gear', () => {
    it('creates a piece with a prefixed code, derived type and only the stats it has', async () => {
      const item = await catalog.createGear(gear, owner);
      expect(item).toMatchObject({
        code: 'CUSTOM_MOON_BLADE',
        type: 'EQUIPMENT',
        subtype: 'WEAPON',
        baseStats: { attack: 120, critRate: 0.05 },
        battlePerks: ['SHARPENED_EDGE'],
        shopPrice: 1500,
      });
      const views = await catalog.listItems();
      expect(views.find((v) => v.item.id === item.id)).toMatchObject({
        canonical: false,
        holders: 0,
      });
      expect(audit().map((e) => e.action)).toEqual(['owner.tcg_item.create']);

      const ring = await catalog.createGear({ ...gear, code: 'ring', subtype: 'RING' }, owner);
      expect(ring.type).toBe('ACCESSORY');
    });

    it('rejects duplicate codes, unknown perks and a piece without stats', async () => {
      await catalog.createGear(gear, owner);
      expect(await fieldErrors(catalog.createGear(gear, owner))).toHaveProperty('code');
      expect(
        await fieldErrors(
          catalog.createGear({ ...gear, code: 'x2', battlePerks: ['GOD_MODE'] }, owner),
        ),
      ).toHaveProperty('battlePerks');
      const noStats = await fieldErrors(
        catalog.createGear({ ...gear, code: 'x4', attack: '', critRate: '0' }, owner),
      );
      expect(noStats['attack']).toEqual(['Give the piece at least one stat.']);
      expect(
        await fieldErrors(catalog.createGear({ ...gear, code: 'x3', critRate: '1.5' }, owner)),
      ).toHaveProperty('critRate');
    });

    it('updates every field but the code, and reports no change on a re-save', async () => {
      const created = await catalog.createGear(gear, owner);
      const { item, changed } = await catalog.updateGear(
        created.id,
        { ...gear, code: 'renamed', name: 'Moon Blade+', attack: '150' },
        owner,
      );
      expect(changed).toBe(true);
      expect(item).toMatchObject({ code: 'CUSTOM_MOON_BLADE', name: 'Moon Blade+' });
      expect(item.baseStats).toEqual({ attack: 150, critRate: 0.05 });

      const again = await catalog.updateGear(
        created.id,
        { ...gear, name: 'Moon Blade+', attack: '150' },
        owner,
      );
      expect(again.changed).toBe(false);
    });

    it('deletes only an off-sale piece nobody holds', async () => {
      const created = await catalog.createGear(gear, owner);
      await expect(catalog.deleteGear(created.id, owner)).rejects.toThrow(/off sale first/);

      await catalog.updateGear(created.id, { ...gear, isShopBuyable: false }, owner);
      await inventories.create({ userId: 'u1', itemId: created.id, quantity: 1 });
      await inventories.create({ userId: 'u1', itemId: created.id, quantity: 1 });
      expect((await catalog.getItem(created.id))?.holders).toBe(1);
      await expect(catalog.deleteGear(created.id, owner)).rejects.toThrow(/1 player holds/);

      const other = await catalog.createGear(
        { ...gear, code: 'spare', isShopBuyable: false },
        owner,
      );
      await catalog.deleteGear(other.id, owner);
      expect(await items.findById(other.id)).toBeNull();
      expect(audit().at(-1)?.action).toBe('owner.tcg_item.delete');
    });

    it('refuses to act on a missing item', async () => {
      await expect(catalog.deleteGear('missing', owner)).rejects.toThrow(/no longer exists/);
      expect(await catalog.getItem('missing')).toBeNull();
    });
  });

  describe('achievements', () => {
    const edit = {
      title: 'Tutorial Hero',
      description: 'Finish the tutorial.',
      tier: 'SILVER',
      rewardXp: '750',
      rewardCredits: '2500',
      rewardTitle: '',
      badgeIcon: '🎓',
      isHidden: false,
    };

    beforeEach(async () => {
      await achievements.bulkCreateAchievements(CANONICAL_ACHIEVEMENTS);
    });

    it('lists every achievement and flags the ones the bot tracks', async () => {
      const list = await achievementAdmin.list();
      expect(list).toHaveLength(CANONICAL_ACHIEVEMENTS.length);
      expect(list.filter((v) => v.tracked)).toHaveLength(CANONICAL_ACHIEVEMENTS.length);
      expect([...new Set(CANONICAL_ACHIEVEMENTS.map((a) => a.requirementType))].sort()).toEqual(
        [...TRACKED_ACHIEVEMENT_TYPES].sort(),
      );
    });

    it('edits wording and rewards, keeps the requirement and survives the seed', async () => {
      const tutorial = (await achievements.findByCode('TUTORIAL_COMPLETE'))!;
      const { achievement, changed } = await achievementAdmin.update(tutorial.id, edit, owner);
      expect(changed).toBe(true);
      expect(achievement).toMatchObject({
        title: 'Tutorial Hero',
        tier: 'SILVER',
        rewardCredits: 2500,
        rewardTitle: null,
        requirementType: 'TUTORIAL_CLEARED',
        requirementTarget: tutorial.requirementTarget,
      });

      await achievements.bulkCreateAchievements(CANONICAL_ACHIEVEMENTS);
      expect((await achievementAdmin.get(tutorial.id))?.achievement.title).toBe('Tutorial Hero');
      expect(audit().map((e) => e.action)).toEqual(['owner.achievement.update']);

      expect((await achievementAdmin.update(tutorial.id, edit, owner)).changed).toBe(false);
    });

    it('rejects invalid values and unknown achievements', async () => {
      const tutorial = (await achievements.findByCode('TUTORIAL_COMPLETE'))!;
      const errors = await fieldErrors(
        achievementAdmin.update(tutorial.id, { ...edit, tier: 'DIAMOND', rewardXp: '-5' }, owner),
      );
      expect(Object.keys(errors).sort()).toEqual(['rewardXp', 'tier']);
      await expect(achievementAdmin.update('nope', edit, owner)).rejects.toThrow(/no longer/);
    });

    it('counts unlocks and claims among the guild members only, hiding hidden ones', async () => {
      const tutorial = (await achievements.findByCode('TUTORIAL_COMPLETE'))!;
      const now = Date.now();
      const member = db.raw.prepare(
        'INSERT INTO xp_accounts (user_id, guild_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
      );
      member.run('a', 'g1', now, now);
      member.run('b', 'g1', now, now);
      member.run('c', 'g2', now, now);
      await achievements.updateProgress('a', tutorial.id, 4, true);
      const b = await achievements.updateProgress('b', tutorial.id, 4, true);
      await achievements.claimReward(b.id);
      await achievements.updateProgress('c', tutorial.id, 4, true);

      const completion = await achievementAdmin.guildCompletion('g1');
      expect(completion.members).toBe(2);
      expect(completion.achievements.find((a) => a.achievement.id === tutorial.id)).toMatchObject({
        unlocked: 2,
        claimed: 1,
        tracked: true,
      });
      expect(
        completion.achievements.find((a) => a.achievement.code === 'COLL_INITIATE'),
      ).toMatchObject({ unlocked: 0, claimed: 0 });

      await achievementAdmin.update(tutorial.id, { ...edit, isHidden: true }, owner);
      const hidden = await achievementAdmin.guildCompletion('g1');
      expect(hidden.achievements.some((a) => a.achievement.id === tutorial.id)).toBe(false);
    });
  });
});
