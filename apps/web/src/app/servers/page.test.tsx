import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elements, render, textOf } from '../../../../../tests/support/markup';

const GUILD = '100000000000000001';
const OTHER = '100000000000000002';

const listManageableGuilds = vi.fn();
const requireSession = vi.fn(async (_returnTo: string) => ({ userId: 'user' }));
const redirect = vi.fn((location: string) => {
  throw new Error(`redirect:${location}`);
});

vi.mock('next/navigation', () => ({ redirect: (location: string) => redirect(location) }));
vi.mock('@/components/site-header', () => ({ SiteHeader: () => null }));
vi.mock('@/components/guild-icon', () => ({ GuildIcon: () => null }));
vi.mock('@/lib/server/auth/session', () => ({
  requireSession: (returnTo: string) => requireSession(returnTo),
}));
vi.mock('@/lib/server/services', () => ({
  getWebServices: async () => ({ guildAccess: { listManageableGuilds } }),
}));

const { default: ServersPage } = await import('./page');

async function page(search: { invited?: string | string[] } = {}) {
  return render(await ServersPage({ searchParams: Promise.resolve(search) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  listManageableGuilds.mockResolvedValue([
    { id: GUILD, name: 'Has Ririko', icon: null, botPresent: true },
    { id: OTHER, name: 'Needs Ririko', icon: null, botPresent: false },
  ]);
});

describe('ServersPage (TASK-1841)', () => {
  it('manages servers with the bot and invites it through the dashboard invite flow', async () => {
    const hrefs = elements(await page(), 'a').map((a) => a['href']);

    expect(hrefs).toContain(`/dashboard/${GUILD}`);
    expect(hrefs).toContain(`/api/invite?guild=${OTHER}`);
    expect(hrefs.some((href) => String(href).includes('discord.com'))).toBe(false);
  });

  it('shows a notice after an invite and ignores anything that is not a server ID', async () => {
    expect(textOf(await page({ invited: GUILD }))).toContain('Ririko was added to your server');
    expect(textOf(await page({ invited: '<script>' }))).not.toContain('was added');
    expect(textOf(await page({ invited: [GUILD, OTHER] }))).not.toContain('was added');
    expect(textOf(await page())).not.toContain('was added');
  });

  it('asks the user to sign in again when the server list cannot be read', async () => {
    listManageableGuilds.mockResolvedValue(null);

    await expect(page()).rejects.toThrow('redirect:/api/auth/login?returnTo=%2Fservers');
  });

  it('says so when the user manages no server', async () => {
    listManageableGuilds.mockResolvedValue([]);

    expect(textOf(await page())).toContain("You don't manage any Discord servers yet");
  });
});
