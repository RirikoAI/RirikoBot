import type { LevelRoleReward } from '@ririko/core';
import type { LevelRoleSettingsRepository, XpRepository } from '@ririko/database';

export type { LevelRoleReward };

/** A server's level role settings, as the service uses them. */
export interface LevelRoleConfig {
  /** The level and role pairs, as the admin saved them. */
  rewards: readonly LevelRoleReward[];
  /** True stacks every reward at or below the level; false keeps only the highest one. */
  keepPreviousRoles: boolean;
}

/** The reward roles a member should hold at a level, and the reward roles they should not. */
export interface RolesForLevel {
  keep: string[];
  remove: string[];
}

/** Why Ririko did not add or remove a role. */
export type SkipReason = 'missing' | 'everyone' | 'managed' | 'hierarchy';

export interface SkippedRole {
  roleId: string;
  reason: SkipReason;
}

/** What `applyForMember` did. Empty lists mean nothing needed to change or nothing could. */
export interface ApplyResult {
  added: string[];
  removed: string[];
  skipped: SkippedRole[];
}

/** What `syncGuild` did. `busy` is true when another sync of the same server was running. */
export interface SyncResult {
  busy: boolean;
  /** Members found in the server and checked. Members who left are not counted. */
  checked: number;
  /** Roles given, over all members. */
  added: number;
  /** Roles taken away, over all members. */
  removed: number;
}

export interface LevelRoleServiceOptions {
  settings: Pick<LevelRoleSettingsRepository, 'get'>;
  xp: Pick<XpRepository, 'listMembersAtLevel'>;
  /** How long a server's settings are cached. Defaults to 5 minutes. */
  cacheTtlMs?: number;
  /** The clock in milliseconds, so tests are deterministic. */
  now?: () => number;
}
