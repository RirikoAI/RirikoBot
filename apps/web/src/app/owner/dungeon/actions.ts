'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { FIRST_CLEAR_ITEM_FIELDS, REPEAT_POOL_FIELDS } from '@ririko/services/dungeon';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { runOwnerAction } from '@/lib/server/owner-action';
import { getWebServices } from '@/lib/server/services';
import { readFormFields } from '@/lib/server/settings-action';

const SEASON_FIELDS = {
  text: [
    'name',
    'description',
    'themeElement',
    'affixSet',
    'scalingModel',
    'startsAt',
    'endsAt',
    'baseHp',
    'baseAttack',
    'baseDefense',
    'baseSpeed',
    'growthRate',
    'linearK',
    'polyAlpha',
    'polyBeta',
    'miniBossMultiplier',
    'majorBossMultiplier',
    'affixStartFloor',
    'enrageStartTurn',
    'enragePerTurn',
    'enrageTrueDamage',
  ],
  flag: ['isActive'],
} as const;

const BOSS_FIELDS = {
  text: [
    'hpMultiplier',
    'attackMultiplier',
    'defenseMultiplier',
    'speedMultiplier',
    'critRatePercent',
    'critDamage',
    'skillName',
    'skillDescription',
    'skillMpCost',
    'skillPower',
    'maxTurns',
    'signatureDropCode',
    'enrageStartTurn',
    'enragePerTurn',
    'enrageTrueDamage',
    'ward1Element',
    'ward1Percent',
    'ward2Element',
    'ward2Percent',
    'ward3Element',
    'ward3Percent',
  ],
} as const;

export async function createDungeonSeason(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const values = readFormFields(formData, {
    ...SEASON_FIELDS,
    text: ['id', ...SEASON_FIELDS.text],
  });
  return runOwnerAction(values, async (actor) => {
    const { dungeonSeasons } = await getWebServices();
    const season = await dungeonSeasons.createSeason(values, actor);
    revalidatePath('/owner/dungeon');
    redirect(`/owner/dungeon/${season.id}`);
  });
}

export async function updateDungeonSeason(
  seasonId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const values = readFormFields(formData, SEASON_FIELDS);
  return runOwnerAction(values, async (actor) => {
    const { dungeonSeasons } = await getWebServices();
    const { changed } = await dungeonSeasons.updateSeason(seasonId, values, actor);
    revalidatePath('/owner/dungeon', 'layout');
    return { status: 'saved', message: changed ? 'Season saved.' : 'Nothing changed.', values };
  });
}

export async function updateDungeonBoss(
  bossId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const values = readFormFields(formData, BOSS_FIELDS);
  return runOwnerAction(values, async (actor) => {
    const { dungeonSeasons } = await getWebServices();
    const { changed } = await dungeonSeasons.updateBoss(bossId, values, actor);
    revalidatePath('/owner/dungeon', 'layout');
    return { status: 'saved', message: changed ? 'Boss saved.' : 'Nothing changed.', values };
  });
}

const LOOT_FIELDS = {
  text: [
    'firstCredits',
    'firstExp',
    'firstDust',
    'repeatCredits',
    'repeatExp',
    'repeatDust',
    'repeatDropChancePercent',
    ...FIRST_CLEAR_ITEM_FIELDS.flat(),
    ...REPEAT_POOL_FIELDS.flat(),
  ],
};

export async function updateDungeonFloorLoot(
  seasonId: string,
  floorNumber: number,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const values = readFormFields(formData, LOOT_FIELDS);
  return runOwnerAction(values, async (actor) => {
    const { dungeonSeasons } = await getWebServices();
    const { changed } = await dungeonSeasons.updateFloorLoot(seasonId, floorNumber, values, actor);
    revalidatePath('/owner/dungeon', 'layout');
    return { status: 'saved', message: changed ? 'Loot saved.' : 'Nothing changed.', values };
  });
}
