// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GUILD_NAV_GROUPS, GUILD_NAV_ITEMS } from '@/lib/dashboard-nav';

const nav = vi.hoisted(() => ({ pathname: '', push: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push }),
}));

const { GuildNav } = await import('./guild-nav');

const GUILD = '123';
const base = `/dashboard/${GUILD}`;

beforeEach(() => {
  nav.pathname = `${base}/tcg/achievements`;
  nav.push.mockReset();
});
afterEach(cleanup);

describe('GuildNav', () => {
  it('lists the links under one heading per group', () => {
    render(<GuildNav guildId={GUILD} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(GUILD_NAV_ITEMS.length);
    for (const group of GUILD_NAV_GROUPS) {
      const heading = screen.getByText(group.label, { selector: 'p' });
      expect(heading.closest('a')).toBeNull();
      const list = within(heading.parentElement as HTMLElement).getAllByRole('link');
      expect(list.map((link) => link.textContent)).toEqual(
        GUILD_NAV_ITEMS.filter((item) => item.group === group.id).map((item) => item.label),
      );
    }
  });

  it('marks only the longest matching page as current', () => {
    render(<GuildNav guildId={GUILD} />);
    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveProperty('textContent', 'TCG Achievements');
    expect(current[0]).toHaveProperty('pathname', `${base}/tcg/achievements`);
    const tcg = screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('href') === `${base}/tcg`);
    expect(tcg?.getAttribute('aria-current')).toBeNull();
  });

  it('marks a page when the path is below it', () => {
    nav.pathname = `${base}/reaction-roles/edit`;
    render(<GuildNav guildId={GUILD} />);
    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.textContent)).toEqual(['Reaction Roles']);
  });

  it('offers a labelled page picker with one option group per group', () => {
    render(<GuildNav guildId={GUILD} />);
    const picker = screen.getByRole('combobox', { name: 'Server settings page' });
    const groups = within(picker).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('label'))).toEqual(
      GUILD_NAV_GROUPS.map((group) => group.label),
    );
    expect(within(picker).getAllByRole('option')).toHaveLength(GUILD_NAV_ITEMS.length);
    const tcgGroup = groups[GUILD_NAV_GROUPS.findIndex((group) => group.id === 'tcg')]!;
    expect(
      within(tcgGroup)
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual([`${base}/tcg`, `${base}/tcg/achievements`]);
  });

  it('selects the current page in the picker', () => {
    render(<GuildNav guildId={GUILD} />);
    const picker = screen.getByRole('combobox') as HTMLSelectElement;
    expect(picker.value).toBe(`${base}/tcg/achievements`);
  });

  it('shows a placeholder when no page matches', () => {
    nav.pathname = '/servers';
    render(<GuildNav guildId={GUILD} />);
    const picker = screen.getByRole('combobox') as HTMLSelectElement;
    expect(picker.value).toBe('');
    expect(screen.getByRole('option', { name: 'Choose a page' })).toBeTruthy();
  });

  it('navigates to the chosen page', () => {
    render(<GuildNav guildId={GUILD} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: `${base}/music` } });
    expect(nav.push).toHaveBeenCalledWith(`${base}/music`);
  });
});
