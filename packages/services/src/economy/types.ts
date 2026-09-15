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
