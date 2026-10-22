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
  assignableRoles: vi.fn(),
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
      guildResources: { assignableRoles: mocks.assignableRoles, memberRoles: mocks.memberRoles },
      guildConfig: { update: mocks.update },
      notifier: { guildSettingsChanged: mocks.guildSettingsChanged },
    }),
}));

const { saveLevelRoleSettings, saveXpSettings } = await import('./actions');

const REGULAR = '200000000000000001';
const VETERAN = '200000000000000002';
const ADMIN = '200000000000000003';
const GONE = '200000000000000004';
const CHANNEL = '300000000000000001';

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  }
  return data;
}

describe('saveXpSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
  });

  it('saves the XP settings as submitted', async () => {
    mocks.update.mockResolvedValue({ values: {}, changes: [] });
    const state = await saveXpSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({
        levelUpChannelId: CHANNEL,
        xpRatePercent: '150',
        noXpChannelIds: [CHANNEL],
        voiceXpEnabled: 'on',
      }),
    );
    expect(state).toMatchObject({ status: 'saved' });
    expect(mocks.update).toHaveBeenCalledWith(
      GUILD_ID,
      'xp',
      {
        levelUpChannelId: CHANNEL,
        xpRatePercent: '150',
        noXpChannelIds: [CHANNEL],
        noXpRoleIds: [],
        levelUpAnnouncements: false,
        voiceXpEnabled: true,
      },
      expect.objectContaining({ userId: harness.userId, source: 'dashboard' }),
    );
  });
});

describe('saveLevelRoleSettings', () => {
  const rewards = JSON.stringify([
    { level: 5, roleId: REGULAR },
    { level: 20, roleId: VETERAN },
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
    mocks.assignableRoles.mockResolvedValue(
      [REGULAR, VETERAN].map((id) => ({ id, name: `r${id}`, color: 0 })),
    );
    mocks.memberRoles.mockResolvedValue(
      [REGULAR, VETERAN, ADMIN].map((id) => ({ id, name: `r${id}`, color: 0 })),
    );
  });

  it('saves the rewards list and the switch to the levelroles module', async () => {
    mocks.update.mockResolvedValue({
      values: {},
      changes: [{ field: 'rewards', before: [], after: [] }],
    });
    const state = await saveLevelRoleSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({ rewards, keepPreviousRoles: 'on' }),
    );
    expect(state).toMatchObject({ status: 'saved', message: 'Settings saved.' });
    expect(mocks.update).toHaveBeenCalledWith(
      GUILD_ID,
      'levelroles',
      { rewards, keepPreviousRoles: true },
      expect.objectContaining({ userId: harness.userId, source: 'dashboard' }),
    );
  });

  it('reads an unticked switch as off and an empty list as no rewards', async () => {
    mocks.update.mockResolvedValue({ values: {}, changes: [] });
    const state = await saveLevelRoleSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({ rewards: '[]' }),
    );
    expect(state).toMatchObject({ status: 'saved', message: 'Nothing changed.' });
    expect(mocks.update).toHaveBeenCalledWith(
      GUILD_ID,
      'levelroles',
      { rewards: '[]', keepPreviousRoles: false },
      expect.anything(),
    );
    expect(mocks.assignableRoles).not.toHaveBeenCalled();
  });

  it('refuses a role Ririko cannot give or that is gone, and saves nothing', async () => {
    const state = await saveLevelRoleSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({
        rewards: JSON.stringify([
          { level: 5, roleId: REGULAR },
          { level: 10, roleId: ADMIN },
          { level: 20, roleId: GONE },
        ]),
        keepPreviousRoles: 'on',
      }),
    );
    expect(state).toMatchObject({
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: {
        rewards: [
          `Ririko cannot give @r${ADMIN}: it is managed by an integration or is not below Ririko’s highest role.`,
          `Role ${GONE} no longer exists.`,
        ],
      },
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns the schema errors with the submitted rows', async () => {
    const bad = JSON.stringify([
      { level: 0, roleId: REGULAR },
      { level: 5, roleId: VETERAN },
    ]);
    mocks.update.mockImplementation(async (_guild: string, _module: string, patch: unknown) => {
      const parsed = GuildConfigSchemas.levelroles.safeParse(patch);
      if (parsed.success) return { values: parsed.data, changes: [] };
      throw new GuildConfigValidationError({
        rewards: parsed.error.issues.map(
          (issue) => `Row ${Number(issue.path[1]) + 1}: ${issue.message}`,
        ),
      });
    });
    const state = await saveLevelRoleSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({ rewards: bad, keepPreviousRoles: 'on' }),
    );
    expect(state).toMatchObject({
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { rewards: ['Row 1: Level must be a whole number from 1 to 1000.'] },
      values: { rewards: bad, keepPreviousRoles: true },
    });
  });

  it('tells the admin when Discord cannot be reached, and saves nothing', async () => {
    mocks.assignableRoles.mockRejectedValue(new Error('discord down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const state = await saveLevelRoleSettings(
      GUILD_ID,
      INITIAL_SETTINGS_FORM_STATE,
      form({ rewards }),
    );
    expect(state.status).toBe('error');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
