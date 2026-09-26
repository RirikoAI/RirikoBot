/** Guild dashboard pages, in sidebar order. Add an entry only when its page exists. */
export const GUILD_NAV_ITEMS = [
  { slug: 'overview', label: 'Overview' },
  { slug: 'general', label: 'General' },
  { slug: 'moderation', label: 'Moderation' },
  { slug: 'automod', label: 'AutoMod' },
  { slug: 'logging', label: 'Logging' },
  { slug: 'commands', label: 'Commands' },
  { slug: 'autoroles', label: 'Auto Roles' },
  { slug: 'autovoice', label: 'Auto Voice' },
  { slug: 'reaction-roles', label: 'Reaction Roles' },
  { slug: 'cases', label: 'Case Log' },
  { slug: 'audit-log', label: 'Audit Log' },
] as const;
