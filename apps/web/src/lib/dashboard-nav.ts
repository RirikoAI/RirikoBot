/** Guild dashboard pages, in sidebar order. Add an entry only when its page exists. */
export const GUILD_NAV_ITEMS = [
  { slug: 'general', label: 'General' },
  { slug: 'moderation', label: 'Moderation' },
  { slug: 'automod', label: 'AutoMod' },
  { slug: 'logging', label: 'Logging' },
] as const;
