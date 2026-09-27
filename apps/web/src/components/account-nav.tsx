import { TabNav } from './tab-nav';

const ACCOUNT_PAGES = [
  { href: '/account/security', label: 'Passkeys' },
  { href: '/account/sessions', label: 'Sessions' },
] as const;

/** Tabs for the account pages. */
export function AccountNav({ current }: { current: (typeof ACCOUNT_PAGES)[number]['href'] }) {
  return <TabNav label="Account" pages={ACCOUNT_PAGES} current={current} />;
}
