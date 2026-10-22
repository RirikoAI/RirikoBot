import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elements, hiddenJson, render, textOf } from '../../../../../../../tests/support/markup';

const GUILD = '100000000000000001';
const REGULAR = '200000000000000001';

const get = vi.fn();
const assignableRoleOptions = vi.fn();
const requireGuildAccess = vi.fn(async (_guildId: string) => ({}));

vi.mock('@/lib/server/guilds/require-guild-access', () => ({
  requireGuildAccess: (guildId: string) => requireGuildAccess(guildId),
}));
vi.mock('@/lib/server/services', () => ({
  getWebServices: async () => ({ guildConfig: { get } }),
}));
vi.mock('@/components/guild-pickers', () => ({
  assignableRoleOptions: (guildId: string, saved: string[]) =>
    assignableRoleOptions(guildId, saved),
  ChannelListField: () => null,
  ChannelSelectField: () => null,
  RoleListField: () => null,
}));
vi.mock('./actions', () => ({
  saveXpSettings: async (_guildId: string, state: unknown) => state,
  saveLevelRoleSettings: async (_guildId: string, state: unknown) => state,
}));

const { default: XpSettingsPage } = await import('./page');

async function page() {
  return render(await XpSettingsPage({ params: Promise.resolve({ guildId: GUILD }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async (_guildId: string, module: string) =>
    module === 'levelroles'
      ? { rewards: [{ level: 5, roleId: REGULAR }], keepPreviousRoles: false }
      : {
          levelUpAnnouncements: true,
          levelUpChannelId: null,
          xpRatePercent: 100,
          noXpChannelIds: [],
          noXpRoleIds: [],
          voiceXpEnabled: true,
        },
  );
  assignableRoleOptions.mockResolvedValue([{ value: REGULAR, label: '@Regular' }]);
});

describe('XpSettingsPage level role rewards (TASK-2006)', () => {
  it('keeps the XP form and adds the level role rewards form below it', async () => {
    const html = await page();
    expect(requireGuildAccess).toHaveBeenCalledWith(GUILD);
    const text = textOf(html);
    expect(text).toContain('Announce level-ups');
    expect(text).toContain('Level role rewards');
    expect(text.indexOf('Level role rewards')).toBeGreaterThan(text.indexOf('Voice rewards'));
    expect(elements(html, 'form')).toHaveLength(2);
  });

  it('shows the saved rewards and offers the roles Ririko can give', async () => {
    const html = await page();
    expect(assignableRoleOptions).toHaveBeenCalledWith(GUILD, [REGULAR]);
    expect(hiddenJson(html, 'rewards')).toEqual([{ level: 5, roleId: REGULAR }]);
    expect(html).toContain('>@Regular</option>');
    expect(textOf(html)).toContain('Up to 25 rewards.');
    const switchInput = elements(html, 'input').find((i) => i['name'] === 'keepPreviousRoles');
    expect(switchInput?.['checked']).toBeUndefined();
    expect(textOf(html)).toContain('Keep lower reward roles');
  });

  it('explains Manage Roles, the role position, the next level-up and /levelroles sync', async () => {
    const text = textOf(await page());
    expect(text).toContain('Ririko needs Manage Roles and a role above the reward roles');
    expect(text).toContain('Rewards apply from the next level-up');
    expect(text).toContain('/levelroles sync');
  });
});
