import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuildConfigValidationError } from '@ririko/services/guild';
import { INITIAL_SETTINGS_FORM_STATE } from '@/lib/settings-form-state';
import {
  baseServices,
  GUILD_ID,
  harness,
  resetHarness,
} from '../../../../../../../tests/support/web-action-harness';

const mocks = vi.hoisted(() => ({
  categories: vi.fn(),
  messageChannels: vi.fn(),
  memberRoles: vi.fn(),
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
      guildResources: {
        categories: mocks.categories,
        messageChannels: mocks.messageChannels,
        memberRoles: mocks.memberRoles,
      },
      guildConfig: { update: mocks.update },
      notifier: { guildSettingsChanged: mocks.guildSettingsChanged },
    }),
}));

const { saveTicketSettings } = await import('./actions');

const CATEGORY = '300000000000000003';
const CHANNEL = '200000000000000002';
const STAFF = '400000000000000004';
const OTHER_STAFF = '400000000000000005';

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  }
  return data;
}

describe('saveTicketSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
    mocks.categories.mockResolvedValue([{ id: CATEGORY, name: 'Support', category: null }]);
    mocks.messageChannels.mockResolvedValue([{ id: CHANNEL, name: 'transcripts', category: null }]);
    mocks.memberRoles.mockResolvedValue([
      { id: STAFF, name: 'Staff' },
      { id: OTHER_STAFF, name: 'Mods' },
    ]);
  });

  it('saves every field as submitted, reading the list and an unticked switch from the form', async () => {
    mocks.update.mockResolvedValue({
      values: {},
      changes: [{ field: 'categoryId', before: null, after: CATEGORY }],
    });
    const state = await saveTicketSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({
        enabled: 'on',
        categoryId: CATEGORY,
        staffRoleIds: [STAFF, OTHER_STAFF],
        transcriptChannelId: CHANNEL,
        maxOpenPerUser: '2',
        welcomeMessage: 'Hello!',
      }),
    );
    expect(state).toMatchObject({ status: 'saved', message: 'Settings saved.' });
    expect(mocks.update).toHaveBeenCalledWith(
      GUILD_ID,
      'tickets',
      {
        categoryId: CATEGORY,
        transcriptChannelId: CHANNEL,
        maxOpenPerUser: '2',
        welcomeMessage: 'Hello!',
        staffRoleIds: [STAFF, OTHER_STAFF],
        enabled: true,
      },
      expect.objectContaining({ userId: harness.userId, source: 'dashboard' }),
    );

    await saveTicketSettings(GUILD_ID, INITIAL_SETTINGS_FORM_STATE, form({ categoryId: '' }));
    expect(mocks.update).toHaveBeenLastCalledWith(
      GUILD_ID,
      'tickets',
      { categoryId: '', staffRoleIds: [], enabled: false },
      expect.anything(),
    );
    expect(mocks.categories).toHaveBeenCalledTimes(1);
    expect(mocks.memberRoles).toHaveBeenCalledTimes(1);
  });

  it('returns the schema errors under their fields', async () => {
    mocks.update.mockRejectedValue(
      new GuildConfigValidationError({ maxOpenPerUser: ['Enter a whole number from 1 to 5.'] }),
    );
    const state = await saveTicketSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({ maxOpenPerUser: '9' }),
    );
    expect(state).toMatchObject({
      status: 'error',
      fieldErrors: { maxOpenPerUser: ['Enter a whole number from 1 to 5.'] },
    });
  });

  it('refuses a category, transcript channel or staff role that is not of this server', async () => {
    const state = await saveTicketSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({
        categoryId: '999999999999999999',
        transcriptChannelId: '999999999999999998',
        staffRoleIds: [STAFF, '999999999999999997'],
      }),
    );
    expect(state).toMatchObject({
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: {
        categoryId: ['Choose a category of this server.'],
        transcriptChannelId: ['Choose a text channel of this server.'],
        staffRoleIds: ['Role 999999999999999997 no longer exists.'],
      },
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('tells the admin when Discord cannot be reached, and saves nothing', async () => {
    mocks.categories.mockRejectedValue(new Error('discord down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const state = await saveTicketSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({ categoryId: CATEGORY }),
    );
    expect(state.status).toBe('error');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
