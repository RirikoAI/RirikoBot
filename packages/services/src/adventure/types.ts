import type { CardElement, CardRarity } from '../waifu-tcg/types.js';
import type { CardExpResult } from '../waifu-tcg/card/card-progression.service.js';

export type AdventureOutcomeType =
  'CRITICAL_SUCCESS' | 'SUCCESS' | 'MIXED' | 'FAILURE' | 'CRITICAL_FAILURE';
export type AdventureRiskTier = 'SAFE' | 'BALANCED' | 'HIGH_RISK' | 'EXTREME';
export type AdventureStat = 'attack' | 'defense' | 'speed';

export interface AdventureRewardConfig {
  rankScaling?: 'standard' | 'none';
  credits?: { min: number; max: number };
  xp?: number;
  dust?: number;
  energy?: number;
  card?: { chance: number; minRarity: CardRarity };
  items?: Array<{ code: string; quantity: number; chance: number }>;
}
export interface AdventurePenaltyConfig {
  credits?: { min: number; max: number };
  energy?: number;
  reason?: string;
}
export interface AdventureEffects {
  rewards?: AdventureRewardConfig;
  penalties?: AdventurePenaltyConfig;
}
export interface AdventureCost {
  credits?: number;
  items?: Array<{ code: string; quantity: number }>;
}
export type AdventureTransition =
  | { type: 'direct'; target: string }
  | {
      type: 'skill';
      chance: number;
      element?: CardElement;
      elementBonus?: number;
      success: string;
      failure: string;
    }
  | { type: 'stat'; stat: AdventureStat; minimum: number; success: string; failure: string }
  | { type: 'element'; element: CardElement; success: string; failure: string };
export interface AdventureChoice {
  /** Fixed exchanges can reuse an ending without scaling that ending's reward bundle. */
  terminalRankScaling?: 'none';
  id: string;
  label: string;
  cost?: AdventureCost;
  effects?: AdventureEffects;
  transition: AdventureTransition;
}
export interface AdventureOutcome extends AdventureEffects {
  type: AdventureOutcomeType;
  narrative: string;
}
export type AdventureNode =
  | {
      type: 'decision';
      id: string;
      stage: number;
      title: string;
      narrative: string;
      choices: AdventureChoice[];
    }
  | { type: 'terminal'; id: string; title: string; outcome: AdventureOutcome };
export interface AdventureScenario {
  /** Optional bundled location illustration shared by this scenario's branches. */
  scene?: string;
  id: string;
  version: number;
  title: string;
  description: string;
  color: number;
  risk: AdventureRiskTier;
  elements: CardElement[];
  totalDecisions: 4 | 5;
  energyCost: 15;
  rootNodeId: string;
  nodes: Record<string, AdventureNode>;
}

/** JSON-safe state: currency totals/receipts are decimal strings, never lossy JSON numbers. */
export interface AdventurePendingRewards {
  companionXp?: number;
  credits: string;
  xp: number;
  dust: number;
  energy: number;
  items: Array<{ code: string; quantity: number }>;
  cards: Array<{ minRarity: CardRarity; cardId: string | null }>;
}
export interface AdventureCardSnapshot {
  /** Optional only for legacy persisted snapshots. Required on new companion admissions. */
  level?: number;
  userCardId?: string;
  name: string;
  element: CardElement;
  attack: number;
  defense: number;
  speed: number;
}
export interface AdventureChoiceReceipt {
  revision: number;
  nodeId: string;
  choiceId: string;
  label: string;
  nextNodeId: string;
  paidCredits: string;
  paidItems: Array<{ code: string; quantity: number }>;
  acceptedAt: number;
}
export interface AdventureSettlementReceipt {
  companionXp?: CardExpResult;
  companionXpUnavailable?: boolean;
  economyVersion?: 2;
  rewardRank?: AdventureRewardRank;
  rewardBonus?: AdventureRankAmounts;
  status: 'COMPLETED' | 'ABANDONED' | 'TIMED_OUT' | 'START_FAILED';
  grossCredits: string;
  lostCredits: string;
  paidCredits: string;
  netCredits: string;
  xp: number;
  dust: number;
  energyChange: number;
  items: Array<{ code: string; quantity: number }>;
  cards: Array<{ id: string; name: string; rarity: CardRarity; serial: number }>;
  unavailableCards: number;
  settledAt: number;
}
export interface ActiveAdventureSession {
  /** Absent on existing sessions: their original payout rules remain intact. */
  rewardEconomy?: AdventureRewardEconomy;
  /** Both absent denotes a pre-rank session, which retains legacy payouts. */
  rewardRank?: AdventureRewardRank;
  rewardCalculation?: AdventureRewardCalculation;
  id: string;
  userId: string;
  guildId: string;
  channelId: string;
  scenarioId: string;
  scenarioVersion: number;
  currentNodeId: string;
  revision: number;
  status: 'ACTIVE' | 'SETTLING' | AdventureSettlementReceipt['status'];
  rngState: number;
  card: AdventureCardSnapshot | null;
  admissionMode: 'ENERGY' | 'COOLDOWN';
  entryEnergyCharged: number;
  startedAt: number;
  deadline: number;
  presented: boolean;
  messageId: string | null;
  deliveredRevision: number;
  rewards: AdventurePendingRewards;
  penalties: { credits: string; energy: number };
  history: AdventureChoiceReceipt[];
  receipt: AdventureSettlementReceipt | null;
}

export interface AdventureRewardEconomy {
  version: 2;
  creditsPerShape: number;
  xpPerShape: number;
  dustPerShape: number;
  companionXpPerShape: number;
  expectedEnergy: number;
  expectedCosts: number;
}

export interface AdventureRewardRank {
  policyVersion: 1;
  rank: 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'S+';
  companionLevel: number | null;
  amountBps: number;
  chanceBps: number;
}
export interface AdventureRankAmounts {
  credits: string;
  xp: number;
  dust: number;
}
export interface AdventureRewardCalculation {
  eligible: AdventureRankAmounts;
  excluded: AdventureRankAmounts;
  finalized: boolean;
}
