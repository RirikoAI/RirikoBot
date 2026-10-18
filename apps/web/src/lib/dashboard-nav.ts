/** Sidebar groups for the guild dashboard, in display order. */
export const GUILD_NAV_GROUPS = [
  { id: 'server', label: 'Server' },
  { id: 'moderation', label: 'Moderation' },
  { id: 'members', label: 'Members' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'tcg', label: 'Waifu TCG' },
  { id: 'features', label: 'Features' },
] as const;

export type GuildNavGroupId = (typeof GUILD_NAV_GROUPS)[number]['id'];

/**
 * Guild dashboard pages, in sidebar order: each group's pages are contiguous, in group order.
 * Add an entry only when its page exists.
 */
export const GUILD_NAV_ITEMS = [
  { slug: 'overview', label: 'Overview', group: 'server' },
  { slug: 'general', label: 'General', group: 'server' },
  { slug: 'commands', label: 'Commands', group: 'server' },
  { slug: 'integrations', label: 'Integrations', group: 'server' },
  { slug: 'moderation', label: 'Moderation', group: 'moderation' },
  { slug: 'automod', label: 'AutoMod', group: 'moderation' },
  { slug: 'logging', label: 'Logging', group: 'moderation' },
  { slug: 'cases', label: 'Case Log', group: 'moderation' },
  { slug: 'audit-log', label: 'Audit Log', group: 'moderation' },
  { slug: 'autoroles', label: 'Auto Roles', group: 'members' },
  { slug: 'reaction-roles', label: 'Reaction Roles', group: 'members' },
  { slug: 'autovoice', label: 'Auto Voice', group: 'members' },
  { slug: 'welcome', label: 'Welcome Card', group: 'members' },
  { slug: 'farewell', label: 'Farewell Card', group: 'members' },
  { slug: 'xp', label: 'XP & Ranking', group: 'engagement' },
  { slug: 'games', label: 'Games', group: 'engagement' },
  { slug: 'giveaways', label: 'Giveaways', group: 'engagement' },
  { slug: 'tcg', label: 'Waifu TCG', group: 'tcg' },
  { slug: 'tcg/achievements', label: 'TCG Achievements', group: 'tcg' },
  { slug: 'music', label: 'Music', group: 'features' },
  { slug: 'ai', label: 'AI Chatbot', group: 'features' },
  { slug: 'images', label: 'Image Generation', group: 'features' },
  { slug: 'streams', label: 'Stream Alerts', group: 'features' },
  { slug: 'freegames', label: 'Free Games', group: 'features' },
] as const satisfies readonly { slug: string; label: string; group: GuildNavGroupId }[];
