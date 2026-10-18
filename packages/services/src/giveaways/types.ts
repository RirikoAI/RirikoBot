import type { Giveaway, GiveawayEntry, GiveawayWinner } from '@ririko/database';

export interface GiveawayBonusRole {
  roleId: string;
  multiplier: number;
}

export interface GiveawayRequirements {
  minAccountAgeDays?: number;
  minServerTenureDays?: number;
  requiredRoleIds?: string[];
  blacklistedRoleIds?: string[];
  bonusRoles?: GiveawayBonusRole[];
}

export interface GiveawayCreationOptions {
  guildId: string;
  channelId: string;
  prize: string;
  winnerCount: number;
  durationMs: number;
  createdBy: string;
  requirements?: GiveawayRequirements;
}

export interface MemberEntryInfo {
  createdTimestamp: number;
  joinedTimestamp?: number | null;
  roleIds: string[];
  isBooster?: boolean;
}

export interface EntryValidationResult {
  allowed: boolean;
  reason?: string;
  bonusMultiplier?: number;
}

export interface GiveawayEndResult {
  giveaway: Giveaway;
  winnerIds: string[];
  isReroll: boolean;
}

export interface GiveawayEngineOptions {
  checkIntervalMs?: number;
  rngFn?: () => number;
  onGiveawayEnded?: ((result: GiveawayEndResult) => Promise<void>) | undefined;
}

export type { Giveaway, GiveawayEntry, GiveawayWinner };
