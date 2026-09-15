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
export type ModerationRule = typeof sqlite.moderationRules.$inferSelect;
export type ModerationNote = typeof sqlite.moderationNotes.$inferSelect;

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
export type MusicChannel = typeof sqlite.musicChannels.$inferSelect;
export type MusicHistory = typeof sqlite.musicHistory.$inferSelect;
export type MusicPlaylist = typeof sqlite.musicSavedPlaylists.$inferSelect;
export type MusicTrack = typeof sqlite.musicPlaylistTracks.$inferSelect;

// AI Chatbot
export type AiConversation = typeof sqlite.aiConversations.$inferSelect;
export type NewAiConversation = typeof sqlite.aiConversations.$inferInsert;
export type AiMessage = typeof sqlite.aiMessages.$inferSelect;
export type NewAiMessage = typeof sqlite.aiMessages.$inferInsert;
export type AiGuildPreferences = typeof sqlite.aiGuildPreferences.$inferSelect;
export type AiUserPreferences = typeof sqlite.aiUserPreferences.$inferSelect;

// Images & Graphics
export type ImageJob = typeof sqlite.imageJobs.$inferSelect;
export type NewImageJob = typeof sqlite.imageJobs.$inferInsert;
export type ImagePreset = typeof sqlite.imagePresets.$inferSelect;

// Giveaways
export type Giveaway = typeof sqlite.giveaways.$inferSelect;
export type NewGiveaway = typeof sqlite.giveaways.$inferInsert;
export type GiveawayEntry = typeof sqlite.giveawayEntries.$inferSelect;
export type GiveawayWinner = typeof sqlite.giveawayWinners.$inferSelect;

// Stream Platforms
export type Streamer = typeof sqlite.streamers.$inferSelect;
export type StreamSubscription = typeof sqlite.streamSubscriptions.$inferSelect;
export type StreamEvent = typeof sqlite.streamEvents.$inferSelect;
export type StreamAnnouncement = typeof sqlite.streamAnnouncements.$inferSelect;

// Free Games
export type FreeGame = typeof sqlite.freeGames.$inferSelect;
export type FreeGameAnnouncement = typeof sqlite.freeGameAnnouncements.$inferSelect;

// Waifu TCG & Gamification
export type WaifuSource = typeof sqlite.waifuSources.$inferSelect;
export type WaifuAsset = typeof sqlite.waifuAssets.$inferSelect;
export type WaifuCard = typeof sqlite.waifuCards.$inferSelect;
export type UserCard = typeof sqlite.userCards.$inferSelect;
export type NewUserCard = typeof sqlite.userCards.$inferInsert;
export type GameItem = typeof sqlite.gameItems.$inferSelect;
export type UserInventoryItem = typeof sqlite.userInventoryItems.$inferSelect;
export type PlayerEnergy = typeof sqlite.playerEnergy.$inferSelect;
export type NewPlayerEnergy = typeof sqlite.playerEnergy.$inferInsert;
export type GameAchievement = typeof sqlite.gameAchievements.$inferSelect;
export type UserAchievement = typeof sqlite.userAchievements.$inferSelect;
export type DungeonSeason = typeof sqlite.dungeonSeasons.$inferSelect;
export type DungeonFloor = typeof sqlite.dungeonFloors.$inferSelect;
export type UserDungeonProgress = typeof sqlite.userDungeonProgress.$inferSelect;
export type CardTrade = typeof sqlite.cardTrades.$inferSelect;
export type MarketListing = typeof sqlite.marketListings.$inferSelect;
export type WaifuGuild = typeof sqlite.waifuGuilds.$inferSelect;
export type WaifuGuildMember = typeof sqlite.waifuGuildMembers.$inferSelect;
export type Quest = typeof sqlite.quests.$inferSelect;
export type Boss = typeof sqlite.bosses.$inferSelect;
export type BossRun = typeof sqlite.bossRuns.$inferSelect;

// Mini-Games
export type MiniGame = typeof sqlite.miniGames.$inferSelect;
export type GameSession = typeof sqlite.gameSessions.$inferSelect;
export type GameStatistic = typeof sqlite.gameStatistics.$inferSelect;

// Utilities & Reminders
export type ReactionRole = typeof sqlite.reactionRoles.$inferSelect;
export type AutoVoiceConfig = typeof sqlite.autoVoiceConfigs.$inferSelect;
export type Reminder = typeof sqlite.reminders.$inferSelect;
export type NewReminder = typeof sqlite.reminders.$inferInsert;
export type WelcomeConfig = typeof sqlite.welcomeConfigs.$inferSelect;
export type FarewellConfig = typeof sqlite.farewellConfigs.$inferSelect;
export type AuditLog = typeof sqlite.auditLogs.$inferSelect;
