import { TabNav } from './tab-nav';

const OWNER_PAGES = [
  { href: '/owner/economy', label: 'Economy' },
  { href: '/owner/shop', label: 'Item shop' },
] as const;

/** Tabs for the owner console pages. */
export function OwnerNav({ current }: { current: (typeof OWNER_PAGES)[number]['href'] }) {
  return <TabNav label="Owner console" pages={OWNER_PAGES} current={current} />;
}
