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
  updateShopFields: vi.fn(),
  createGear: vi.fn(),
  updateGear: vi.fn(),
  deleteGear: vi.fn(),
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
      tcgItems: {
        updateShopFields: mocks.updateShopFields,
        createGear: mocks.createGear,
        updateGear: mocks.updateGear,
        deleteGear: mocks.deleteGear,
      },
    }),
}));

const { saveTcgItemShopFields, createTcgGear, updateTcgGear, deleteTcgGear } =
  await import('./actions');

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const entry of Array.isArray(value) ? value : [value]) data.append(name, entry);
  }
  return data;
}

const actor = (): unknown =>
  expect.objectContaining({
    userId: harness.userId,
    source: 'dashboard',
    ipAddress: '203.0.113.7',
  });

describe('owner TCG shop actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
  });

  it('refuses another origin, non-owners and stale passkey checks', async () => {
    harness.headers = new Headers({ origin: 'https://evil.example' });
    expect(await saveTcgItemShopFields('i1', S, form({ shopPrice: '5' }))).toMatchObject({
      status: 'error',
      values: { shopPrice: '5', isShopBuyable: false },
    });

    harness.headers = new Headers({ origin: 'https://dash.example.com' });
    harness.ownerIds = [];
    await expect(createTcgGear(S, form({ code: 'x' }))).rejects.toThrow('NOT_FOUND');

    harness.ownerIds = [harness.userId];
    harness.session = makeSession(harness.userId, new Date(Date.now() - 6 * 60_000));
    expect(await deleteTcgGear(S, form({ itemId: 'i1' }))).toMatchObject({
      status: 'error',
      reason: 'passkey-check-required',
    });
    expect(mocks.updateShopFields).not.toHaveBeenCalled();
    expect(mocks.createGear).not.toHaveBeenCalled();
    expect(mocks.deleteGear).not.toHaveBeenCalled();
  });

  it('saves shop fields of any item, with an unticked box as off', async () => {
    mocks.updateShopFields.mockResolvedValueOnce({ changed: true });
    const state = await saveTcgItemShopFields(
      'i1',
      S,
      form({ shopPrice: '300', maxDailyPurchases: '2' }),
    );
    expect(state).toEqual({
      status: 'saved',
      message: 'Shop settings saved.',
      values: { shopPrice: '300', maxDailyPurchases: '2', isShopBuyable: false },
    });
    expect(mocks.updateShopFields).toHaveBeenCalledWith(
      'i1',
      { shopPrice: '300', maxDailyPurchases: '2', isShopBuyable: false },
      actor(),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/owner/tcg-shop', 'layout');

    mocks.updateShopFields.mockResolvedValueOnce({ changed: false });
    expect(await saveTcgItemShopFields('i1', S, form({ isShopBuyable: 'on' }))).toMatchObject({
      message: 'Nothing changed.',
    });
  });

  it('creates gear with its perks as a list and opens it', async () => {
    mocks.createGear.mockResolvedValue({ id: 'gear-1' });
    await expect(
      createTcgGear(
        S,
        form({
          code: 'iron_sword',
          name: 'Iron Sword',
          battlePerks: ['LIFESTEAL', 'THORNS'],
          isTradeable: 'on',
          unrelated: 'x',
        }),
      ),
    ).rejects.toThrow('REDIRECT /owner/tcg-shop/gear-1');
    expect(mocks.createGear).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'iron_sword',
        name: 'Iron Sword',
        battlePerks: ['LIFESTEAL', 'THORNS'],
        isTradeable: true,
        isShopBuyable: false,
      }),
      actor(),
    );
    expect(mocks.createGear.mock.calls[0]![0]).not.toHaveProperty('unrelated');
  });

  it('clears the perks when none are submitted', async () => {
    mocks.updateGear.mockResolvedValue({ changed: true });
    await updateTcgGear('gear-1', S, form({ name: 'Iron Sword' }));
    expect(mocks.updateGear).toHaveBeenCalledWith(
      'gear-1',
      expect.objectContaining({ name: 'Iron Sword', battlePerks: [] }),
      actor(),
    );
  });

  it('saves gear and says when nothing changed', async () => {
    mocks.updateGear.mockResolvedValueOnce({ changed: true });
    expect(await updateTcgGear('gear-1', S, form({ name: 'A' }))).toMatchObject({
      status: 'saved',
      message: 'Item saved.',
    });
    mocks.updateGear.mockResolvedValueOnce({ changed: false });
    expect(await updateTcgGear('gear-1', S, form({ name: 'A' }))).toMatchObject({
      message: 'Nothing changed.',
    });
  });

  it('turns a duplicate code into a field error', async () => {
    mocks.createGear.mockRejectedValue(
      new GuildConfigValidationError({ code: ['Another item uses this code.'] }, 'TCG item'),
    );
    expect(await createTcgGear(S, form({ code: 'taken' }))).toMatchObject({
      status: 'error',
      fieldErrors: { code: ['Another item uses this code.'] },
    });
  });

  it('deletes gear and returns to the list, or shows why it cannot', async () => {
    await expect(deleteTcgGear(S, form({ itemId: 'gear-1' }))).rejects.toThrow(
      'REDIRECT /owner/tcg-shop',
    );
    expect(mocks.deleteGear).toHaveBeenCalledWith('gear-1', actor());

    mocks.deleteGear.mockRejectedValueOnce(new ValidationError('Players hold this item.'));
    expect(await deleteTcgGear(S, form({ itemId: 'gear-1' }))).toEqual({
      status: 'error',
      message: 'Players hold this item.',
      values: {},
    });
  });
});
