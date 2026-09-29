'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GUILD_NAV_ITEMS } from '@/lib/dashboard-nav';

export function GuildNav({ guildId }: { guildId: string }) {
  const pathname = usePathname();
  const inSection = (slug: string) => {
    const href = `/dashboard/${guildId}/${slug}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  };
  // The longest matching slug wins, so `tcg/achievements` does not also light up `tcg`.
  const current = GUILD_NAV_ITEMS.filter((item) => inSection(item.slug)).sort(
    (a, b) => b.slug.length - a.slug.length,
  )[0]?.slug;
  return (
    <nav aria-label="Server settings">
      <ul className="flex gap-1 overflow-x-auto md:flex-col">
        {GUILD_NAV_ITEMS.map((item) => {
          const href = `/dashboard/${guildId}/${item.slug}`;
          const active = item.slug === current;
          return (
            <li key={item.slug}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`block rounded-md px-3 py-2 text-sm ${
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
    </nav>
  );
}
