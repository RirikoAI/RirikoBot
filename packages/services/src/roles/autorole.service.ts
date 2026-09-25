import {
  type Client,
  type Guild,
  type GuildMember,
  type Role,
  PermissionFlagsBits,
} from 'discord.js';
import type { AutoRoleRepository } from '@ririko/database';
import type {
  AutoRoleJoinResult,
  VerificationResult,
  TemporaryRoleResult,
  RoleSweeperResult,
} from './types.js';

export class AutoRoleService {
  private sweeperInterval: NodeJS.Timeout | null = null;

  constructor(private readonly autoRoleRepo: AutoRoleRepository) {}

  // ==========================================
  // Role Hierarchy & Permission Guards
  // ==========================================

  /**
   * Checks if the bot has PermissionFlagsBits.ManageRoles in the guild.
   */
  hasManageRolesPermission(guild: Guild): boolean {
    const botMember = guild.members.me ?? guild.members.cache.get(guild.client.user.id);
    return botMember?.permissions.has(PermissionFlagsBits.ManageRoles) ?? false;
  }

  /**
   * Validates whether a target role can safely be assigned by the bot.
   * Checks: existence, @everyone, managed bot roles, and role hierarchy position.
   */
  isValidAssignableRole(
    guild: Guild,
    roleId: string,
  ): { valid: boolean; reason?: string; role?: Role } {
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      return { valid: false, reason: `Role ${roleId} not found in guild.` };
    }

    // Role cannot be @everyone
    if (role.id === guild.id) {
      return { valid: false, reason: 'Cannot assign the @everyone role.', role };
    }

    // Role cannot be managed by an integration/bot application
    if (role.managed) {
      return { valid: false, reason: 'Cannot assign a managed integration role.', role };
    }

    // Bot's highest role must be strictly higher than the role to assign
    const botMember = guild.members.me ?? guild.members.cache.get(guild.client.user.id);
    if (!botMember) {
      return { valid: false, reason: 'Bot member not found in guild cache.', role };
    }

    if (botMember.roles.highest.position <= role.position) {
      return {
        valid: false,
        reason: `Bot's highest role (${botMember.roles.highest.name}) is not higher than target role (${role.name}).`,
        role,
      };
    }

    return { valid: true, role };
  }

  /**
   * Validates whether the bot can modify the target member's roles based on hierarchy.
   */
  canManageMember(guild: Guild, member: GuildMember): boolean {
    // Guild owner cannot be modified by anyone other than themselves
    if (member.id === guild.ownerId) {
      return false;
    }

    const botMember = guild.members.me ?? guild.members.cache.get(guild.client.user.id);
    if (!botMember) return false;

    // Bot is guild owner -> full authority
    if (botMember.id === guild.ownerId) return true;

    // Bot highest role must be above member highest role
    return botMember.roles.highest.position > member.roles.highest.position;
  }

  // ==========================================
  // Member Join (AutoRole)
  // ==========================================

  /**
   * Handles member join events by applying configured human or bot roles.
   */
  async handleMemberJoin(member: GuildMember): Promise<AutoRoleJoinResult> {
    try {
      const config = await this.autoRoleRepo.getGuildAutoRoles(member.guild.id);
      if (!config || !config.isEnabled) {
        return { success: false, assignedRoles: [], skippedRoles: [] };
      }

      if (!this.hasManageRolesPermission(member.guild)) {
        return {
          success: false,
          assignedRoles: [],
          skippedRoles: [],
          error: 'Bot lacks ManageRoles permission in this guild.',
        };
      }

      const isBot = member.user.bot;
      const targetRoleIds = isBot ? config.botRoleIds : config.humanRoleIds;

      if (!targetRoleIds || targetRoleIds.length === 0) {
        return { success: true, assignedRoles: [], skippedRoles: [] };
      }

      const assignedRoles: string[] = [];
      const skippedRoles: string[] = [];
      const rolesToAdd: Role[] = [];

      for (const roleId of targetRoleIds) {
        const validation = this.isValidAssignableRole(member.guild, roleId);
        if (validation.valid && validation.role) {
          if (!member.roles.cache.has(roleId)) {
            rolesToAdd.push(validation.role);
            assignedRoles.push(roleId);
          }
        } else {
          skippedRoles.push(roleId);
        }
      }

      if (rolesToAdd.length > 0) {
        await member.roles.add(rolesToAdd, 'AutoRole: Assigned on server join');
        const userTag = member.user?.tag ?? member.user?.username ?? member.id;
        const roleNames = rolesToAdd.map((r) => r.name).join(', ');
        const guildName = member.guild.name ?? member.guild.id ?? 'Unknown Guild';
        console.log(
          `[AutoRole] Assigned join roles [${roleNames}] to ${userTag} in "${guildName}"`,
        );
      }

      return {
        success: true,
        assignedRoles,
        skippedRoles,
      };
    } catch (err: any) {
      console.error(`[AutoRoleService] Error assigning join roles in ${member.guild.id}:`, err);
      return {
        success: false,
        assignedRoles: [],
        skippedRoles: [],
        error: err?.message || 'Unknown error assigning join roles',
      };
    }
  }

  // ==========================================
  // Verification Role Gateway
  // ==========================================

  /**
   * Handles interactive verification button clicks or commands.
   */
  async handleVerification(guild: Guild, member: GuildMember): Promise<VerificationResult> {
    try {
      const config = await this.autoRoleRepo.getGuildAutoRoles(guild.id);
      if (!config || !config.verificationRoleId) {
        return {
          success: false,
          alreadyVerified: false,
          message: 'No verification role has been configured for this server.',
        };
      }

      const roleId = config.verificationRoleId;
      if (member.roles.cache.has(roleId)) {
        return {
          success: true,
          alreadyVerified: true,
          roleId,
          message: 'You are already verified in this server!',
        };
      }

      if (!this.hasManageRolesPermission(guild)) {
        return {
          success: false,
          alreadyVerified: false,
          roleId,
          message: "I don't have permission to manage roles in this server.",
        };
      }

      const validation = this.isValidAssignableRole(guild, roleId);
      if (!validation.valid || !validation.role) {
        return {
          success: false,
          alreadyVerified: false,
          roleId,
          message: `Cannot assign verification role: ${validation.reason || 'Invalid role.'}`,
        };
      }

      await member.roles.add(validation.role, 'AutoRole: Member verification passed');

      const userTag = member.user?.tag ?? member.user?.username ?? member.id;
      const guildName = guild.name ?? guild.id ?? 'Unknown Guild';
      console.log(
        `[AutoRole] Verified member ${userTag} and assigned role "${validation.role.name}" in "${guildName}"`,
      );

      return {
        success: true,
        alreadyVerified: false,
        roleId,
        message: 'You have been successfully verified and granted access!',
      };
    } catch (err: any) {
      console.error(`[AutoRoleService] Error verifying member ${member.id} in ${guild.id}:`, err);
      return {
        success: false,
        alreadyVerified: false,
        message: `Verification failed: ${err?.message || 'Internal error'}`,
      };
    }
  }

  // ==========================================
  // Temporary Expiring Roles
  // ==========================================

  /**
   * Assigns a role with an expiration TTL and persists it in the database.
   */
  async assignTemporaryRole(
    guild: Guild,
    member: GuildMember,
    roleId: string,
    durationMs: number,
    assignedBy: string,
    reason?: string,
  ): Promise<TemporaryRoleResult> {
    try {
      if (!this.hasManageRolesPermission(guild)) {
        return {
          success: false,
          roleId,
          error: "Bot lacks 'ManageRoles' permission.",
        };
      }

      const validation = this.isValidAssignableRole(guild, roleId);
      if (!validation.valid || !validation.role) {
        return {
          success: false,
          roleId,
          error: validation.reason || 'Invalid role for assignment.',
        };
      }

      const expiresAt = new Date(Date.now() + durationMs);

      // Add role to member on Discord
      await member.roles.add(
        validation.role,
        `Temporary role assigned by ${assignedBy}: ${reason ?? 'No reason provided'}`,
      );

      // Persist in DB
      await this.autoRoleRepo.addTemporaryRole({
        guildId: guild.id,
        userId: member.id,
        roleId,
        expiresAt,
        assignedBy,
        reason: reason ?? null,
      });

      const userTag = member.user?.tag ?? member.user?.username ?? member.id;
      const guildName = guild.name ?? guild.id ?? 'Unknown Guild';
      console.log(
        `[TempRole] Assigned temporary role "${validation.role.name}" to ${userTag} in "${guildName}" (expires at ${expiresAt.toLocaleString()})`,
      );

      return {
        success: true,
        roleId,
        expiresAt,
      };
    } catch (err: any) {
      console.error(`[AutoRoleService] Error assigning temporary role in ${guild.id}:`, err);
      return {
        success: false,
        roleId,
        error: err?.message || 'Failed to assign temporary role.',
      };
    }
  }

  /**
   * Manually removes a temporary role and removes the DB record.
   */
  async removeTemporaryRole(guild: Guild, member: GuildMember, roleId: string): Promise<boolean> {
    try {
      const role = guild.roles.cache.get(roleId);
      const roleName = role?.name ?? roleId;

      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId, 'Temporary role manually revoked');
      }

      const record = await this.autoRoleRepo.findTemporaryRole(guild.id, member.id, roleId);
      if (record) {
        await this.autoRoleRepo.removeTemporaryRole(record.id);
      }

      const userTag = member.user?.tag ?? member.user?.username ?? member.id;
      const guildName = guild.name ?? guild.id ?? 'Unknown Guild';
      console.log(
        `[TempRole] Removed temporary role "${roleName}" from ${userTag} in "${guildName}"`,
      );

      return true;
    } catch (err: any) {
      console.error(`[AutoRoleService] Error removing temporary role in ${guild.id}:`, err);
      return false;
    }
  }

  /**
   * Sweeps expired temporary roles across all guilds.
   */
  async sweepExpiredRoles(client: Client): Promise<RoleSweeperResult> {
    const result: RoleSweeperResult = {
      sweptCount: 0,
      errors: [],
    };

    try {
      const expiredRecords = await this.autoRoleRepo.findExpiredTemporaryRoles(new Date());
      if (!expiredRecords || expiredRecords.length === 0) {
        return result;
      }

      for (const record of expiredRecords) {
        try {
          const guild =
            client.guilds.cache.get(record.guildId) ??
            (await client.guilds.fetch(record.guildId).catch(() => null));

          if (!guild) {
            // Guild no longer accessible, clean up record
            await this.autoRoleRepo.removeTemporaryRole(record.id);
            result.sweptCount++;
            continue;
          }

          const member =
            guild.members.cache.get(record.userId) ??
            (await guild.members.fetch(record.userId).catch(() => null));

          const role = guild.roles.cache.get(record.roleId);
          const roleName = role?.name ?? record.roleId;
          const userTag = member?.user?.tag ?? member?.user?.username ?? record.userId;
          const guildName = guild.name ?? guild.id ?? 'Unknown Guild';

          if (member && member.roles.cache.has(record.roleId)) {
            await member.roles.remove(record.roleId, 'Temporary role expired');
          }

          await this.autoRoleRepo.removeTemporaryRole(record.id);
          result.sweptCount++;

          console.log(
            `[TempRole] Expired: Revoked temporary role "${roleName}" from ${userTag} in "${guildName}"`,
          );
        } catch (err: any) {
          const msg = `Failed to revoke expired role ${record.roleId} for user ${record.userId}: ${err?.message}`;
          console.warn(`[AutoRoleService] ${msg}`);
          result.errors.push(msg);
        }
      }
    } catch (err: any) {
      console.error('[AutoRoleService] Error in sweepExpiredRoles:', err);
      result.errors.push(err?.message || 'General sweeper error');
    }

    return result;
  }

  /**
   * Starts periodic background sweeper for expired roles.
   */
  startSweeper(client: Client, intervalMs = 60_000): void {
    if (this.sweeperInterval) return;
    this.sweeperInterval = setInterval(() => {
      void this.sweepExpiredRoles(client);
    }, intervalMs);
    // Don't keep the Node.js event loop alive solely for this interval
    this.sweeperInterval.unref();
  }

  /**
   * Stops background sweeper.
   */
  stopSweeper(): void {
    if (this.sweeperInterval) {
      clearInterval(this.sweeperInterval);
      this.sweeperInterval = null;
    }
  }
}
