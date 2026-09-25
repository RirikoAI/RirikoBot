import Link from 'next/link';

const ACCOUNT_PAGES = [
  { href: '/account/security', label: 'Passkeys' },
  { href: '/account/sessions', label: 'Sessions' },
] as const;

/** Tabs for the account pages. */
export function AccountNav({ current }: { current: (typeof ACCOUNT_PAGES)[number]['href'] }) {
  return (
    <nav aria-label="Account" className="flex gap-2 border-b border-edge">
      {ACCOUNT_PAGES.map((page) => (
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
