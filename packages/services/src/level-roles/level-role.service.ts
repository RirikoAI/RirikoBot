import { PermissionFlagsBits, type Guild, type GuildMember } from 'discord.js';
import type {
  ApplyResult,
  LevelRoleConfig,
  LevelRoleReward,
  LevelRoleServiceOptions,
  RolesForLevel,
  SkippedRole,
  SyncResult,
} from './types.js';

/** How many members one `guild.members.fetch` call asks for during a sync. */
const SYNC_BATCH_SIZE = 100;

const EMPTY_CONFIG: LevelRoleConfig = { rewards: [], keepPreviousRoles: true };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emptyApply(): ApplyResult {
  return { added: [], removed: [], skipped: [] };
}

/**
 * Works out which reward roles a member should hold at a level. The role comes from the level,
 * not from the levels just crossed, so a multi-level jump and a rejoin give the same result.
 *
 * With `keepPreviousRoles`, every reward role at or below the level is kept and nothing is
 * removed. Without it, only the role of the highest reward at or below the level is kept and every
 * other reward role goes in `remove`. Level 0 or no rewards gives empty lists.
 */
export function rolesForLevel(
  rewards: readonly LevelRoleReward[],
  level: number,
  keepPreviousRoles: boolean,
): RolesForLevel {
  const eligible = rewards
    .filter((reward) => reward.level <= level)
    .sort((a, b) => a.level - b.level);
  if (level <= 0 || eligible.length === 0) return { keep: [], remove: [] };

  if (keepPreviousRoles) {
    return { keep: [...new Set(eligible.map((reward) => reward.roleId))], remove: [] };
  }

  const highest = eligible[eligible.length - 1] as LevelRoleReward;
  const remove = [...new Set(rewards.map((reward) => reward.roleId))].filter(
    (roleId) => roleId !== highest.roleId,
  );
  return { keep: [highest.roleId], remove };
}

/**
 * Gives and takes away level reward roles (STORY-200). The leveling listener calls
 * `applyForMember` on a level-up or a rejoin and the `/levelroles sync` command calls
 * `syncGuild`. Neither throws: a failed read or a Discord error is logged with the guild and role
 * IDs and the member is left as it was.
 *
 * Settings are cached per server; the bot drops a server on `guild:configChanged` for the
 * `levelroles` module and the TTL is only a safety net.
 */
export class LevelRoleService {
  private readonly settings: LevelRoleServiceOptions['settings'];
  private readonly xp: LevelRoleServiceOptions['xp'];
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, { config: LevelRoleConfig; cachedAt: number }>();
  private readonly syncing = new Set<string>();

  constructor(options: LevelRoleServiceOptions) {
    this.settings = options.settings;
    this.xp = options.xp;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  /** Drops a server's cached settings (or every server's) so the next call reads them again. */
  invalidate(guildId?: string): void {
    if (guildId) this.cache.delete(guildId);
    else this.cache.clear();
  }

  /**
   * Brings a member's reward roles in line with their level: adds the missing roles and, unless the
   * server keeps lower rewards, removes the other reward roles they hold. A role that is not a
   * reward is never touched.
   */
  async applyForMember(member: GuildMember, level: number): Promise<ApplyResult> {
    const result = emptyApply();
    try {
      const guild = member.guild;
      const config = await this.getConfig(guild.id);
      if (config.rewards.length === 0 || !this.canManageRoles(guild)) return result;

      const wanted = rolesForLevel(config.rewards, level, config.keepPreviousRoles);
      const toAdd = wanted.keep.filter((roleId) => !member.roles.cache.has(roleId));
      const toRemove = wanted.remove.filter((roleId) => member.roles.cache.has(roleId));
      const reason = `Level ${level} reward`;

      const addable = this.usable(guild, toAdd, result.skipped);
      if (addable.length > 0 && (await this.change(member, 'add', addable, reason))) {
        result.added.push(...addable);
      }
      const removable = this.usable(guild, toRemove, result.skipped);
      if (removable.length > 0 && (await this.change(member, 'remove', removable, reason))) {
        result.removed.push(...removable);
      }
    } catch (error) {
      console.error(
        `[LevelRoleService] applyForMember failed in guild ${member.guild.id}:`,
        errorText(error),
      );
    }
    return result;
  }

  /**
   * Gives the reward roles to every member who already has a reward's level. Members are read from
   * the lowest reward level up, fetched 100 at a time and applied one after the other. A member who
   * left the server is skipped. Only one sync per server runs at a time.
   */
  async syncGuild(guild: Guild): Promise<SyncResult> {
    const result: SyncResult = { busy: false, checked: 0, added: 0, removed: 0 };
    if (this.syncing.has(guild.id)) return { ...result, busy: true };

    this.syncing.add(guild.id);
    try {
      const config = await this.getConfig(guild.id);
      if (config.rewards.length === 0 || !this.canManageRoles(guild)) return result;

      const lowest = Math.min(...config.rewards.map((reward) => reward.level));
      const accounts = await this.xp.listMembersAtLevel(guild.id, lowest);
      for (let start = 0; start < accounts.length; start += SYNC_BATCH_SIZE) {
        const batch = accounts.slice(start, start + SYNC_BATCH_SIZE);
        const members = await this.fetchBatch(
          guild,
          batch.map((account) => account.userId),
        );
        for (const account of batch) {
          const member = members.get(account.userId);
          if (!member) continue;
          const applied = await this.applyForMember(member, account.level);
          result.checked += 1;
          result.added += applied.added.length;
          result.removed += applied.removed.length;
        }
      }
    } catch (error) {
      console.error(`[LevelRoleService] syncGuild failed in guild ${guild.id}:`, errorText(error));
    } finally {
      this.syncing.delete(guild.id);
    }
    return result;
  }

  // ==========================================
  // Helpers
  // ==========================================

  private async getConfig(guildId: string): Promise<LevelRoleConfig> {
    const now = this.now();
    const cached = this.cache.get(guildId);
    if (cached && now - cached.cachedAt < this.cacheTtlMs) return cached.config;

    let config: LevelRoleConfig;
    try {
      const row = await this.settings.get(guildId);
      config = row
        ? { rewards: row.rewards, keepPreviousRoles: row.keepPreviousRoles }
        : EMPTY_CONFIG;
    } catch (error) {
      console.error(
        `[LevelRoleService] Could not read the settings of guild ${guildId}:`,
        errorText(error),
      );
      return EMPTY_CONFIG;
    }
    this.cache.set(guildId, { config, cachedAt: now });
    return config;
  }

  /** True when Ririko is in the server's member cache and holds Manage Roles. */
  private canManageRoles(guild: Guild): boolean {
    const me = guild.members.me ?? guild.members.cache.get(guild.client.user.id);
    return me?.permissions.has(PermissionFlagsBits.ManageRoles) ?? false;
  }

  /**
   * The roles Ririko may change. Same rules as `AutoRoleService.isValidAssignableRole`: the role
   * exists, is not @everyone, is not managed by an integration and is below Ririko's highest role.
   * Others are added to `skipped` with the reason.
   */
  private usable(guild: Guild, roleIds: string[], skipped: SkippedRole[]): string[] {
    const me = guild.members.me ?? guild.members.cache.get(guild.client.user.id);
    const usable: string[] = [];
    for (const roleId of roleIds) {
      const role = guild.roles.cache.get(roleId);
      if (!role) skipped.push({ roleId, reason: 'missing' });
      else if (role.id === guild.id) skipped.push({ roleId, reason: 'everyone' });
      else if (role.managed) skipped.push({ roleId, reason: 'managed' });
      else if (!me || me.roles.highest.position <= role.position) {
        skipped.push({ roleId, reason: 'hierarchy' });
      } else usable.push(roleId);
    }
    return usable;
  }

  /** Adds or removes roles. Returns false, after logging the guild and role IDs, when Discord refuses. */
  private async change(
    member: GuildMember,
    action: 'add' | 'remove',
    roleIds: string[],
    reason: string,
  ): Promise<boolean> {
    try {
      await member.roles[action](roleIds, reason);
      return true;
    } catch (error) {
      console.error(
        `[LevelRoleService] Could not ${action} roles ${roleIds.join(',')} in guild ${member.guild.id}:`,
        errorText(error),
      );
      return false;
    }
  }

  /** Fetches up to 100 members. A user who left is missing from the result. */
  private async fetchBatch(guild: Guild, userIds: string[]): Promise<Map<string, GuildMember>> {
    try {
      return await guild.members.fetch({ user: userIds });
    } catch (error) {
      console.error(
        `[LevelRoleService] Could not fetch ${userIds.length} members in guild ${guild.id}:`,
        errorText(error),
      );
      return new Map();
    }
  }
}
