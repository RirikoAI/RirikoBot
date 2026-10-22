import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuildConfigSchemas } from '@ririko/core';
import { GuildConfigValidationError } from '@ririko/services/guild';
import { INITIAL_SETTINGS_FORM_STATE } from '@/lib/settings-form-state';
import {
  baseServices,
  GUILD_ID,
  harness,
  resetHarness,
} from '../../../../../../../tests/support/web-action-harness';

const mocks = vi.hoisted(() => ({
  messageChannels: vi.fn(),
  update: vi.fn(),
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
      guildResources: { messageChannels: mocks.messageChannels },
      guildConfig: { update: mocks.update },
      notifier: { guildSettingsChanged: mocks.guildSettingsChanged },
    }),
}));

const { saveStarboardSettings } = await import('./actions');

const STARBOARD = '200000000000000001';
const IGNORED = '200000000000000002';
const OTHER_IGNORED = '200000000000000003';

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  }
  return data;
}

describe('saveStarboardSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
    mocks.messageChannels.mockResolvedValue(
      [STARBOARD, IGNORED].map((id) => ({ id, name: `c${id}`, category: null })),
    );
  });

  it('saves the channel, emoji, threshold, switch and ignored channels as submitted', async () => {
    mocks.update.mockResolvedValue({
      values: {},
      changes: [{ field: 'channelId', before: null, after: STARBOARD }],
    });
    const state = await saveStarboardSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({
        channelId: STARBOARD,
        emoji: '<:pog:123456789012345678>',
        threshold: '5',
        allowSelfStar: 'on',
        ignoredChannelIds: [IGNORED, OTHER_IGNORED],
      }),
    );
    expect(state).toMatchObject({ status: 'saved', message: 'Settings saved.' });
    expect(mocks.update).toHaveBeenCalledWith(
      GUILD_ID,
      'starboard',
      {
        channelId: STARBOARD,
        emoji: '<:pog:123456789012345678>',
        threshold: '5',
        allowSelfStar: true,
        ignoredChannelIds: [IGNORED, OTHER_IGNORED],
      },
      expect.objectContaining({ userId: harness.userId, source: 'dashboard' }),
    );
  });

  it('reads Off, an empty list and an unticked switch from the form, without a Discord lookup', async () => {
    mocks.update.mockResolvedValue({ values: {}, changes: [] });
    const state = await saveStarboardSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({ channelId: '', emoji: '⭐', threshold: '3' }),
    );
    expect(state).toMatchObject({ status: 'saved', message: 'Nothing changed.' });
    expect(mocks.messageChannels).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(
      GUILD_ID,
      'starboard',
      { channelId: '', emoji: '⭐', threshold: '3', allowSelfStar: false, ignoredChannelIds: [] },
      expect.anything(),
    );
  });

  it('refuses a channel that is not a text channel of this server, and saves nothing', async () => {
    const state = await saveStarboardSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({ channelId: '999999999999999999', emoji: '⭐', threshold: '3' }),
    );
    expect(state).toMatchObject({
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { channelId: ['Choose a text channel of this server.'] },
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns the schema errors for a bad emoji and threshold, with the submitted values', async () => {
    mocks.update.mockImplementation(async (_guild: string, _module: string, patch: unknown) => {
      const parsed = GuildConfigSchemas.starboard.safeParse(patch);
      if (parsed.success) return { values: parsed.data, changes: [] };
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        (fieldErrors[key] ??= []).push(issue.message);
      }
      throw new GuildConfigValidationError(fieldErrors);
    });
    const state = await saveStarboardSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({ channelId: STARBOARD, emoji: 'star', threshold: '0' }),
    );
    expect(state).toMatchObject({
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: {
        emoji: [expect.stringContaining('Use one emoji')],
        threshold: expect.any(Array),
      },
      values: { emoji: 'star', threshold: '0', channelId: STARBOARD },
    });
  });

  it('tells the admin when Discord cannot be reached, and saves nothing', async () => {
    mocks.messageChannels.mockRejectedValue(new Error('discord down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const state = await saveStarboardSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({ channelId: STARBOARD }),
    );
    expect(state.status).toBe('error');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
