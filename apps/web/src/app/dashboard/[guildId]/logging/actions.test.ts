import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const { saveEventLogSettings, saveLoggingSettings } = await import('./actions');

const MESSAGES = '200000000000000001';
const MEMBERS = '200000000000000002';
const SERVER = '200000000000000003';
const VOICE = '200000000000000004';
const IGNORED = '200000000000000005';
const OTHER_IGNORED = '200000000000000006';

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  }
  return data;
}

describe('saveLoggingSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
  });

  it('saves only the log channel', async () => {
    mocks.update.mockResolvedValue({ values: {}, changes: [] });
    const state = await saveLoggingSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({ logChannelId: MESSAGES, ignoreBots: 'on' }),
    );
    expect(state).toMatchObject({ status: 'saved' });
    expect(mocks.update).toHaveBeenCalledWith(
      GUILD_ID,
      'logging',
      { logChannelId: MESSAGES },
      expect.objectContaining({ userId: harness.userId, source: 'dashboard' }),
    );
  });
});

describe('saveEventLogSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
    mocks.messageChannels.mockResolvedValue(
      [MESSAGES, MEMBERS, SERVER, VOICE].map((id) => ({ id, name: `c${id}`, category: null })),
    );
  });

  it('saves the channels, the ignored list and the switch as submitted', async () => {
    mocks.update.mockResolvedValue({
      values: {},
      changes: [{ field: 'messageChannelId', before: null, after: MESSAGES }],
    });
    const state = await saveEventLogSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({
        messageChannelId: MESSAGES,
        memberChannelId: MEMBERS,
        serverChannelId: SERVER,
        voiceChannelId: VOICE,
        ignoredChannelIds: [IGNORED, OTHER_IGNORED],
        ignoreBots: 'on',
      }),
    );
    expect(state).toMatchObject({ status: 'saved', message: 'Settings saved.' });
    expect(mocks.update).toHaveBeenCalledWith(
      GUILD_ID,
      'eventlogs',
      {
        messageChannelId: MESSAGES,
        memberChannelId: MEMBERS,
        serverChannelId: SERVER,
        voiceChannelId: VOICE,
        ignoredChannelIds: [IGNORED, OTHER_IGNORED],
        ignoreBots: true,
      },
      expect.objectContaining({ userId: harness.userId, source: 'dashboard' }),
    );
  });

  it('reads Off channels, an empty list and an unticked switch from the form', async () => {
    mocks.update.mockResolvedValue({ values: {}, changes: [] });
    await saveEventLogSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({ messageChannelId: '', memberChannelId: '', serverChannelId: '', voiceChannelId: '' }),
    );
    expect(mocks.update).toHaveBeenCalledWith(
      GUILD_ID,
      'eventlogs',
      {
        messageChannelId: '',
        memberChannelId: '',
        serverChannelId: '',
        voiceChannelId: '',
        ignoredChannelIds: [],
        ignoreBots: false,
      },
      expect.anything(),
    );
  });

  it('refuses a channel that is not a text channel of this server, and saves nothing', async () => {
    const state = await saveEventLogSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({
        messageChannelId: MESSAGES,
        memberChannelId: '999999999999999999',
        voiceChannelId: '999999999999999998',
      }),
    );
    expect(state).toMatchObject({
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: {
        memberChannelId: ['Choose a text channel of this server.'],
        voiceChannelId: ['Choose a text channel of this server.'],
      },
    });
    expect(state).not.toMatchObject({ fieldErrors: { messageChannelId: expect.anything() } });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('tells the admin when Discord cannot be reached, and saves nothing', async () => {
    mocks.messageChannels.mockRejectedValue(new Error('discord down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const state = await saveEventLogSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({ messageChannelId: MESSAGES }),
    );
    expect(state.status).toBe('error');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
