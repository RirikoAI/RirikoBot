import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Guild } from '@ririko/database';
import { elements, render, textOf } from '../../../../../../tests/support/markup';

const requireOwner = vi.fn(async (_returnTo: string) => ({ userId: 'owner' }));
const listAll = vi.fn<() => Promise<Guild[]>>();
const listAllCommandUsage = vi.fn();
const lookup = vi.fn();

vi.mock('@/lib/server/auth/session', () => ({
  requireOwner: (returnTo: string) => requireOwner(returnTo),
}));
vi.mock('@/lib/server/services', () => ({
  getWebServices: async () => ({
    guildRegistry: { listAll },
    botActivity: { listAllCommandUsage },
    userDirectory: { lookup },
  }),
}));

const { default: OwnerServersPage } = await import('./page');

const OWNER = '300000000000000001';
const INVITER = '300000000000000002';

function guild(id: string, overrides: Partial<Guild> = {}): Guild {
  const date = new Date(Date.UTC(2026, 8, 1));
  return {
    id,
    name: `Server ${id}`,
    iconUrl: null,
    ownerId: OWNER,
    invitedById: INVITER,
    invitedVia: 'audit_log',
    joinedAt: date,
    isActive: true,
    createdAt: date,
    updatedAt: date,
    ...overrides,
  };
}

async function page(search: Record<string, string | string[] | undefined> = {}) {
  return render(await OwnerServersPage({ searchParams: Promise.resolve(search) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  listAll.mockResolvedValue([
    guild('a', { name: 'Alpha', iconUrl: 'https://cdn.discordapp.com/icons/a/hash.png' }),
    guild('b', { name: 'Beta Two', invitedById: null }),
    guild('old', { name: 'Gone', isActive: false }),
  ]);
  listAllCommandUsage.mockResolvedValue([
    { guildId: 'a', day: new Date().toISOString().slice(0, 10), commandName: 'play', count: 7 },
    { guildId: 'b', day: new Date().toISOString().slice(0, 10), commandName: 'ban', count: 2 },
  ]);
  lookup.mockResolvedValue(
    new Map([
      [OWNER, { id: OWNER, name: 'Owner Name', username: 'owner', avatarUrl: '' }],
      [INVITER, { id: INVITER, name: 'Inviter Name', username: 'inviter', avatarUrl: '' }],
    ]),
  );
});

describe('OwnerServersPage (TASK-1842)', () => {
  it('shows owner and inviter as "username (ID)" with the display name as the title', async () => {
    const html = await page();
    const titled = elements(html, 'span').filter((span) => span['title']);
    expect(titled.map((span) => span['title'])).toContain('Owner Name');
    expect(titled.map((span) => span['title'])).toContain('Inviter Name');
    expect(html).toContain(`owner (${OWNER})`);
    expect(html).toContain(`inviter (${INVITER})`);
  });

  it('shows only the ID when Discord cannot return the user', async () => {
    lookup.mockResolvedValue(new Map());
    const html = await page();
    const text = textOf(html);
    expect(text).toContain(OWNER);
    expect(text).not.toContain(`(${OWNER})`);
    expect(text).not.toContain(`(${INVITER})`);
    expect(elements(html, 'span').filter((span) => span['title'])).toHaveLength(0);
  });

  it('names how each inviter was learned', async () => {
    listAll.mockResolvedValue([
      guild('a', { invitedVia: 'oauth' }),
      guild('b', { invitedVia: 'audit_log' }),
      guild('c', { invitedVia: 'integration' }),
    ]);
    const text = textOf(await page());
    expect(text).toContain('via invite link');
    expect(text).toContain('via audit log');
    expect(text).toContain('via integrations');
    expect(text).not.toContain('Contact the owner');
  });

  it('says the owner is the contact when no inviter is known', async () => {
    const text = textOf(await page());
    expect(text).toContain('Unknown Contact the owner');
    expect(text).toContain('The owner is the contact for those servers');
  });
});

describe('OwnerServersPage (TASK-1832)', () => {
  it('checks the owner first, with its own path', async () => {
    await page();
    expect(requireOwner).toHaveBeenCalledWith('/owner/servers');
  });

  it('lists the servers with owner, inviter and usage, and keeps the page read-only', async () => {
    const html = await page();
    const text = textOf(html);

    expect(text).toContain('Servers Ririko is in (2)');
    expect(text).toContain('Alpha');
    expect(text).toContain(`owner (${OWNER})`);
    expect(text).toContain(`inviter (${INVITER})`);
    expect(text).toContain('Unknown');
    expect(text).toContain('Discord keeps the audit log for 45 days');
    expect(text).toContain('Servers Ririko has left (1)');
    expect(text).toContain('Commands run, last 30 days · all servers');
    expect(elements(html, 'form')).toHaveLength(0);
    expect(elements(html, 'button')).toHaveLength(0);
    expect(elements(html, 'details')).toHaveLength(1);
    expect(elements(html, 'details')[0]).not.toHaveProperty('open');
    expect(elements(html, 'a').map((a) => a['href'])).toContain('/owner/servers?guild=a');
  });

  it('shows one server when ?guild= names a listed server', async () => {
    const text = textOf(await page({ guild: 'b' }));
    expect(text).toContain('Commands run, last 30 days · Beta Two');
    expect(text).toContain('All servers');
  });

  it('ignores an unlisted ?guild= value', async () => {
    const text = textOf(await page({ guild: ['x', 'y'] }));
    expect(text).toContain('· all servers');
    expect(textOf(await page({ guild: 'nope' }))).toContain('· all servers');
  });

  it('says so when no server or command is recorded', async () => {
    listAll.mockResolvedValue([]);
    listAllCommandUsage.mockResolvedValue([]);
    const text = textOf(await page());
    expect(text).toContain('No servers are recorded yet');
    expect(text).toContain('No commands have been run in any server');
    expect(text).toContain('None yet.');
    expect(text).not.toContain('has left');
  });
});
