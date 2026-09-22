import type { CommandCategory } from '../command/types.js';

export interface CategoryInfo {
  readonly id: CommandCategory;
  readonly label: string;
  readonly emoji: string;
  readonly description: string;
}

export const CATEGORY_INFO: Record<CommandCategory, CategoryInfo> = {
  ai: {
    id: 'ai',
    label: 'AI Chatbot',
    emoji: '🤖',
    description: 'Multimodal AI chat, context-aware assistance, and safe tools',
  },
  music: {
    id: 'music',
    label: 'Music & Audio',
    emoji: '🎵',
    description: 'High-fidelity audio playback, queues, filters, and extractors',
  },
  moderation: {
    id: 'moderation',
    label: 'Moderation & Safety',
    emoji: '🛡️',
    description: 'Warnings, punishments, audit logs, auto-mod filters, and staff notes',
  },
  tcg: {
    id: 'tcg',
    label: 'Waifu TCG',
    emoji: '🎴',
    description: 'Card collecting, trading, marketplace, combat dungeons, and waifuguilds',
  },
  anime: {
    id: 'anime',
    label: 'Anime & Manga',
    emoji: '🌸',
    description: 'Anime, manga, and character lookups, waifu images, and wallpapers',
  },
  economy: {
    id: 'economy',
    label: 'Economy & Levels',
    emoji: '💰',
    description: 'Credits, transactional ledger, item shops, inventory, and leveling',
  },
  utility: {
    id: 'utility',
    label: 'Server Utilities',
    emoji: '⚙️',
    description: 'Server info, user profiles, diagnostics, reminders, and configuration',
  },
  streams: {
    id: 'streams',
    label: 'Stream Alerts',
    emoji: '📡',
    description: 'Twitch, YouTube, and TikTok live announcements and free game alerts',
  },
  games: {
    id: 'games',
    label: 'Interactive Games',
    emoji: '🎲',
    description: 'Mini-games, gambling, Tic-Tac-Toe, RPS, and wagering',
  },
  general: {
    id: 'general',
    label: 'General',
    emoji: '✨',
    description: 'General commands, bot latency, information, and help browser',
  },
  admin: {
    id: 'admin',
    label: 'Administration',
    emoji: '👑',
    description: 'Bot configuration, module toggles, and developer administration',
  },
};

export interface HelpOptions {
  defaultPrefix?: string | undefined;
  dashboardUrl?: string | undefined;
  supportServerUrl?: string | undefined;
  inviteUrl?: string | undefined;
  pageSize?: number | undefined;
}

export interface HelpViewState {
  view: 'home' | 'category' | 'command';
  category?: CommandCategory | undefined;
  page?: number | undefined;
  commandName?: string | undefined;
}
