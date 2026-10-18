import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuildConfigValidationError } from '@ririko/services/guild';
import { INITIAL_SETTINGS_FORM_STATE as S } from '@/lib/settings-form-state';
import {
  baseServices,
  harness,
  resetHarness,
  revalidatePath,
} from '../../../../../../tests/support/web-action-harness';

const mocks = vi.hoisted(() => ({ update: vi.fn() }));

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
  getWebServices: async () => baseServices({ tcgAchievements: { update: mocks.update } }),
}));

const { saveAchievement } = await import('./actions');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe('saveAchievement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
  });

  it('saves the editable fields, with a ticked hidden box as true', async () => {
    mocks.update.mockResolvedValueOnce({ changed: true });
    const state = await saveAchievement(
      'ach-1',
      S,
      form({ title: 'First Blood', rewardXp: '50', isHidden: 'on', other: 'x' }),
    );
    expect(state).toEqual({
      status: 'saved',
      message: 'Achievement saved.',
      values: { title: 'First Blood', rewardXp: '50', isHidden: true },
    });
    expect(mocks.update).toHaveBeenCalledWith(
      'ach-1',
      { title: 'First Blood', rewardXp: '50', isHidden: true },
      expect.objectContaining({ userId: harness.userId, source: 'dashboard' }),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/owner/achievements');

    mocks.update.mockResolvedValueOnce({ changed: false });
    expect(await saveAchievement('ach-1', S, form({ title: 'First Blood' }))).toMatchObject({
      message: 'Nothing changed.',
    });
  });

  it('answers 404 to non-owners and refuses another origin', async () => {
    harness.ownerIds = [];
    await expect(saveAchievement('ach-1', S, form({ title: 'x' }))).rejects.toThrow('NOT_FOUND');
    harness.ownerIds = [harness.userId];
    harness.headers = new Headers({ origin: 'https://evil.example' });
    expect(await saveAchievement('ach-1', S, form({ title: 'x' }))).toMatchObject({
      status: 'error',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('turns schema errors into field errors', async () => {
    mocks.update.mockRejectedValue(
      new GuildConfigValidationError({ rewardXp: ['Enter a whole number.'] }, 'achievement'),
    );
    expect(await saveAchievement('ach-1', S, form({ rewardXp: 'x' }))).toMatchObject({
      status: 'error',
      fieldErrors: { rewardXp: ['Enter a whole number.'] },
    });
  });
});
