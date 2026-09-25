import type * as sqlite from '../sqlite/index.js';

// Core Identity
export type User = typeof sqlite.users.$inferSelect;
export type NewUser = typeof sqlite.users.$inferInsert;
export type Guild = typeof sqlite.guilds.$inferSelect;
export type NewGuild = typeof sqlite.guilds.$inferInsert;
export type GuildMember = typeof sqlite.guildMembers.$inferSelect;
export type NewGuildMember = typeof sqlite.guildMembers.$inferInsert;
export type GuildSettings = typeof sqlite.guildSettings.$inferSelect;
export type NewGuildSettings = typeof sqlite.guildSettings.$inferInsert;

// Commands
export type Command = typeof sqlite.commands.$inferSelect;
export type CommandSettings = typeof sqlite.commandSettings.$inferSelect;

// Moderation
export type ModerationCase = typeof sqlite.moderationCases.$inferSelect;
export type NewModerationCase = typeof sqlite.moderationCases.$inferInsert;
export type ModerationWarning = typeof sqlite.moderationWarnings.$inferSelect;
export type NewModerationWarning = typeof sqlite.moderationWarnings.$inferInsert;
export type ModerationRule = typeof sqlite.moderationRules.$inferSelect;
export type NewModerationRule = typeof sqlite.moderationRules.$inferInsert;
export type ModerationNote = typeof sqlite.moderationNotes.$inferSelect;
export type NewModerationNote = typeof sqlite.moderationNotes.$inferInsert;

// Economy & Banking
export type EconomyAccount = typeof sqlite.economyAccounts.$inferSelect;
export type NewEconomyAccount = typeof sqlite.economyAccounts.$inferInsert;
export type EconomyBalance = typeof sqlite.economyBalances.$inferSelect;
export type NewEconomyBalance = typeof sqlite.economyBalances.$inferInsert;
export type EconomyTransaction = typeof sqlite.economyTransactions.$inferSelect;
export type NewEconomyTransaction = typeof sqlite.economyTransactions.$inferInsert;
export type EconomyItem = typeof sqlite.economyItems.$inferSelect;
export type NewEconomyItem = typeof sqlite.economyItems.$inferInsert;
export type EconomyInventory = typeof sqlite.economyInventories.$inferSelect;
export type NewEconomyInventory = typeof sqlite.economyInventories.$inferInsert;
export type EconomyCooldown = typeof sqlite.economyCooldowns.$inferSelect;
export type NewEconomyCooldown = typeof sqlite.economyCooldowns.$inferInsert;

// Experience & Leveling
export type XpAccount = typeof sqlite.xpAccounts.$inferSelect;
export type NewXpAccount = typeof sqlite.xpAccounts.$inferInsert;
export type XpEvent = typeof sqlite.xpEvents.$inferSelect;
export type NewXpEvent = typeof sqlite.xpEvents.$inferInsert;
export type LeaderboardSnapshot = typeof sqlite.leaderboardSnapshots.$inferSelect;
export type NewLeaderboardSnapshot = typeof sqlite.leaderboardSnapshots.$inferInsert;

// Music & Audio
export type MusicGuildSettings = typeof sqlite.musicGuildSettings.$inferSelect;
export type NewMusicGuildSettings = typeof sqlite.musicGuildSettings.$inferInsert;
export type MusicChannel = typeof sqlite.musicChannels.$inferSelect;
export type NewMusicChannel = typeof sqlite.musicChannels.$inferInsert;
export type MusicHistory = typeof sqlite.musicHistory.$inferSelect;
export type NewMusicHistory = typeof sqlite.musicHistory.$inferInsert;
export type MusicPlaylist = typeof sqlite.musicSavedPlaylists.$inferSelect;
export type NewMusicPlaylist = typeof sqlite.musicSavedPlaylists.$inferInsert;
export type MusicTrack = typeof sqlite.musicPlaylistTracks.$inferSelect;
export type NewMusicTrack = typeof sqlite.musicPlaylistTracks.$inferInsert;

// AI Chatbot
export type AiChannel = typeof sqlite.aiChannels.$inferSelect;
export type NewAiChannel = typeof sqlite.aiChannels.$inferInsert;
export type AiConversation = typeof sqlite.aiConversations.$inferSelect;
export type NewAiConversation = typeof sqlite.aiConversations.$inferInsert;
export type AiMessage = typeof sqlite.aiMessages.$inferSelect;
export type NewAiMessage = typeof sqlite.aiMessages.$inferInsert;
export type AiGuildPreferences = typeof sqlite.aiGuildPreferences.$inferSelect;
export type NewAiGuildPreferences = typeof sqlite.aiGuildPreferences.$inferInsert;
export type AiUserPreferences = typeof sqlite.aiUserPreferences.$inferSelect;
export type NewAiUserPreferences = typeof sqlite.aiUserPreferences.$inferInsert;

// Images & Graphics
export type ImageJob = typeof sqlite.imageJobs.$inferSelect;
export type NewImageJob = typeof sqlite.imageJobs.$inferInsert;
export type ImagePreset = typeof sqlite.imagePresets.$inferSelect;
export type NewImagePreset = typeof sqlite.imagePresets.$inferInsert;
export type ImageProvider = typeof sqlite.imageProviders.$inferSelect;
export type NewImageProvider = typeof sqlite.imageProviders.$inferInsert;
export type ImageUsage = typeof sqlite.imageUsage.$inferSelect;
export type NewImageUsage = typeof sqlite.imageUsage.$inferInsert;

// Giveaways
export type Giveaway = typeof sqlite.giveaways.$inferSelect;
export type NewGiveaway = typeof sqlite.giveaways.$inferInsert;
export type GiveawayEntry = typeof sqlite.giveawayEntries.$inferSelect;
export type NewGiveawayEntry = typeof sqlite.giveawayEntries.$inferInsert;
export type GiveawayWinner = typeof sqlite.giveawayWinners.$inferSelect;
export type NewGiveawayWinner = typeof sqlite.giveawayWinners.$inferInsert;

// Stream Platforms
export type Streamer = typeof sqlite.streamers.$inferSelect;
export type NewStreamer = typeof sqlite.streamers.$inferInsert;
export type StreamSubscription = typeof sqlite.streamSubscriptions.$inferSelect;
export type NewStreamSubscription = typeof sqlite.streamSubscriptions.$inferInsert;
export type StreamEvent = typeof sqlite.streamEvents.$inferSelect;
export type NewStreamEvent = typeof sqlite.streamEvents.$inferInsert;
export type StreamAnnouncement = typeof sqlite.streamAnnouncements.$inferSelect;
export type NewStreamAnnouncement = typeof sqlite.streamAnnouncements.$inferInsert;
export type StreamAsset = typeof sqlite.streamAssets.$inferSelect;
export type NewStreamAsset = typeof sqlite.streamAssets.$inferInsert;

// Free Games
export type FreeGame = typeof sqlite.freeGames.$inferSelect;
export type NewFreeGame = typeof sqlite.freeGames.$inferInsert;
export type FreeGameAnnouncement = typeof sqlite.freeGameAnnouncements.$inferSelect;
export type NewFreeGameAnnouncement = typeof sqlite.freeGameAnnouncements.$inferInsert;
export type FreeGameChannel = typeof sqlite.freeGameChannels.$inferSelect;
export type NewFreeGameChannel = typeof sqlite.freeGameChannels.$inferInsert;

// Waifu TCG & Gamification
export type WaifuSource = typeof sqlite.waifuSources.$inferSelect;
export type NewWaifuSource = typeof sqlite.waifuSources.$inferInsert;
export type WaifuAsset = typeof sqlite.waifuAssets.$inferSelect;
export type NewWaifuAsset = Omit<typeof sqlite.waifuAssets.$inferInsert, 'id'> & { id?: string };
export type WaifuCard = typeof sqlite.waifuCards.$inferSelect;
export type NewWaifuCard = Omit<typeof sqlite.waifuCards.$inferInsert, 'id'> & { id?: string };
export type UserCard = typeof sqlite.userCards.$inferSelect;
export type NewUserCard = Omit<typeof sqlite.userCards.$inferInsert, 'id'> & { id?: string };
export type GameItem = typeof sqlite.gameItems.$inferSelect;
export type NewGameItem = Omit<typeof sqlite.gameItems.$inferInsert, 'id'> & { id?: string };
export type UserInventoryItem = typeof sqlite.userInventoryItems.$inferSelect;
export type NewUserInventoryItem = Omit<typeof sqlite.userInventoryItems.$inferInsert, 'id'> & {
  id?: string;
};
export type PlayerEnergy = typeof sqlite.playerEnergy.$inferSelect;
export type NewPlayerEnergy = typeof sqlite.playerEnergy.$inferInsert;
export type GameAchievement = typeof sqlite.gameAchievements.$inferSelect;
export type NewGameAchievement = Omit<typeof sqlite.gameAchievements.$inferInsert, 'id'> & {
  id?: string;
};
export type UserAchievement = typeof sqlite.userAchievements.$inferSelect;
export type NewUserAchievement = Omit<typeof sqlite.userAchievements.$inferInsert, 'id'> & {
  id?: string;
};
export type DungeonSeason = typeof sqlite.dungeonSeasons.$inferSelect;
export type NewDungeonSeason = typeof sqlite.dungeonSeasons.$inferInsert;
export type DungeonFloor = typeof sqlite.dungeonFloors.$inferSelect;
export type NewDungeonFloor = Omit<typeof sqlite.dungeonFloors.$inferInsert, 'id'> & {
  id?: string;
};
export type DungeonBoss = typeof sqlite.dungeonBosses.$inferSelect;
export type NewDungeonBoss = typeof sqlite.dungeonBosses.$inferInsert;
export type UserDungeonProgress = typeof sqlite.userDungeonProgress.$inferSelect;
export type NewUserDungeonProgress = Omit<typeof sqlite.userDungeonProgress.$inferInsert, 'id'> & {
  id?: string;
};
export type CardTrade = typeof sqlite.cardTrades.$inferSelect;
export type NewCardTrade = Omit<typeof sqlite.cardTrades.$inferInsert, 'id'> & { id?: string };
export type MarketListing = typeof sqlite.marketListings.$inferSelect;
export type NewMarketListing = Omit<typeof sqlite.marketListings.$inferInsert, 'id'> & {
  id?: string;
};
export type WaifuGuild = typeof sqlite.waifuGuilds.$inferSelect;
export type NewWaifuGuild = Omit<typeof sqlite.waifuGuilds.$inferInsert, 'id'> & { id?: string };
export type WaifuGuildMember = typeof sqlite.waifuGuildMembers.$inferSelect;
export type NewWaifuGuildMember = typeof sqlite.waifuGuildMembers.$inferInsert;
export type Quest = typeof sqlite.quests.$inferSelect;
export type NewQuest = Omit<typeof sqlite.quests.$inferInsert, 'id'> & { id?: string };
export type Boss = typeof sqlite.bosses.$inferSelect;
export type NewBoss = Omit<typeof sqlite.bosses.$inferInsert, 'id'> & { id?: string };
export type BossRun = typeof sqlite.bossRuns.$inferSelect;
export type NewBossRun = Omit<typeof sqlite.bossRuns.$inferInsert, 'id'> & { id?: string };
export type TcgSystemConfig = typeof sqlite.tcgSystemConfigs.$inferSelect;
export type NewTcgSystemConfig = typeof sqlite.tcgSystemConfigs.$inferInsert;

// Mini-Games
export type MiniGame = typeof sqlite.miniGames.$inferSelect;
export type GameSession = typeof sqlite.gameSessions.$inferSelect;
export type GameStatistic = typeof sqlite.gameStatistics.$inferSelect;

// Utilities & Reminders
export type ReactionRole = typeof sqlite.reactionRoles.$inferSelect;
export type NewReactionRole = Omit<typeof sqlite.reactionRoles.$inferInsert, 'id'> & {
  id?: string;
};
export type GuildAutoRole = typeof sqlite.guildAutoRoles.$inferSelect;
export type NewGuildAutoRole = typeof sqlite.guildAutoRoles.$inferInsert;
export type TemporaryRole = typeof sqlite.temporaryRoles.$inferSelect;
export type NewTemporaryRole = Omit<typeof sqlite.temporaryRoles.$inferInsert, 'id'> & {
  id?: string;
};
export type AutoVoiceConfig = typeof sqlite.autoVoiceConfigs.$inferSelect;
export type NewAutoVoiceConfig = Omit<typeof sqlite.autoVoiceConfigs.$inferInsert, 'id'> & {
  id?: string;
};
export type AutoVoiceChannel = typeof sqlite.autoVoiceChannels.$inferSelect;
export type NewAutoVoiceChannel = typeof sqlite.autoVoiceChannels.$inferInsert;
export type Reminder = typeof sqlite.reminders.$inferSelect;
export type NewReminder = typeof sqlite.reminders.$inferInsert;
export type WelcomeConfig = typeof sqlite.guildWelcomer.$inferSelect;
export type FarewellConfig = typeof sqlite.guildFarewell.$inferSelect;
export type AuditLog = typeof sqlite.auditLogs.$inferSelect;
export type NewAuditLog = Omit<typeof sqlite.auditLogs.$inferInsert, 'id' | 'createdAt'>;

// Web Dashboard
export type WebSession = typeof sqlite.webSessions.$inferSelect;
export type NewWebSession = typeof sqlite.webSessions.$inferInsert;
export type WebPasskey = typeof sqlite.webPasskeys.$inferSelect;
export type NewWebPasskey = typeof sqlite.webPasskeys.$inferInsert;
export type WebKnownDevice = typeof sqlite.webKnownDevices.$inferSelect;

// Guild Config Change Feed
export type GuildConfigVersion = typeof sqlite.guildConfigVersions.$inferSelect;

// Bot Activity (dashboard overview, TASK-1131)
export type CommandUsageDaily = typeof sqlite.commandUsageDaily.$inferSelect;
export type BotStatus = typeof sqlite.botStatus.$inferSelect;
export type GuildVoiceActivity = typeof sqlite.guildVoiceActivity.$inferSelect;
export type VoiceChannelActivity = GuildVoiceActivity['channels'][number];
