import type * as sqlite from '../schema/sqlite/index.js';

// Legacy row shapes follow the real 1.4.0 schema in __fixtures__/legacy-1.4.0-schema.sql. SQLite
// returns booleans as 0 or 1 and dates as UTC text (see parseLegacyDate).

export interface LegacyUser {
  id: string;
  username: string;
  displayName?: string | null;
  backgroundImageURL?: string | null;
  karma?: number | null;
  coins?: number | null;
  pointsSuspended?: boolean | number | null;
  commandsSuspended?: boolean | number | null;
  doNotNotifyOnLevelUp?: boolean | number | null;
  warns?: number | null;
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
}

export interface LegacyGuild {
  id: string;
  name: string;
  prefix?: string | null;
}

export interface LegacyGuildConfig {
  id: number;
  name: string;
  value: string;
  guildId: string | null;
}

export interface LegacyUserNote {
  id: number;
  note: string;
  createdBy: string;
  userId: string | null;
  guildId?: string | null;
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
}

export interface LegacyVoiceChannel {
  id: string;
  name: string;
  parentId?: string | null;
  guildId: string | null;
}

export interface LegacyMusicChannel {
  id: string;
  name: string;
  guildId: string | null;
}

export interface LegacyPlaylist {
  id: number;
  name: string;
  userId: string;
  author: string;
  authorTag: string;
  public: number;
  plays: number;
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
}

export interface LegacyTrack {
  id: number;
  name: string;
  url: string;
  playlistId: number | null;
}

export interface LegacyStreamSubscription {
  id: number;
  twitchUserId: string;
  channelId: string;
  guildId: string | null;
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
}

export interface LegacyStreamNotification {
  id: string | number;
  twitchUserId: string;
  channelId: string;
  streamId: string;
  notified?: boolean | number | null;
  guildId: string;
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
}

export interface LegacyTwitchStreamer {
  twitchUserId: string;
  isLive?: boolean | number | null;
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
}

export interface LegacyReactionRole {
  id: number;
  messageId: string;
  emoji: string;
  roleId: string;
  guildId: string | null;
}

export interface LegacyReminder {
  id: string;
  userId: string;
  channelId: string;
  guildId?: string | null;
  message: string;
  scheduledTime: string | number | Date;
  sent?: boolean | number | null;
  timezone?: string | null;
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
}

export interface LegacyFreeGameNotification {
  id: string | number;
  gameId: string;
  gameName: string;
  source: string;
  notified?: boolean | number | null;
  guildId: string;
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
}

export interface LegacyItem {
  id: number;
  name: string;
  price: number;
  description: string;
  rarity: number;
  hidden: number;
  purchaseLimit: number;
  purchasable: number;
  sellable: number;
  findable: number;
  imageUrl: string;
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
  categoryId: number | null;
}

export interface LegacyItemCategory {
  id: number;
  name: string;
}

export interface InspectionSummary {
  tables: Record<string, number>;
  totalCoins: bigint;
  totalKarma: bigint;
  totalUsers: number;
  totalGuilds: number;
  anomalies: string[];
}

export interface TransformedData {
  users: (typeof sqlite.users.$inferInsert)[];
  economyBalances: (typeof sqlite.economyBalances.$inferInsert)[];
  economyTransactions: (typeof sqlite.economyTransactions.$inferInsert)[];
  xpAccounts: (typeof sqlite.xpAccounts.$inferInsert)[];
  guilds: (typeof sqlite.guilds.$inferInsert)[];
  guildSettings: (typeof sqlite.guildSettings.$inferInsert)[];
  moderationNotes: (typeof sqlite.moderationNotes.$inferInsert)[];
  musicChannels: (typeof sqlite.musicChannels.$inferInsert)[];
  musicSavedPlaylists: (typeof sqlite.musicSavedPlaylists.$inferInsert)[];
  musicPlaylistTracks: (typeof sqlite.musicPlaylistTracks.$inferInsert)[];
  streamSubscriptions: (typeof sqlite.streamSubscriptions.$inferInsert)[];
  streamers: (typeof sqlite.streamers.$inferInsert)[];
  streamEvents: (typeof sqlite.streamEvents.$inferInsert)[];
  reactionRoles: (typeof sqlite.reactionRoles.$inferInsert)[];
  reminders: (typeof sqlite.reminders.$inferInsert)[];
  freeGameAnnouncements: (typeof sqlite.freeGameAnnouncements.$inferInsert)[];
  economyItemCategories: (typeof sqlite.economyItemCategories.$inferInsert)[];
  economyItems: (typeof sqlite.economyItems.$inferInsert)[];
  autoVoiceConfigs: (typeof sqlite.autoVoiceConfigs.$inferInsert)[];
}

export interface MigrationResult {
  batchId: string;
  isDryRun: boolean;
  inspected: InspectionSummary;
  migratedCounts: Record<string, number>;
  coinsConserved: boolean;
  totalCoinsMigrated: bigint;
  durationMs: number;
}
