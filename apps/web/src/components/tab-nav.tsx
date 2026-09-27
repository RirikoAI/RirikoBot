import Link from 'next/link';

export interface TabNavPage {
  href: string;
  label: string;
}

/** Tabs between the pages of one section (account, owner console). */
export function TabNav({
  label,
  pages,
  current,
}: {
  label: string;
  pages: readonly TabNavPage[];
  current: string;
}) {
  return (
    <nav aria-label={label} className="flex gap-2 border-b border-edge">
      {pages.map((page) => (
        <Link
          key={page.href}
          href={page.href}
          aria-current={page.href === current ? 'page' : undefined}
          className={
            page.href === current
              ? '-mb-px border-b-2 border-sakura px-3 py-2 text-sm font-medium text-zinc-100'
              : 'px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200'
          }
        >
          {page.label}
        </Link>
      ))}
    </nav>
  );
}
