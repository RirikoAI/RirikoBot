import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@ririko/core';
import { GuildConfigValidationError } from '@ririko/services/guild';
import { INITIAL_SETTINGS_FORM_STATE } from '@/lib/settings-form-state';
import type { ActiveSession } from './auth/session-service';

const mocks = vi.hoisted(() => ({
  session: null as ActiveSession | null,
  passkeyCount: 1,
  headers: new Headers({ origin: 'https://dash.example.com', 'user-agent': 'vitest' }),
  update: vi.fn(),
  updateTcgRules: vi.fn(),
  createItem: vi.fn(),
  deleteItem: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'x'.repeat(43) }), set: vi.fn() }),
  headers: async () => mocks.headers,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('./services', () => ({
  getWebServices: async () => ({
    config: { DASHBOARD_URL: 'https://dash.example.com', BOT_OWNER_ID: ['owner-1'] },
    sessions: { resolve: async () => mocks.session },
    passkeys: { count: async () => mocks.passkeyCount },
    economyConfig: { update: mocks.update },
    tcgRules: { update: mocks.updateTcgRules },
    itemCatalog: { createItem: mocks.createItem, deleteItem: mocks.deleteItem },
  }),
}));

const { saveEconomySettings } = await import('@/app/owner/economy/actions');
const { createShopItem, deleteShopItem } = await import('@/app/owner/shop/actions');
const { saveTcgRules } = await import('@/app/owner/tcg/actions');

const session = (userId: string, stepUpAt: Date | null = new Date()): ActiveSession => ({
  id: 'hash',
  userId,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 3_600_000),
  stepUpAt,
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe('owner console actions (TASK-1651, TASK-1652)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.passkeyCount = 1;
    mocks.headers = new Headers({ origin: 'https://dash.example.com', 'user-agent': 'vitest' });
  });

  it('saves for an owner with a recent passkey check, as a dashboard actor', async () => {
    mocks.session = session('owner-1');
    mocks.update.mockResolvedValue({
      values: { dailyBaseReward: 400 },
      changes: [{ field: 'dailyBaseReward', before: 250, after: 400 }],
    });

    const state = await saveEconomySettings(
      INITIAL_SETTINGS_FORM_STATE,
      form({ dailyBaseReward: '400', unrelated: 'x' }),
    );

    expect(state).toEqual({
      status: 'saved',
      message: 'Settings saved.',
      values: { dailyBaseReward: 400 },
    });
    expect(mocks.update).toHaveBeenCalledWith(
      { dailyBaseReward: '400' },
      expect.objectContaining({ userId: 'owner-1', source: 'dashboard', userAgent: 'vitest' }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/owner/economy');
  });

  it('answers 404 to users who are not bot owners', async () => {
    mocks.session = session('user-1');
    await expect(
      saveEconomySettings(INITIAL_SETTINGS_FORM_STATE, form({ dailyBaseReward: '1' })),
    ).rejects.toThrow('NOT_FOUND');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('asks for a passkey check when the last one is older than five minutes', async () => {
    mocks.session = session('owner-1', new Date(Date.now() - 6 * 60_000));
    const state = await saveEconomySettings(
      INITIAL_SETTINGS_FORM_STATE,
      form({ dailyBaseReward: '400' }),
    );
    expect(state).toMatchObject({
      status: 'error',
      reason: 'passkey-check-required',
      values: { dailyBaseReward: '400' },
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('refuses requests from another origin', async () => {
    mocks.session = session('owner-1');
    mocks.headers = new Headers({ origin: 'https://evil.example' });
    const state = await saveEconomySettings(
      INITIAL_SETTINGS_FORM_STATE,
      form({ dailyBaseReward: '400' }),
    );
    expect(state).toMatchObject({ status: 'error' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('turns schema errors into field errors', async () => {
    mocks.session = session('owner-1');
    mocks.update.mockRejectedValue(
      new GuildConfigValidationError(
        { dailyBaseReward: ['Enter a whole number from 0 to 1000000.'] },
        'economy settings',
      ),
    );
    const state = await saveEconomySettings(
      INITIAL_SETTINGS_FORM_STATE,
      form({ dailyBaseReward: '-1' }),
    );
    expect(state).toEqual({
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { dailyBaseReward: ['Enter a whole number from 0 to 1000000.'] },
      values: { dailyBaseReward: '-1' },
    });
  });

  it('shows refusals such as deleting a held item as the form message', async () => {
    mocks.session = session('owner-1');
    mocks.deleteItem.mockRejectedValue(
      new ValidationError('2 members hold this item, so it can only be retired.'),
    );
    const state = await deleteShopItem(INITIAL_SETTINGS_FORM_STATE, form({ itemId: 'item-1' }));
    expect(state).toEqual({
      status: 'error',
      message: '2 members hold this item, so it can only be retired.',
      values: {},
    });
    expect(mocks.deleteItem).toHaveBeenCalledWith(
      'item-1',
      expect.objectContaining({ userId: 'owner-1' }),
    );
  });

  it('opens the new item after creating it', async () => {
    mocks.session = session('owner-1');
    mocks.createItem.mockResolvedValue({ id: 'item-9' });
    await expect(
      createShopItem(INITIAL_SETTINGS_FORM_STATE, form({ code: 'gem', isPurchasable: 'on' })),
    ).rejects.toThrow('REDIRECT /owner/shop/item-9');
    expect(mocks.createItem).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'gem', isPurchasable: true }),
      expect.objectContaining({ userId: 'owner-1', source: 'dashboard' }),
    );
  });

  it('saves global TCG rules for an owner and reports when nothing changed (TASK-1124)', async () => {
    mocks.session = session('owner-1');
    mocks.updateTcgRules.mockResolvedValueOnce({
      values: { marketTaxPercent: 10 },
      changes: [{ field: 'marketTaxPercent', before: 5, after: 10 }],
    });
    const state = await saveTcgRules(
      INITIAL_SETTINGS_FORM_STATE,
      form({ marketTaxPercent: '10', unrelated: 'x' }),
    );
    expect(state).toEqual({
      status: 'saved',
      message: 'Rules saved.',
      values: { marketTaxPercent: 10 },
    });
    expect(mocks.updateTcgRules).toHaveBeenCalledWith(
      { marketTaxPercent: '10' },
      expect.objectContaining({ userId: 'owner-1', source: 'dashboard' }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/owner/tcg');

    mocks.updateTcgRules.mockResolvedValueOnce({ values: { marketTaxPercent: 10 }, changes: [] });
    const unchanged = await saveTcgRules(
      INITIAL_SETTINGS_FORM_STATE,
      form({ marketTaxPercent: '10' }),
    );
    expect(unchanged).toMatchObject({ status: 'saved', message: 'Nothing changed.' });
  });

  it('refuses global TCG rules to users who are not bot owners', async () => {
    mocks.session = session('user-1');
    await expect(
      saveTcgRules(INITIAL_SETTINGS_FORM_STATE, form({ marketTaxPercent: '10' })),
    ).rejects.toThrow('NOT_FOUND');
    expect(mocks.updateTcgRules).not.toHaveBeenCalled();
  });
});
