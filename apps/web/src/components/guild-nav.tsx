'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { GUILD_NAV_GROUPS, GUILD_NAV_ITEMS } from '@/lib/dashboard-nav';

export function GuildNav({ guildId }: { guildId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const hrefOf = (slug: string) => `/dashboard/${guildId}/${slug}`;
  const inSection = (slug: string) => {
    const href = hrefOf(slug);
    return pathname === href || pathname.startsWith(`${href}/`);
  };
  // The longest matching slug wins, so `tcg/achievements` does not also light up `tcg`.
  const current = GUILD_NAV_ITEMS.filter((item) => inSection(item.slug)).sort(
    (a, b) => b.slug.length - a.slug.length,
  )[0]?.slug;
  return (
    <nav aria-label="Server settings">
      <div className="md:hidden">
        <label htmlFor="guild-nav-picker" className="sr-only">
          Server settings page
        </label>
        <select
          id="guild-nav-picker"
          value={current === undefined ? '' : hrefOf(current)}
          onChange={(event) => router.push(event.target.value)}
          className="w-full rounded-md border border-edge bg-ink px-3 py-2 text-sm text-zinc-200"
        >
          {current === undefined ? (
            <option value="" disabled>
              Choose a page
            </option>
          ) : null}
          {GUILD_NAV_GROUPS.map((group) => (
            <optgroup key={group.id} label={group.label}>
              {GUILD_NAV_ITEMS.filter((item) => item.group === group.id).map((item) => (
                <option key={item.slug} value={hrefOf(item.slug)}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="hidden flex-col gap-4 md:flex">
        {GUILD_NAV_GROUPS.map((group) => (
          <div key={group.id}>
            <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {GUILD_NAV_ITEMS.filter((item) => item.group === group.id).map((item) => {
                const active = item.slug === current;
                return (
                  <li key={item.slug}>
                    <Link
                      href={hrefOf(item.slug)}
                      aria-current={active ? 'page' : undefined}
                      className={`block rounded-md px-3 py-1.5 text-sm ${
                        active
                          ? 'bg-panel font-semibold text-white'
                          : 'text-zinc-400 hover:bg-panel hover:text-zinc-200'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
