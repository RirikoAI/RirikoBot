'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { TCG_FLAT_GEAR_STATS, TCG_FRACTION_GEAR_STATS } from '@ririko/core';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { runOwnerAction } from '@/lib/server/owner-action';
import { getWebServices } from '@/lib/server/services';
import { readFormFields } from '@/lib/server/settings-action';

const SHOP_FIELDS = {
  text: ['shopPrice', 'maxDailyPurchases'],
  flag: ['isShopBuyable'],
} as const;

const GEAR_FIELDS = {
  text: [
    'code',
    'name',
    'description',
    'subtype',
    'rarity',
    'shopPrice',
    'maxDailyPurchases',
    ...TCG_FLAT_GEAR_STATS,
    ...TCG_FRACTION_GEAR_STATS,
  ],
  list: ['battlePerks'],
  flag: ['isShopBuyable', 'isTradeable'],
} as const;

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** Price, purchase limit and on-sale of any TCG item, kept through bot restarts. */
export async function saveTcgItemShopFields(
  itemId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const values = readFormFields(formData, SHOP_FIELDS);
  return runOwnerAction(values, async (actor) => {
    const { tcgItems } = await getWebServices();
    const { changed } = await tcgItems.updateShopFields(itemId, values, actor);
    revalidatePath('/owner/tcg-shop', 'layout');
    return {
      status: 'saved',
      message: changed ? 'Shop settings saved.' : 'Nothing changed.',
      values,
    };
  });
}

export async function createTcgGear(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const values = readFormFields(formData, GEAR_FIELDS);
  return runOwnerAction(values, async (actor) => {
    const { tcgItems } = await getWebServices();
    const item = await tcgItems.createGear(values, actor);
    revalidatePath('/owner/tcg-shop');
    redirect(`/owner/tcg-shop/${item.id}`);
  });
}

export async function updateTcgGear(
  itemId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const values = readFormFields(formData, GEAR_FIELDS);
  return runOwnerAction(values, async (actor) => {
    const { tcgItems } = await getWebServices();
    const { changed } = await tcgItems.updateGear(itemId, values, actor);
    revalidatePath('/owner/tcg-shop', 'layout');
    return { status: 'saved', message: changed ? 'Item saved.' : 'Nothing changed.', values };
  });
}

export async function deleteTcgGear(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const itemId = formString(formData, 'itemId');
  return runOwnerAction({}, async (actor) => {
    const { tcgItems } = await getWebServices();
    await tcgItems.deleteGear(itemId, actor);
    revalidatePath('/owner/tcg-shop', 'layout');
    redirect('/owner/tcg-shop');
  });
}
