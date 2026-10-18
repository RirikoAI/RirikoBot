import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@ririko/core';
import { GuildConfigValidationError } from '@ririko/services/guild';
import { INITIAL_SETTINGS_FORM_STATE as S } from '@/lib/settings-form-state';
import {
  baseServices,
  harness,
  makeSession,
  resetHarness,
  revalidatePath,
} from '../../../../../../tests/support/web-action-harness';

const mocks = vi.hoisted(() => ({
  createItem: vi.fn(),
  updateItem: vi.fn(),
  setPurchasable: vi.fn(),
  deleteItem: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

vi.mock(
  'next/headers',
  async () => (await import('../../../../../../tests/support/web-action-harness')).nextHeadersMock,
);
vi.mock(
  'next/navigation',
  async () =>
    (await import('../../../../../../tests/support/web-action-harness')).nextNavigationMock,
);
vi.mock(
  'next/cache',
  async () => (await import('../../../../../../tests/support/web-action-harness')).nextCacheMock,
);
vi.mock('@/lib/server/services', () => ({
  getWebServices: async () =>
    baseServices({
      itemCatalog: {
        createItem: mocks.createItem,
        updateItem: mocks.updateItem,
        setPurchasable: mocks.setPurchasable,
        deleteItem: mocks.deleteItem,
        createCategory: mocks.createCategory,
        updateCategory: mocks.updateCategory,
        deleteCategory: mocks.deleteCategory,
      },
    }),
}));

const {
  createShopItem,
  updateShopItem,
  setShopItemPurchasable,
  deleteShopItem,
  createShopCategory,
  updateShopCategory,
  deleteShopCategory,
} = await import('./actions');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const actor = (): unknown =>
  expect.objectContaining({
    userId: harness.userId,
    source: 'dashboard',
    ipAddress: '203.0.113.7',
  });

describe('owner shop actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
  });

  describe('guards', () => {
    it('refuses another origin with the values kept', async () => {
      harness.headers = new Headers({ origin: 'https://evil.example' });
      const state = await updateShopItem('i1', S, form({ name: 'Gem' }));
      expect(state).toMatchObject({
        status: 'error',
        values: { name: 'Gem', isPurchasable: false },
      });
      expect(mocks.updateItem).not.toHaveBeenCalled();
    });

    it('answers 404 to users who are not bot owners', async () => {
      harness.ownerIds = [];
      await expect(createShopCategory(S, form({ code: 'c' }))).rejects.toThrow('NOT_FOUND');
      await expect(deleteShopItem(S, form({ itemId: 'i1' }))).rejects.toThrow('NOT_FOUND');
      expect(mocks.createCategory).not.toHaveBeenCalled();
      expect(mocks.deleteItem).not.toHaveBeenCalled();
    });

    it('asks for a passkey check when the last one is older than five minutes', async () => {
      harness.session = makeSession(harness.userId, new Date(Date.now() - 6 * 60_000));
      const state = await setShopItemPurchasable(S, form({ itemId: 'i1', purchasable: 'true' }));
      expect(state).toMatchObject({ status: 'error', reason: 'passkey-check-required' });
      expect(mocks.setPurchasable).not.toHaveBeenCalled();
    });

    it('tells owners without a passkey to add one', async () => {
      harness.passkeyCount = 0;
      harness.session = makeSession(harness.userId, null);
      const state = await deleteShopCategory(S, form({ categoryId: 'c1' }));
      expect(state).toMatchObject({ status: 'error', reason: 'passkey-required' });
      expect(mocks.deleteCategory).not.toHaveBeenCalled();
    });
  });

  describe('items', () => {
    it('creates an item from the form (ticked boxes only) and opens it', async () => {
      mocks.createItem.mockResolvedValue({ id: 'item-9' });
      await expect(
        createShopItem(
          S,
          form({ code: 'gem', name: 'Gem', price: '50', isPurchasable: 'on', other: 'x' }),
        ),
      ).rejects.toThrow('REDIRECT /owner/shop/item-9');
      expect(mocks.createItem).toHaveBeenCalledWith(
        { code: 'gem', name: 'Gem', price: '50', isPurchasable: true },
        actor(),
      );
      expect(revalidatePath).toHaveBeenCalledWith('/owner/shop');
    });

    it('saves an item and says when nothing changed', async () => {
      mocks.updateItem.mockResolvedValueOnce({ changed: true });
      const saved = await updateShopItem('i1', S, form({ price: '75' }));
      expect(saved).toEqual({
        status: 'saved',
        message: 'Item saved.',
        values: { price: '75', isPurchasable: false },
      });
      expect(mocks.updateItem).toHaveBeenCalledWith(
        'i1',
        { price: '75', isPurchasable: false },
        actor(),
      );
      expect(revalidatePath).toHaveBeenCalledWith('/owner/shop', 'layout');

      mocks.updateItem.mockResolvedValueOnce({ changed: false });
      expect(await updateShopItem('i1', S, form({ price: '75' }))).toMatchObject({
        message: 'Nothing changed.',
      });
    });

    it('turns schema errors into field errors', async () => {
      mocks.updateItem.mockRejectedValue(
        new GuildConfigValidationError(
          { price: ['Enter a whole number from 1 to 1000000.'] },
          'item',
        ),
      );
      expect(await updateShopItem('i1', S, form({ price: '-1' }))).toEqual({
        status: 'error',
        message: 'Please fix the highlighted fields.',
        fieldErrors: { price: ['Enter a whole number from 1 to 1000000.'] },
        values: { price: '-1', isPurchasable: false },
      });
    });

    it('retires an item and puts it back on sale', async () => {
      expect(await setShopItemPurchasable(S, form({ itemId: 'i1', purchasable: 'false' }))).toEqual(
        { status: 'saved', message: 'Retired.', values: {} },
      );
      expect(mocks.setPurchasable).toHaveBeenLastCalledWith('i1', false, actor());
      expect(
        await setShopItemPurchasable(S, form({ itemId: 'i1', purchasable: 'true' })),
      ).toMatchObject({ message: 'Back on sale.' });
      expect(mocks.setPurchasable).toHaveBeenLastCalledWith('i1', true, actor());
    });

    it('deletes an item and returns to the list, or shows why it cannot', async () => {
      await expect(deleteShopItem(S, form({ itemId: 'i1' }))).rejects.toThrow(
        'REDIRECT /owner/shop',
      );
      expect(mocks.deleteItem).toHaveBeenCalledWith('i1', actor());

      mocks.deleteItem.mockRejectedValueOnce(new ValidationError('3 members hold this item.'));
      expect(await deleteShopItem(S, form({ itemId: 'i1' }))).toEqual({
        status: 'error',
        message: '3 members hold this item.',
        values: {},
      });
    });

    it('lets unexpected failures through', async () => {
      mocks.deleteItem.mockRejectedValueOnce(new Error('database is down'));
      await expect(deleteShopItem(S, form({ itemId: 'i1' }))).rejects.toThrow('database is down');
    });
  });

  describe('categories', () => {
    it('adds a category and clears the form', async () => {
      expect(
        await createShopCategory(S, form({ code: 'potions', name: 'Potions', junk: 'x' })),
      ).toEqual({ status: 'saved', message: 'Category added.', values: {} });
      expect(mocks.createCategory).toHaveBeenCalledWith(
        { code: 'potions', name: 'Potions' },
        actor(),
      );
    });

    it('saves a category and says when nothing changed', async () => {
      mocks.updateCategory.mockResolvedValueOnce({ changed: true });
      expect(await updateShopCategory('c1', S, form({ name: 'Elixirs' }))).toMatchObject({
        message: 'Category saved.',
        values: { name: 'Elixirs' },
      });
      expect(mocks.updateCategory).toHaveBeenCalledWith('c1', { name: 'Elixirs' }, actor());
      mocks.updateCategory.mockResolvedValueOnce({ changed: false });
      expect(await updateShopCategory('c1', S, form({ name: 'Elixirs' }))).toMatchObject({
        message: 'Nothing changed.',
      });
    });

    it('deletes a category', async () => {
      expect(await deleteShopCategory(S, form({ categoryId: 'c1' }))).toEqual({
        status: 'saved',
        message: 'Category deleted.',
        values: {},
      });
      expect(mocks.deleteCategory).toHaveBeenCalledWith('c1', actor());
    });
  });
});
