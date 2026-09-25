'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GUILD_NAV_ITEMS } from '@/lib/dashboard-nav';

export function GuildNav({ guildId }: { guildId: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Server settings">
      <ul className="flex gap-1 overflow-x-auto md:flex-col">
        {GUILD_NAV_ITEMS.map((item) => {
          const href = `/dashboard/${guildId}/${item.slug}`;
          const active = pathname === href;
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
