import type * as sqlite from '../schema/sqlite/index.js';

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
  id: string | number;
  name: string;
  value: string;
  guildId: string;
}

export interface LegacyUserNote {
  id: string | number;
  note: string;
  createdBy: string;
  userId: string;
  guildId?: string | null;
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
}

export interface LegacyVoiceChannel {
  id: string;
  name: string;
  parentId?: string | null;
  guildId: string;
}

export interface LegacyMusicChannel {
  id: string;
  name: string;
  guildId: string;
}

export interface LegacyPlaylist {
  id: number | string;
  name: string;
  userId?: string | null;
  author?: string | null;
  authorTag?: string | null;
  public?: boolean | number | null;
  plays?: number | null;
  guildId?: string | null;
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
}

export interface LegacyTrack {
  id: number | string;
  name: string;
  url: string;
  playlistId: number | string;
}

export interface LegacyStreamSubscription {
  id: string | number;
  twitchUserId: string;
  channelId: string;
  guildId: string;
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
  id: string | number;
  messageId: string;
  emoji: string;
  roleId: string;
  guildId: string;
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
  id: string;
  name: string;
  price: number;
  description: string;
  rarity?: number | null;
  hidden?: boolean | number | null;
  purchaseLimit?: number | null;
  purchasable?: boolean | number | null;
  sellable?: boolean | number | null;
  findable?: boolean | number | null;
  imageUrl?: string | null;
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
  categoryId?: string | null;
}

export interface LegacyItemCategory {
  id: string;
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
