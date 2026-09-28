import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_SETTINGS_FORM_STATE } from '@/lib/settings-form-state';

const mocks = vi.hoisted(() => ({
  saveGuildSettings: vi.fn(),
  messageChannels: vi.fn(),
  memberRoles: vi.fn(),
}));

vi.mock('@/lib/server/settings-action', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/settings-action')>()),
  saveGuildSettings: mocks.saveGuildSettings,
}));
vi.mock('@/lib/server/services', () => ({
  getWebServices: async () => ({
    guildResources: { messageChannels: mocks.messageChannels, memberRoles: mocks.memberRoles },
  }),
}));

const { saveTcgSettings } = await import('./actions');

const GUILD = '100000000000000001';
const CHANNEL = '200000000000000002';
const ROLE = '300000000000000003';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe('saveTcgSettings (TASK-1121)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveGuildSettings.mockResolvedValue({ status: 'saved', message: 'Settings saved.' });
    mocks.messageChannels.mockResolvedValue([{ id: CHANNEL, name: 'drops' }]);
    mocks.memberRoles.mockResolvedValue([{ id: ROLE, name: 'TCG' }]);
  });

  it('saves the tcg module with the form fields and an unticked toggle as off', async () => {
    const state = await saveTcgSettings(
      GUILD,
      INITIAL_SETTINGS_FORM_STATE,
      form({
        dropChannelId: CHANNEL,
        dropMessageThreshold: '20',
        dropStartHour: '8',
        dropEndHour: '23',
        dropClaimTimeoutSeconds: '60',
        dropCooldownMinutes: '5',
        managerRoleId: ROLE,
      }),
    );

    expect(state.status).toBe('saved');
    const [guildId, module, patch] = mocks.saveGuildSettings.mock.calls[0]!;
    expect(guildId).toBe(GUILD);
    expect(module).toBe('tcg');
    expect(patch).toEqual({
      dropChannelId: CHANNEL,
      dropMessageThreshold: '20',
      dropStartHour: '8',
      dropEndHour: '23',
      dropClaimTimeoutSeconds: '60',
      dropCooldownMinutes: '5',
      managerRoleId: ROLE,
      dropsEnabled: false,
    });
  });

  it('checks the drop channel and manager role belong to the server', async () => {
    await saveTcgSettings(GUILD, INITIAL_SETTINGS_FORM_STATE, form({}));
    const { check } = mocks.saveGuildSettings.mock.calls[0]![3];

    expect(await check({ dropChannelId: CHANNEL, managerRoleId: ROLE })).toEqual({});
    expect(
      await check({ dropChannelId: '999999999999999999', managerRoleId: '888888888888888888' }),
    ).toEqual({
      dropChannelId: ['Choose a text channel of this server.'],
      managerRoleId: ['Choose a role of this server.'],
    });
    expect(await check({ dropChannelId: '', managerRoleId: '' })).toEqual({});
  });
});
