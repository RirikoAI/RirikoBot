import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '@ririko/core';
import {
  AuditLogRepository,
  createDatabaseClient,
  DungeonBossRepository,
  DungeonFloorRepository,
  DungeonSeasonRepository,
  GameItemRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import {
  GuildConfigValidationError,
  type GuildConfigActor,
} from '../guild/guild-config.service.js';
import { syncCanonicalItems } from '../waifu-tcg/equipment/catalog.js';
import { newSeasonFormValues, seasonFormValues } from '../waifu-tcg/dungeon/dungeon-admin-input.js';
import { DungeonSeasonAdminService } from './dungeon-season-admin.service.js';

const owner: GuildConfigActor = {
  userId: 'owner-1',
  source: 'dashboard',
  ipAddress: '203.0.113.7',
  userAgent: 'vitest',
};

const DAY = 86_400_000;

/** Form fields the way the editor posts them: every value a string. */
function asForm(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === 'boolean' ? value : value === null ? '' : String(value),
    ]),
  );
}

describe('DungeonSeasonAdminService (TASK-1122)', () => {
  let db: SqliteDatabaseClient;
  let seasons: DungeonSeasonRepository;
  let bosses: DungeonBossRepository;
  let floors: DungeonFloorRepository;
  let service: DungeonSeasonAdminService;
  const now = new Date('2026-09-28T12:00:00Z');

  const auditRows = () =>
    db.raw.prepare('SELECT guild_id, actor_user_id, action, details FROM audit_logs').all() as {
      guild_id: string | null;
      actor_user_id: string;
      action: string;
      details: string;
    }[];

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    seasons = new DungeonSeasonRepository(db);
    bosses = new DungeonBossRepository(db);
    floors = new DungeonFloorRepository(db);
    const items = new GameItemRepository(db);
    await syncCanonicalItems(items);
    service = new DungeonSeasonAdminService({
      db,
      seasons,
      floors,
      bosses,
      items,
      audit: new AuditLogRepository(db),
      now: () => now,
    });

    await seasons.create({
      id: 's1',
      name: 'Season 1',
      description: 'Fire tower',
      themeElement: 'FIRE',
      seasonalAffixes: ['SCORCHED_EARTH', 'HEAT_HAZE'],
      scalingModel: 'EXPONENTIAL',
      scalingParams: {
        growthRate: 0.058,
        baseStats: { speed: 22, hp: 950, attack: 90, defense: 50 },
      },
      isActive: true,
      startsAt: new Date(now.getTime() - 10 * DAY),
      endsAt: new Date(now.getTime() + 80 * DAY),
    });
    await seasons.create({
      id: 'season_tutorial',
      name: 'Tutorial',
      description: 'Training',
      themeElement: 'NEUTRAL',
      scalingModel: 'LINEAR',
      isTutorial: true,
      startsAt: new Date(now.getTime() - DAY),
      endsAt: new Date(now.getTime() + 3650 * DAY),
    });
    await bosses.upsert({
      id: 's1:megumin',
      seasonId: 's1',
      key: 'megumin',
      name: 'Megumin',
      animeTitle: 'KonoSuba',
      element: 'FIRE',
      tier: 'MAJOR_BOSS',
      definition: { stats: { hp: 99999 }, enrage: { startTurn: 8 } },
      signatureDropCode: null,
    });
    await floors.upsertBySeasonAndFloor({
      seasonId: 's1',
      floorNumber: 10,
      name: 'F10',
      enemyLineup: [{ bossId: 's1:megumin' }],
      isBossFloor: true,
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('lists seasons with their status and counts', async () => {
    await seasons.create({
      id: 's2',
      name: 'Season 2',
      description: 'Queued',
      scalingModel: 'LINEAR',
      startsAt: new Date(now.getTime() + 20 * DAY),
      endsAt: new Date(now.getTime() + 110 * DAY),
    });
    const list = await service.listSeasons();
    const byId = Object.fromEntries(list.map((s) => [s.season.id, s]));
    expect(byId['s1']).toMatchObject({ status: 'live', floors: 1, bosses: 1 });
    expect(byId['s2']?.status).toBe('scheduled');
    expect(byId['season_tutorial']?.status).toBe('tutorial');

    const detail = await service.getSeason('s1');
    expect(detail?.bossRows.map((b) => b.id)).toEqual(['s1:megumin']);
    expect(await service.getSeason('missing')).toBeNull();
  });

  it('creates a season with an affix set, curve and audit entry', async () => {
    const season = await service.createSeason(
      asForm({
        ...newSeasonFormValues(now),
        id: 'S3_Abyss',
        name: 'Season 3',
        description: 'Deep water',
        themeElement: 'WATER',
        affixSet: 'ABYSSAL_MAELSTROM',
        scalingModel: 'LINEAR',
        linearK: '0.2',
        enrageTrueDamage: 'no',
      }),
      owner,
    );
    expect(season).toMatchObject({
      id: 's3_abyss',
      isTutorial: false,
      seasonalAffixes: ['TORRENTIAL_DELUGE', 'TIDAL_BARRIER'],
      scalingParams: { linearK: 0.2, enrage: { trueDamage: false } },
    });
    expect(season.startsAt.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    const [row] = auditRows();
    expect(row).toMatchObject({
      guild_id: null,
      actor_user_id: 'owner-1',
      action: 'owner.dungeon_season.create',
    });
    expect(JSON.parse(row!.details)).toMatchObject({ source: 'dashboard', seasonId: 's3_abyss' });

    await expect(
      service.createSeason(
        asForm({ ...newSeasonFormValues(now), id: 's1', name: 'x', description: 'y' }),
        owner,
      ),
    ).rejects.toMatchObject({ fieldErrors: { id: ['Another season uses this ID.'] } });
  });

  it('rejects invalid dates and half-set base stats', async () => {
    const values = asForm({
      ...seasonFormValues((await seasons.findById('s1'))!),
      endsAt: '2026-01-01',
      baseHp: '',
    });
    const error = await service.updateSeason('s1', values, owner).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GuildConfigValidationError);
    const { fieldErrors } = error as GuildConfigValidationError;
    expect(fieldErrors['endsAt']).toEqual(['End after the start date.']);
    expect(fieldErrors['baseHp']).toEqual(['Set all four base stats, or leave all four empty.']);
    expect(auditRows()).toHaveLength(0);
  });

  it('writes nothing when the stored season is saved unchanged', async () => {
    const values = asForm(seasonFormValues((await seasons.findById('s1'))!));
    // The stored start is not midnight; the editor works in days, so align it first.
    await seasons.update('s1', {
      startsAt: new Date('2026-09-18T00:00:00Z'),
      endsAt: new Date('2026-12-17T00:00:00Z'),
    });
    const { changed } = await service.updateSeason(
      's1',
      asForm(seasonFormValues((await seasons.findById('s1'))!)),
      owner,
    );
    expect(changed).toBe(false);
    expect(auditRows()).toHaveLength(0);

    const saved = await service.updateSeason('s1', { ...values, growthRate: '0.07' }, owner);
    expect(saved.changed).toBe(true);
    expect(saved.season.scalingParams).toMatchObject({ growthRate: 0.07 });
    const details = JSON.parse(auditRows()[0]!.details) as { changes: { field: string }[] };
    expect(details.changes.map((c) => c.field)).toContain('scalingParams');
  });

  it('refuses to edit the tutorial season or its bosses', async () => {
    const values = asForm(newSeasonFormValues(now));
    await expect(
      service.updateSeason('season_tutorial', { ...values, name: 'x', description: 'y' }, owner),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.updateSeason('missing', { ...values, name: 'x', description: 'y' }, owner),
    ).rejects.toThrow('This season no longer exists.');
  });

  it('saves boss combat settings and keeps fields the editor does not show', async () => {
    const { boss, changed } = await service.updateBoss(
      's1:megumin',
      {
        hpMultiplier: '1.2',
        critRatePercent: '25',
        skillName: 'Explosion',
        skillMpCost: '80',
        skillPower: '3',
        enrageStartTurn: '6',
        enragePerTurn: '0.5',
        ward1Element: 'WATER',
        ward1Percent: '40',
        maxTurns: '20',
        signatureDropCode: 'weapon_obsidian_katana',
      },
      owner,
    );
    expect(changed).toBe(true);
    expect(boss.signatureDropCode).toBe('WEAPON_OBSIDIAN_KATANA');
    expect(boss.definition).toEqual({
      stats: { hp: 99999 },
      statMultipliers: { hp: 1.2 },
      critRate: 0.25,
      skill: { name: 'Explosion', mpCost: 80, powerMult: 3 },
      enrage: { startTurn: 6, perTurn: 0.5 },
      wardLayers: [{ element: 'WATER', hpPercent: 0.4 }],
      maxTurns: 20,
    });
    expect(auditRows().map((r) => r.action)).toEqual(['owner.dungeon_boss.update']);

    const again = await service.updateBoss(
      's1:megumin',
      {
        hpMultiplier: '1.2',
        critRatePercent: '25',
        skillName: 'Explosion',
        skillMpCost: '80',
        skillPower: '3',
        enrageStartTurn: '6',
        enragePerTurn: '0.5',
        ward1Element: 'WATER',
        ward1Percent: '40',
        maxTurns: '20',
        signatureDropCode: 'WEAPON_OBSIDIAN_KATANA',
      },
      owner,
    );
    expect(again.changed).toBe(false);
  });

  it('rejects unknown drop codes, half-set wards and skills', async () => {
    const error = await service
      .updateBoss(
        's1:megumin',
        { signatureDropCode: 'NOPE', ward2Element: 'ICE', skillPower: '2' },
        owner,
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GuildConfigValidationError);
    expect((error as GuildConfigValidationError).fieldErrors).toMatchObject({
      ward2Percent: ['Set both the element and the HP share, or neither.'],
      skillName: ['Name the skill.'],
      skillMpCost: ['Set the skill MP cost.'],
    });

    await expect(
      service.updateBoss('s1:megumin', { signatureDropCode: 'NOPE' }, owner),
    ).rejects.toMatchObject({ fieldErrors: { signatureDropCode: ['No TCG item has this code.'] } });
    await expect(service.updateBoss('s1:nobody', {}, owner)).rejects.toThrow(
      'This boss no longer exists.',
    );
    expect(await service.getBoss('s1:megumin')).not.toBeNull();
    const items = await service.listItems();
    expect(items.map((i) => i.code)).toContain('WEAPON_OBSIDIAN_KATANA');
    expect(items.map((i) => i.name)).toEqual(
      [...items.map((i) => i.name)].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('saves floor loot, checks item codes and audits the change (TASK-1126)', async () => {
    const { floor, changed } = await service.updateFloorLoot(
      's1',
      10,
      {
        firstCredits: '5000',
        firstItem1Code: 'potion_minor_hp',
        firstItem1Quantity: '3',
        repeatDropChancePercent: '50',
        pool1Code: 'RING_COPPER_BAND',
        pool1Weight: '10',
      },
      owner,
    );
    expect(changed).toBe(true);
    expect(floor.firstClearRewards).toEqual({
      credits: 5000,
      items: [{ code: 'POTION_MINOR_HP', quantity: 3 }],
    });
    expect(floor.repeatRewardsTable).toEqual({
      dropChance: 0.5,
      pool: [{ code: 'RING_COPPER_BAND', weight: 10, minQty: 1, maxQty: 1 }],
    });
    const [row] = auditRows();
    expect(row?.action).toBe('owner.dungeon_floor.update');
    expect(JSON.parse(row!.details)).toMatchObject({ seasonId: 's1', floorNumber: 10 });
    expect((await service.getFloor('s1', 10))?.id).toBe(floor.id);

    const again = await service.updateFloorLoot(
      's1',
      10,
      {
        firstCredits: '5000',
        firstItem1Code: 'POTION_MINOR_HP',
        firstItem1Quantity: '3',
        repeatDropChancePercent: '50',
        pool1Code: 'RING_COPPER_BAND',
        pool1Weight: '10',
        pool1Min: '1',
        pool1Max: '1',
      },
      owner,
    );
    expect(again.changed).toBe(false);

    const cleared = await service.updateFloorLoot('s1', 10, {}, owner);
    expect(cleared.floor).toMatchObject({ firstClearRewards: {}, repeatRewardsTable: {} });
  });

  it('rejects unknown loot items and missing floors', async () => {
    await expect(
      service.updateFloorLoot('s1', 10, { pool2Code: 'NOPE', pool2Weight: '1' }, owner),
    ).rejects.toMatchObject({ fieldErrors: { pool2Code: ['No TCG item has this code.'] } });
    await expect(service.updateFloorLoot('s1', 11, {}, owner)).rejects.toThrow(
      'This floor no longer exists.',
    );
    await expect(service.updateFloorLoot('season_tutorial', 1, {}, owner)).rejects.toThrow(
      'The tutorial season is fixed and cannot be edited.',
    );
    await expect(
      service.updateFloorLoot('s1', 10, { firstItem1Quantity: '2' }, owner),
    ).rejects.toBeInstanceOf(GuildConfigValidationError);
    expect(auditRows()).toHaveLength(0);
  });
});
