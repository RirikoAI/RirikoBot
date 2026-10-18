import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GiveawayError, MAX_REROLL_WINNERS } from '@/lib/server/guilds/giveaways';
import { INITIAL_SETTINGS_FORM_STATE } from '@/lib/settings-form-state';
import {
  baseServices,
  flushAfter,
  GUILD_ID,
  harness,
  resetHarness,
  revalidatePath,
} from '../../../../../../../tests/support/web-action-harness';

const mocks = vi.hoisted(() => ({
  end: vi.fn(),
  reroll: vi.fn(),
  guildSettingsChanged: vi.fn(),
}));

vi.mock(
  'next/headers',
  async () =>
    (await import('../../../../../../../tests/support/web-action-harness')).nextHeadersMock,
);
vi.mock(
  'next/navigation',
  async () =>
    (await import('../../../../../../../tests/support/web-action-harness')).nextNavigationMock,
);
vi.mock(
  'next/cache',
  async () => (await import('../../../../../../../tests/support/web-action-harness')).nextCacheMock,
);
vi.mock(
  'next/server',
  async () =>
    (await import('../../../../../../../tests/support/web-action-harness')).nextServerMock,
);
vi.mock('@/lib/server/services', () => ({
  getWebServices: async () =>
    baseServices({
      giveaways: { end: mocks.end, reroll: mocks.reroll },
      notifier: { guildSettingsChanged: mocks.guildSettingsChanged },
    }),
}));

const { endGiveaway, rerollGiveaway } = await import('./actions');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe('giveaway actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
  });

  describe('guards', () => {
    it('refuses another origin and answers 404 for a guild the user cannot manage', async () => {
      harness.headers = new Headers({ origin: 'https://evil.example' });
      expect(
        await endGiveaway(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({ giveawayId: 'g1' })),
      ).toMatchObject({ status: 'error' });

      harness.headers = new Headers({ origin: 'https://dash.example.com' });
      harness.guildAccess = 'denied';
      await expect(
        rerollGiveaway(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({ giveawayId: 'g1' })),
      ).rejects.toThrow('NOT_FOUND');
      expect(mocks.end).not.toHaveBeenCalled();
      expect(mocks.reroll).not.toHaveBeenCalled();
    });
  });

  describe('endGiveaway', () => {
    it('ends the giveaway with the dashboard user as the actor and announces the winners', async () => {
      mocks.end.mockResolvedValue({ prize: 'Nitro', winnerIds: ['u1', 'u2'] });
      const state = await endGiveaway(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ giveawayId: 'g1' }),
      );
      expect(state).toEqual({
        status: 'saved',
        message: 'Giveaway ended with 2 winners.',
        values: {},
      });
      expect(mocks.end).toHaveBeenCalledWith(GUILD_ID, 'g1', {
        userId: harness.userId,
        ipAddress: '203.0.113.7',
        userAgent: 'vitest',
      });
      expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/${GUILD_ID}/giveaways`);
      await flushAfter();
      expect(mocks.guildSettingsChanged).toHaveBeenCalledWith(GUILD_ID, {
        userId: harness.userId,
        module: 'giveaways',
        changes: [{ field: 'winners of Nitro', before: [], after: ['u1', 'u2'] }],
      });
    });

    it('uses the singular for one winner and explains an empty draw', async () => {
      mocks.end.mockResolvedValueOnce({ prize: 'Nitro', winnerIds: ['u1'] });
      expect(
        await endGiveaway(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({ giveawayId: 'g1' })),
      ).toMatchObject({ message: 'Giveaway ended with 1 winner.' });
      mocks.end.mockResolvedValueOnce({ prize: 'Nitro', winnerIds: [] });
      expect(
        await endGiveaway(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({ giveawayId: 'g1' })),
      ).toMatchObject({
        message: 'Giveaway ended. Nobody could win: there were no eligible entries.',
      });
    });

    it('shows refusals as the form message and lets other errors through', async () => {
      mocks.end.mockRejectedValueOnce(new GiveawayError('That giveaway already ended.'));
      expect(
        await endGiveaway(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({ giveawayId: 'g1' })),
      ).toEqual({ status: 'error', message: 'That giveaway already ended.' });
      mocks.end.mockRejectedValueOnce(new Error('boom'));
      await expect(endGiveaway(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({}))).rejects.toThrow(
        'boom',
      );
    });
  });

  describe('rerollGiveaway', () => {
    it.each(['0', '21', '1.5', 'many'])('rejects a winner count of "%s"', async (count) => {
      const state = await rerollGiveaway(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ giveawayId: 'g1', count }),
      );
      expect(state).toEqual({
        status: 'error',
        message: `Enter a whole number of winners from 1 to ${MAX_REROLL_WINNERS}, or leave it empty.`,
        fieldErrors: { count: [`Enter a whole number from 1 to ${MAX_REROLL_WINNERS}.`] },
        values: { giveawayId: 'g1', count },
      });
      expect(mocks.reroll).not.toHaveBeenCalled();
    });

    it('rerolls with the original winner count when none is given', async () => {
      mocks.reroll.mockResolvedValue({ prize: 'Nitro', winnerIds: ['u3'], posted: true });
      const state = await rerollGiveaway(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ giveawayId: 'g1', count: '  ' }),
      );
      expect(state).toEqual({
        status: 'saved',
        message: "Rerolled: 1 winner announced in the giveaway's channel.",
        values: {},
      });
      expect(mocks.reroll).toHaveBeenCalledWith(
        GUILD_ID,
        'g1',
        null,
        expect.objectContaining({ userId: harness.userId }),
      );
      await flushAfter();
      expect(mocks.guildSettingsChanged).toHaveBeenCalledWith(
        GUILD_ID,
        expect.objectContaining({
          changes: [{ field: 'rerolled winners of Nitro', before: [], after: ['u3'] }],
        }),
      );
    });

    it('passes an explicit count and says when Ririko could not post', async () => {
      mocks.reroll.mockResolvedValue({ prize: 'Nitro', winnerIds: ['a', 'b'], posted: false });
      const state = await rerollGiveaway(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ giveawayId: 'g1', count: '2' }),
      );
      expect(state).toEqual({
        status: 'saved',
        message: "Rerolled 2 winners, but Ririko could not post in the giveaway's channel.",
        values: {},
      });
      expect(mocks.reroll).toHaveBeenCalledWith(GUILD_ID, 'g1', 2, expect.anything());
    });

    it('shows refusals as the form message and lets other errors through', async () => {
      mocks.reroll.mockRejectedValueOnce(new GiveawayError('The giveaway has not ended yet.'));
      expect(
        await rerollGiveaway(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({ giveawayId: 'g1' })),
      ).toEqual({ status: 'error', message: 'The giveaway has not ended yet.' });
      mocks.reroll.mockRejectedValueOnce(new Error('boom'));
      await expect(
        rerollGiveaway(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({ giveawayId: 'g1' })),
      ).rejects.toThrow('boom');
    });
  });
});
