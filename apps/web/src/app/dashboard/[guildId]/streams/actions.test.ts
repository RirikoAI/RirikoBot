import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamAlertError } from '@ririko/services/stream-alerts';
import { rateLimits } from '@/lib/server/rate-limit';
import { INITIAL_SETTINGS_FORM_STATE } from '@/lib/settings-form-state';
import {
  baseServices,
  flushAfter,
  GUILD_ID,
  harness,
  resetHarness,
} from '../../../../../../../tests/support/web-action-harness';

const mocks = vi.hoisted(() => ({
  messageChannels: vi.fn(),
  memberRoles: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  subscribe: vi.fn(),
  remove: vi.fn(),
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
      guildResources: { messageChannels: mocks.messageChannels, memberRoles: mocks.memberRoles },
      streamAlerts: {
        get: mocks.get,
        update: mocks.update,
        subscribe: mocks.subscribe,
        remove: mocks.remove,
      },
      notifier: { guildSettingsChanged: mocks.guildSettingsChanged },
    }),
}));

const { saveStreamAlert, removeStreamAlert } = await import('./actions');

const CHANNEL = '200000000000000002';
const ROLE = '300000000000000003';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const streamer = { platform: 'TWITCH', username: 'kuro', displayName: 'Kuro' };
const subscription = { channelId: CHANNEL, mentionRoleId: null, customMessage: null };

describe('stream alert actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
    mocks.messageChannels.mockResolvedValue([{ id: CHANNEL, name: 'live' }]);
    mocks.memberRoles.mockResolvedValue([{ id: ROLE, name: 'Live pings' }]);
  });

  describe('guards', () => {
    it('refuses a request from another origin before touching anything', async () => {
      harness.headers = new Headers({ origin: 'https://evil.example' });
      const state = await saveStreamAlert(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ streamer: 'kuro', channelId: CHANNEL }),
      );
      expect(state).toMatchObject({
        status: 'error',
        message: 'This request did not come from the dashboard.',
        values: { streamer: 'kuro', channelId: CHANNEL },
      });
      expect(mocks.subscribe).not.toHaveBeenCalled();
    });

    it('refuses a user who is over the rate limit', async () => {
      const key = `user:${harness.userId}`;
      while (rateLimits.actions.take(key)) {
        /* drain the bucket */
      }
      const state = await removeStreamAlert(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ subscriptionId: 'sub-1' }),
      );
      expect(state).toMatchObject({
        status: 'error',
        message: expect.stringContaining('Too many'),
      });
      expect(mocks.remove).not.toHaveBeenCalled();
    });

    it('sends a signed-out visitor to sign in', async () => {
      harness.session = null;
      await expect(
        removeStreamAlert(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({ subscriptionId: 'x' })),
      ).rejects.toThrow('REDIRECT /api/auth/login?returnTo=%2Fdashboard%2F' + GUILD_ID);
    });

    it('answers 404 for a guild the user cannot manage', async () => {
      harness.guildAccess = 'denied';
      await expect(
        saveStreamAlert(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({ streamer: 'kuro' })),
      ).rejects.toThrow('NOT_FOUND');
      expect(mocks.subscribe).not.toHaveBeenCalled();
    });

    it('answers 404 for a malformed guild ID', async () => {
      await expect(
        saveStreamAlert('not-a-guild', INITIAL_SETTINGS_FORM_STATE, form({ streamer: 'kuro' })),
      ).rejects.toThrow('NOT_FOUND');
    });
  });

  describe('saveStreamAlert', () => {
    it('reports field errors for a missing channel and streamer, with trimmed values', async () => {
      const state = await saveStreamAlert(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ streamer: '   ', customMessage: '  hi  ' }),
      );
      expect(state).toEqual({
        status: 'error',
        message: 'Please fix the highlighted fields.',
        fieldErrors: {
          channelId: ['Choose the channel for the announcements.'],
          streamer: ['Enter a streamer name, handle, channel ID or profile link.'],
        },
        values: {
          subscriptionId: '',
          streamer: '',
          platform: '',
          channelId: '',
          mentionRoleId: '',
          customMessage: 'hi',
        },
      });
      expect(mocks.subscribe).not.toHaveBeenCalled();
    });

    it('rejects a channel and role that are not of this server', async () => {
      const state = await saveStreamAlert(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({
          streamer: 'kuro',
          channelId: '999999999999999999',
          mentionRoleId: '888888888888888888',
        }),
      );
      expect(state).toMatchObject({
        status: 'error',
        fieldErrors: {
          channelId: ['Choose a text channel of this server.'],
          mentionRoleId: ['Choose a role of this server.'],
        },
      });
    });

    it('asks to try again when Discord cannot be reached for the check', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mocks.messageChannels.mockRejectedValue(new Error('Discord down'));
      const state = await saveStreamAlert(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ streamer: 'kuro', channelId: CHANNEL }),
      );
      expect(state).toMatchObject({
        status: 'error',
        message: 'Could not check the channels and roles with Discord. Try again in a moment.',
      });
      expect(log).toHaveBeenCalled();
      log.mockRestore();
    });

    it('follows a new streamer, audits through the service and announces it after the response', async () => {
      mocks.subscribe.mockResolvedValue({
        alert: { streamer, subscription },
        created: true,
      });
      const state = await saveStreamAlert(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({
          streamer: 'kuro',
          platform: 'twitch',
          channelId: CHANNEL,
          mentionRoleId: ROLE,
          customMessage: '{streamer} is live',
        }),
      );
      expect(state).toEqual({ status: 'saved', message: 'Now following Kuro.', values: {} });
      expect(mocks.subscribe).toHaveBeenCalledWith(
        {
          guildId: GUILD_ID,
          streamer: 'kuro',
          platform: 'TWITCH',
          channelId: CHANNEL,
          mentionRoleId: ROLE,
          customMessage: '{streamer} is live',
        },
        {
          userId: harness.userId,
          source: 'dashboard',
          ipAddress: '203.0.113.7',
          userAgent: 'vitest',
        },
      );
      expect(mocks.guildSettingsChanged).not.toHaveBeenCalled();
      await flushAfter();
      expect(mocks.guildSettingsChanged).toHaveBeenCalledWith(GUILD_ID, {
        userId: harness.userId,
        module: 'streams',
        changes: [{ field: 'TWITCH kuro', before: null, after: subscription }],
      });
    });

    it('says so when the server already followed the streamer', async () => {
      mocks.subscribe.mockResolvedValue({
        alert: { streamer: { ...streamer, displayName: '' }, subscription },
        created: false,
      });
      const state = await saveStreamAlert(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ streamer: 'kuro', channelId: CHANNEL }),
      );
      expect(state).toEqual({
        status: 'saved',
        message: 'This server already followed kuro; its subscription was updated.',
        values: {},
      });
    });

    it('edits an existing subscription and records before and after', async () => {
      const before = { subscription: { ...subscription, customMessage: 'old' } };
      mocks.get.mockResolvedValue(before);
      mocks.update.mockResolvedValue({
        streamer,
        subscription: { ...subscription, mentionRoleId: ROLE },
      });
      const state = await saveStreamAlert(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ subscriptionId: 'sub-1', channelId: CHANNEL, mentionRoleId: ROLE }),
      );
      expect(state).toMatchObject({ status: 'saved', message: 'Subscription saved.' });
      expect(mocks.update).toHaveBeenCalledWith(
        GUILD_ID,
        'sub-1',
        { channelId: CHANNEL, mentionRoleId: ROLE, customMessage: null },
        expect.objectContaining({ userId: harness.userId }),
      );
      await flushAfter();
      expect(mocks.guildSettingsChanged).toHaveBeenCalledWith(
        GUILD_ID,
        expect.objectContaining({
          changes: [
            {
              field: 'TWITCH kuro',
              before: { channelId: CHANNEL, mentionRoleId: null, customMessage: 'old' },
              after: { channelId: CHANNEL, mentionRoleId: ROLE, customMessage: null },
            },
          ],
        }),
      );
    });

    it('records a null before when the subscription vanished meanwhile', async () => {
      mocks.get.mockResolvedValue(null);
      mocks.update.mockResolvedValue({ streamer, subscription });
      await saveStreamAlert(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ subscriptionId: 'sub-1', channelId: CHANNEL }),
      );
      await flushAfter();
      expect(mocks.guildSettingsChanged).toHaveBeenCalledWith(
        GUILD_ID,
        expect.objectContaining({ changes: [expect.objectContaining({ before: null })] }),
      );
    });

    it('shows a refusal of the rules as the form message', async () => {
      mocks.subscribe.mockRejectedValue(new StreamAlertError('This server follows 25 streamers.'));
      const state = await saveStreamAlert(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ streamer: 'kuro', channelId: CHANNEL }),
      );
      expect(state).toMatchObject({
        status: 'error',
        message: 'This server follows 25 streamers.',
        values: expect.objectContaining({ streamer: 'kuro' }),
      });
    });

    it('lets unexpected failures through', async () => {
      mocks.subscribe.mockRejectedValue(new Error('database is down'));
      await expect(
        saveStreamAlert(
          GUILD_ID,
          INITIAL_SETTINGS_FORM_STATE,
          form({ streamer: 'kuro', channelId: CHANNEL }),
        ),
      ).rejects.toThrow('database is down');
    });
  });

  describe('removeStreamAlert', () => {
    it('removes the subscription and announces the change', async () => {
      mocks.remove.mockResolvedValue({ subscription, streamer });
      const state = await removeStreamAlert(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ subscriptionId: 'sub-1' }),
      );
      expect(state).toEqual({ status: 'saved', message: 'Subscription removed.', values: {} });
      expect(mocks.remove).toHaveBeenCalledWith(
        GUILD_ID,
        'sub-1',
        expect.objectContaining({ userId: harness.userId, source: 'dashboard' }),
      );
      await flushAfter();
      expect(mocks.guildSettingsChanged).toHaveBeenCalledWith(GUILD_ID, {
        userId: harness.userId,
        module: 'streams',
        changes: [{ field: 'TWITCH kuro', before: subscription, after: null }],
      });
    });

    it('names a subscription whose streamer is gone generically', async () => {
      mocks.remove.mockResolvedValue({ subscription, streamer: null });
      await removeStreamAlert(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({ subscriptionId: 's' }));
      await flushAfter();
      expect(mocks.guildSettingsChanged).toHaveBeenCalledWith(
        GUILD_ID,
        expect.objectContaining({ changes: [expect.objectContaining({ field: 'subscription' })] }),
      );
    });

    it('shows an unknown subscription as the form message', async () => {
      mocks.remove.mockRejectedValue(new StreamAlertError('That subscription no longer exists.'));
      const state = await removeStreamAlert(
        GUILD_ID,
        INITIAL_SETTINGS_FORM_STATE,
        form({ subscriptionId: 'gone' }),
      );
      expect(state).toEqual({ status: 'error', message: 'That subscription no longer exists.' });
    });

    it('lets unexpected failures through', async () => {
      mocks.remove.mockRejectedValue(new Error('boom'));
      await expect(
        removeStreamAlert(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({ subscriptionId: 'x' })),
      ).rejects.toThrow('boom');
    });
  });
});
