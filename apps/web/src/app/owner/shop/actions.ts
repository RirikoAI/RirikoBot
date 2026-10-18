'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { runOwnerAction } from '@/lib/server/owner-action';
import { getWebServices } from '@/lib/server/services';
import { readFormFields } from '@/lib/server/settings-action';

const ITEM_FIELDS = {
  text: [
    'code',
    'name',
    'description',
    'price',
    'rarity',
    'categoryId',
    'iconUrl',
    'dailyPurchaseLimit',
    'itemType',
    'energyRestored',
    'dailyUsageCeiling',
    'xpAwarded',
    'creditsAwarded',
  ],
  flag: ['isPurchasable'],
} as const;

const CATEGORY_FIELDS = { text: ['code', 'name', 'description'] } as const;

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export async function createShopItem(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const values = readFormFields(formData, ITEM_FIELDS);
  return runOwnerAction(values, async (actor) => {
    const { itemCatalog } = await getWebServices();
    const item = await itemCatalog.createItem(values, actor);
    revalidatePath('/owner/shop');
    redirect(`/owner/shop/${item.id}`);
  });
}

export async function updateShopItem(
  itemId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const values = readFormFields(formData, ITEM_FIELDS);
  return runOwnerAction(values, async (actor) => {
    const { itemCatalog } = await getWebServices();
    const { changed } = await itemCatalog.updateItem(itemId, values, actor);
    revalidatePath('/owner/shop', 'layout');
    return { status: 'saved', message: changed ? 'Item saved.' : 'Nothing changed.', values };
  });
}

/** Retires an item (`purchasable=false`) or puts it back on sale. */
export async function setShopItemPurchasable(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const itemId = formString(formData, 'itemId');
  const purchasable = formString(formData, 'purchasable') === 'true';
  return runOwnerAction({}, async (actor) => {
    const { itemCatalog } = await getWebServices();
    await itemCatalog.setPurchasable(itemId, purchasable, actor);
    revalidatePath('/owner/shop', 'layout');
    return {
      status: 'saved',
      message: purchasable ? 'Back on sale.' : 'Retired.',
      values: {},
    };
  });
}

export async function deleteShopItem(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const itemId = formString(formData, 'itemId');
  return runOwnerAction({}, async (actor) => {
    const { itemCatalog } = await getWebServices();
    await itemCatalog.deleteItem(itemId, actor);
    revalidatePath('/owner/shop', 'layout');
    redirect('/owner/shop');
  });
}

export async function createShopCategory(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const values = readFormFields(formData, CATEGORY_FIELDS);
  return runOwnerAction(values, async (actor) => {
    const { itemCatalog } = await getWebServices();
    await itemCatalog.createCategory(values, actor);
    revalidatePath('/owner/shop', 'layout');
    return { status: 'saved', message: 'Category added.', values: {} };
  });
}

export async function updateShopCategory(
  categoryId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const values = readFormFields(formData, CATEGORY_FIELDS);
  return runOwnerAction(values, async (actor) => {
    const { itemCatalog } = await getWebServices();
    const { changed } = await itemCatalog.updateCategory(categoryId, values, actor);
    revalidatePath('/owner/shop', 'layout');
    return { status: 'saved', message: changed ? 'Category saved.' : 'Nothing changed.', values };
  });
}

export async function deleteShopCategory(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const categoryId = formString(formData, 'categoryId');
  return runOwnerAction({}, async (actor) => {
    const { itemCatalog } = await getWebServices();
    await itemCatalog.deleteCategory(categoryId, actor);
    revalidatePath('/owner/shop', 'layout');
    return { status: 'saved', message: 'Category deleted.', values: {} };
  });
}
