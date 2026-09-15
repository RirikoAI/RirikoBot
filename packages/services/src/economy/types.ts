/**
 * Standard economy event types matching Section 33 of BLUEPRINT.md
 * and Section 2 of docs/economy.md.
 */
export enum EconomyEventType {
  MESSAGE_SENT = 'MESSAGE_SENT',
  VOICE_MINUTE = 'VOICE_MINUTE',
  ATTACHMENT_UPLOADED = 'ATTACHMENT_UPLOADED',
  GAME_WON = 'GAME_WON',
  GAME_LOST = 'GAME_LOST',
  QUEST_COMPLETE = 'QUEST_COMPLETE',
  CARD_DROPPED = 'CARD_DROPPED',
  CARD_CLAIMED = 'CARD_CLAIMED',
  CARD_SOLD = 'CARD_SOLD',
  DAILY_REWARD = 'DAILY_REWARD',
  ACHIEVEMENT_UNLOCKED = 'ACHIEVEMENT_UNLOCKED',
  ACHIEVEMENT_CLAIMED = 'ACHIEVEMENT_CLAIMED',
  SHOP_PURCHASE = 'SHOP_PURCHASE',
  CONSUMABLE_USED = 'CONSUMABLE_USED',
}

/**
 * Standard event payload published across bot modules to reward user actions.
 */
export interface EconomyEvent {
  type: EconomyEventType | string;
  userId: string;
  guildId?: string | undefined;
  source: string;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Standard metadata when publishing a MESSAGE_SENT economy event.
 */
export interface MessageActivityMetadata {
  content: string;
  hasAttachments?: boolean | undefined;
  timestamp?: number | undefined;
}

/**
 * Configuration options for the Anti-Spam Evaluator.
 */
export interface AntiSpamConfig {
  cooldownSeconds?: number | undefined;
  similarityThreshold?: number | undefined;
  minContentLength?: number | undefined;
  historyDepth?: number | undefined;
  burstIntervalVarianceMinMs?: number | undefined;
  burstThresholdCount?: number | undefined;
  shadowCooldownMs?: number | undefined;
}

/**
 * Result of evaluating a user message against anti-spam heuristics.
 */
export type AntiSpamRejectionReason =
  | 'COOLDOWN'
  | 'SIMILARITY_EXCEEDED'
  | 'MIN_LENGTH'
  | 'AUTOMATED_BURST'
  | 'SHADOW_COOLDOWN';

export interface AntiSpamEvaluation {
  isAllowed: boolean;
  reason?: AntiSpamRejectionReason | undefined;
  details?: string | undefined;
}

/**
 * Base reward configuration for economy event types.
 */
export interface RewardRule {
  credits: number;
  xp: number;
  cooldownSeconds?: number | undefined;
}

/**
 * Result of processing an EconomyEvent through EconomyService.
 */
export interface RewardResult {
  awarded: boolean;
  reason?: string | undefined;
  credits: number;
  xp: number;
  walletBalance?: number | bigint | undefined;
  bankBalance?: number | bigint | undefined;
  netWorth?: number | bigint | undefined;
  transactionId?: string | undefined;
}

/**
 * Voice channel participant state for anti-AFK XP tracking.
 */
export interface VoiceParticipant {
  userId: string;
  guildId: string;
  channelId: string;
  isBot?: boolean | undefined;
  isSelfMuted?: boolean | undefined;
  isSelfDeafened?: boolean | undefined;
  isServerMuted?: boolean | undefined;
  isServerDeafened?: boolean | undefined;
  joinedAt?: number | undefined;
}

/**
 * Configuration options for the Voice Anti-AFK Accumulator.
 */
export interface VoiceTrackerConfig {
  /**
   * Minimum active human participants in a voice channel to satisfy quorum. Default: 2.
   */
  minQuorum?: number | undefined;
  /**
   * Discrete interval in seconds required to award a VOICE_MINUTE event. Default: 60s.
   */
  intervalSeconds?: number | undefined;
  /**
   * Set or list of channel IDs designated as AFK channels that are hard-excluded from XP accrual.
   */
  afkChannelIds?: string[] | Set<string> | undefined;
}

/**
 * Result of a discrete voice accrual tick.
 */
export interface VoiceTickResult {
  evaluatedChannels: number;
  activeParticipants: number;
  eligibleParticipants: number;
  awardedEvents: EconomyEvent[];
  rewardResults?: RewardResult[] | undefined;
}

/**
 * Result of claiming a daily reward.
 */
export interface DailyClaimResult {
  success: boolean;
  reason?: string | undefined;
  creditsAwarded: number;
  streak: number;
  multiplier: number;
  nextClaimAt?: Date | undefined;
  graceExpiresAt?: Date | undefined;
  wasReset: boolean;
  walletBalance?: number | bigint | undefined;
  transactionId?: string | undefined;
}

/**
 * Daily claim status inspection for a user.
 */
export interface DailyStatus {
  canClaim: boolean;
  isFrozen: boolean;
  currentStreak: number;
  nextStreak: number;
  multiplier: number;
  rewardCredits: number;
  lastDailyAt: Date | null;
  timeUntilNextClaimMs: number;
  timeUntilResetMs: number;
}

/**
 * Result of a bank deposit or withdrawal operation.
 */
export interface BankingOperationResult {
  success: boolean;
  reason?: string | undefined;
  amount: number;
  walletBalance?: number | bigint | undefined;
  bankBalance?: number | bigint | undefined;
  bankCapacity?: number | bigint | undefined;
  netWorth?: number | bigint | undefined;
  transactionId?: string | undefined;
}

/**
 * Result of a peer-to-peer balance transfer.
 */
export interface TransferResult {
  success: boolean;
  reason?: string | undefined;
  fromUserId: string;
  toUserId: string;
  amount: number;
  fromWalletBalance?: number | bigint | undefined;
  toWalletBalance?: number | bigint | undefined;
  debitTransactionId?: string | undefined;
  creditTransactionId?: string | undefined;
}

/**
 * Parameters for a peer-to-peer transfer.
 */
export interface TransferParams {
  fromUserId: string;
  toUserId: string;
  amount: number;
  guildId?: string | undefined;
  reason?: string | undefined;
}

/**
 * Result of applying daily bank interest.
 */
export interface InterestResult {
  success: boolean;
  reason?: string | undefined;
  userId: string;
  bankBalanceBefore: number;
  interestAwarded: number;
  bankBalanceAfter: number;
  transactionId?: string | undefined;
}

/**
 * Configuration options for bank capacity scaling.
 */
export interface BankCapacityConfig {
  baseCapacity?: number | undefined;
  capacityPerLevel?: number | undefined;
}

/**
 * Detailed representation of a user's level, XP within level, and next milestone.
 */
export interface LevelProgress {
  level: number;
  currentLevelXp: number;
  xpForNextLevel: number;
  totalXpForCurrentLevel: number;
  totalXpForNextLevel: number;
  progressPercent: number;
}

/**
 * Event published when a user gains enough XP to reach a new level.
 */
export interface LevelUpEvent {
  userId: string;
  guildId: string;
  previousLevel: number;
  newLevel: number;
  levelsGained: number;
  totalXp: number;
  shouldNotify: boolean;
}

/**
 * Result of adding experience to a user's account.
 */
export interface AddXpServiceResult {
  userId: string;
  guildId: string;
  xpAdded: number;
  totalXp: number;
  progress: LevelProgress;
  didLevelUp: boolean;
  previousLevel: number;
  newLevel: number;
  levelsGained: number;
  shouldNotify: boolean;
  eventId: string;
}

/**
 * User Karma status and notification preferences.
 */
export interface KarmaProfile {
  userId: string;
  guildId: string;
  karma: number;
  userNotificationsEnabled: boolean;
  serverNotificationsEnabled: boolean;
}

/**
 * Resolved rank information for a specific user in a server and globally.
 */
export interface UserRankInfo {
  userId: string;
  guildId: string;
  globalRank: number;
  serverRank: number;
  totalXp?: number | undefined;
  level?: number | undefined;
  calculatedAt: Date;
  isCached: boolean;
}

/**
 * An entry within a server or global leaderboard view.
 */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  guildId: string;
  xp: number;
  level: number;
  globalRank?: number | undefined;
  calculatedAt?: Date | undefined;
}

/**
 * Paginated leaderboard response.
 */
export interface LeaderboardPage {
  items: LeaderboardEntry[];
  total: number;
  limit: number;
  offset: number;
  page: number;
  totalPages: number;
}

/**
 * Metrics summary returned after a full or partial leaderboard snapshot materialization.
 */
export interface MaterializeSummary {
  guildsProcessed: number;
  snapshotsCreated: number;
  globalUsersRanked: number;
  durationMs: number;
  calculatedAt: Date;
}

/**
 * Configuration options for the Leaderboard Service.
 */
export interface LeaderboardConfig {
  /**
   * Time-to-live for snapshot rank validity in milliseconds. Default: 10 minutes (600,000ms).
   */
  snapshotTtlMs?: number | undefined;
  /**
   * Periodic background auto-materialization interval in milliseconds. Default: 10 minutes (600,000ms).
   */
  refreshIntervalMs?: number | undefined;
  /**
   * Whether auto-refresh should be activated on service initialization. Default: false.
   */
  autoRefresh?: boolean | undefined;
}



