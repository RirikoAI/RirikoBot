import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_SETTINGS_FORM_STATE } from '@/lib/settings-form-state';

const mocks = vi.hoisted(() => ({ saveGuildSettings: vi.fn() }));

vi.mock('@/lib/server/settings-action', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/settings-action')>()),
  saveGuildSettings: mocks.saveGuildSettings,
}));

const { saveAutoModSettings } = await import('./actions');

const GUILD = '100000000000000001';

describe('saveAutoModSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveGuildSettings.mockResolvedValue({ status: 'saved', message: 'Settings saved.' });
  });

  it('saves the automod module with typed values: toggles as flags, exemptions as lists', async () => {
    const data = new FormData();
    data.set('inviteFilterEnabled', 'on');
    data.set('inviteFilterAction', 'DELETE');
    data.append('inviteFilterExemptRoleIds', '300000000000000003');
    data.append('inviteFilterExemptRoleIds', '300000000000000004');
    data.set('mentionSpamLimit', '6');
    data.set('unrelated', 'ignored');

    const state = await saveAutoModSettings(GUILD, INITIAL_SETTINGS_FORM_STATE, data);

    expect(state).toEqual({ status: 'saved', message: 'Settings saved.' });
    const [guildId, module, patch] = mocks.saveGuildSettings.mock.calls[0]!;
    expect([guildId, module]).toEqual([GUILD, 'automod']);
    expect(patch).toMatchObject({
      inviteFilterEnabled: true,
      inviteFilterAction: 'DELETE',
      inviteFilterExemptRoleIds: ['300000000000000003', '300000000000000004'],
      inviteFilterExemptChannelIds: [],
      phishingShieldEnabled: false,
      mentionSpamLimit: '6',
    });
    expect(patch).not.toHaveProperty('unrelated');
    expect(patch).not.toHaveProperty('burstSpamLimit');
  });
});
