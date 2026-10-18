import type { Guild, GuildMember, GuildBasedChannel, PermissionResolvable } from 'discord.js';

export type PermissionViolationCode =
  | 'INVOKER_MISSING_PERMISSIONS'
  | 'BOT_MISSING_PERMISSIONS'
  | 'INVOKER_HIERARCHY_VIOLATION'
  | 'BOT_HIERARCHY_VIOLATION'
  | 'TARGET_IS_OWNER'
  | 'CANNOT_MODERATE_SELF'
  | 'MODULE_DISABLED'
  | 'CHANNEL_OVERRIDE_DENIED';

export interface PermissionCheckParams {
  guild: Guild;
  invoker: GuildMember;
  target?: GuildMember | null | undefined;
  channel?: GuildBasedChannel | null | undefined;
  requiredInvokerPermissions?: PermissionResolvable[] | undefined;
  requiredBotPermissions?: PermissionResolvable[] | undefined;
  moduleName?: string | undefined;
  skipHierarchyCheck?: boolean | undefined;
}

export interface PermissionCheckResult {
  allowed: boolean;
  code?: PermissionViolationCode | undefined;
  message?: string | undefined;
  missingPermissions?: string[] | undefined;
}

export type ModerationActionType =
  | 'WARN'
  | 'TIMEOUT'
  | 'UNTIMEOUT'
  | 'KICK'
  | 'BAN'
  | 'SOFTBAN'
  | 'UNBAN'
  | 'NICK'
  | 'LOCK'
  | 'UNLOCK';

export interface ModerationActionResult<T = unknown> {
  success: boolean;
  action: ModerationActionType;
  guildId: string;
  targetUserId?: string | undefined;
  channelId?: string | undefined;
  caseNumber?: number | undefined;
  caseId?: string | undefined;
  reason: string;
  error?: string | undefined;
  dmSent?: boolean | undefined;
  data?: T | undefined;
}

export interface KickParams {
  guild: Guild;
  invoker: GuildMember;
  target: GuildMember;
  reason?: string | undefined;
  sendDm?: boolean | undefined;
}

export interface BanParams {
  guild: Guild;
  invoker: GuildMember;
  target: GuildMember | string;
  reason?: string | undefined;
  deleteMessageSeconds?: number | undefined;
  deleteMessageDays?: number | undefined;
  sendDm?: boolean | undefined;
}

export interface SoftbanParams {
  guild: Guild;
  invoker: GuildMember;
  target: GuildMember;
  reason?: string | undefined;
  deleteMessageDays?: number | undefined;
  sendDm?: boolean | undefined;
}

export interface UnbanParams {
  guild: Guild;
  invoker: GuildMember;
  targetUserId: string;
  reason?: string | undefined;
}

export interface TimeoutParams {
  guild: Guild;
  invoker: GuildMember;
  target: GuildMember;
  durationSeconds: number;
  reason?: string | undefined;
  sendDm?: boolean | undefined;
}

export interface UntimeoutParams {
  guild: Guild;
  invoker: GuildMember;
  target: GuildMember;
  reason?: string | undefined;
}

export interface NicknameParams {
  guild: Guild;
  invoker: GuildMember;
  target: GuildMember;
  nickname: string | null;
  reason?: string | undefined;
}

export interface LockChannelParams {
  guild: Guild;
  invoker: GuildMember;
  channel: GuildBasedChannel;
  reason?: string | undefined;
}

export interface UnlockChannelParams {
  guild: Guild;
  invoker: GuildMember;
  channel: GuildBasedChannel;
  reason?: string | undefined;
}
