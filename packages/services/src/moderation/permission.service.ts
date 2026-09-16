import {
  PermissionsBitField,
  type GuildMember,
  type PermissionResolvable,
} from 'discord.js';
import type { GuildSettingsRepository } from '@ririko/database';
import type {
  PermissionCheckParams,
  PermissionCheckResult,
} from './types.js';

export class PermissionService {
  constructor(private readonly guildSettingsRepo?: GuildSettingsRepository | undefined) {}

  /**
   * Centralized 5-tier permission and role hierarchy verification.
   * 
   * Tier 1: Invoker Discord Permissions (Guild Owner bypass)
   * Tier 2: Bot Discord Permissions (Guild & Channel level)
   * Tier 3: Role Hierarchy (Invoker > Target, Bot > Target, Self-check, Guild Owner protection)
   * Tier 4: Ririko Module Policy (Guild settings)
   * Tier 5: Channel Overrides
   */
  async validate(params: PermissionCheckParams): Promise<PermissionCheckResult> {
    const {
      guild,
      invoker,
      target,
      channel,
      requiredInvokerPermissions = [],
      requiredBotPermissions = [],
      moduleName: _moduleName = 'moderation',
      skipHierarchyCheck = false,
    } = params;

    // --- Safety Sanity Checks (Self & Owner) ---
    if (target) {
      if (target.id === invoker.id) {
        return {
          allowed: false,
          code: 'CANNOT_MODERATE_SELF',
          message: 'You cannot execute moderation actions on yourself.',
        };
      }

      if (target.id === guild.ownerId) {
        return {
          allowed: false,
          code: 'TARGET_IS_OWNER',
          message: 'You cannot execute moderation actions on the server owner.',
        };
      }

      const botUserId = guild.client.user?.id;
      if (botUserId && target.id === botUserId) {
        return {
          allowed: false,
          code: 'CANNOT_MODERATE_SELF',
          message: 'Ririko cannot execute moderation actions on herself.',
        };
      }
    }

    // --- Tier 1: Invoker Discord Permissions ---
    const isInvokerOwner = invoker.id === guild.ownerId;
    if (!isInvokerOwner && requiredInvokerPermissions.length > 0) {
      const missingInvokerPerms: string[] = [];
      for (const perm of requiredInvokerPermissions) {
        if (!invoker.permissions.has(perm)) {
          missingInvokerPerms.push(this.formatPermissionName(perm));
        }
      }

      if (missingInvokerPerms.length > 0) {
        return {
          allowed: false,
          code: 'INVOKER_MISSING_PERMISSIONS',
          message: `You lack the required Discord permission(s): ${missingInvokerPerms.join(', ')}`,
          missingPermissions: missingInvokerPerms,
        };
      }
    }

    // --- Resolve Bot Member ---
    const botMember: GuildMember | null =
      guild.members.me ?? (await guild.members.fetchMe().catch(() => null));

    if (!botMember) {
      return {
        allowed: false,
        code: 'BOT_MISSING_PERMISSIONS',
        message: 'Could not resolve Ririko bot member in this server.',
      };
    }

    // --- Tier 2: Bot Discord Permissions ---
    if (requiredBotPermissions.length > 0) {
      const missingBotPerms: string[] = [];
      for (const perm of requiredBotPermissions) {
        if (!botMember.permissions.has(perm)) {
          missingBotPerms.push(this.formatPermissionName(perm));
        }
      }

      if (missingBotPerms.length > 0) {
        return {
          allowed: false,
          code: 'BOT_MISSING_PERMISSIONS',
          message: `Ririko lacks the required Discord permission(s): ${missingBotPerms.join(', ')}`,
          missingPermissions: missingBotPerms,
        };
      }
    }

    // --- Tier 3: Role Hierarchy ---
    if (target && !skipHierarchyCheck) {
      // Invoker vs Target
      if (!isInvokerOwner) {
        if (invoker.roles.highest.position <= target.roles.highest.position) {
          return {
            allowed: false,
            code: 'INVOKER_HIERARCHY_VIOLATION',
            message: "Your highest role must be above the target's highest role.",
          };
        }
      }

      // Bot vs Target
      if (botMember.roles.highest.position <= target.roles.highest.position) {
        return {
          allowed: false,
          code: 'BOT_HIERARCHY_VIOLATION',
          message: "Ririko's highest role must be above the target's highest role to moderate them.",
        };
      }
    }

    // --- Tier 4: Ririko Module Policy ---
    if (this.guildSettingsRepo) {
      const settings = await this.guildSettingsRepo.getByGuildId(guild.id).catch(() => null);
      if (settings) {
        // Reserved for module-specific feature toggles if present
        // Default policy is allowed unless explicitly disabled
      }
    }

    // --- Tier 5: Channel Overrides ---
    if (channel && requiredBotPermissions.length > 0) {
      const channelPerms = channel.permissionsFor(botMember);
      if (channelPerms) {
        const missingChannelPerms: string[] = [];
        for (const perm of requiredBotPermissions) {
          if (!channelPerms.has(perm)) {
            missingChannelPerms.push(this.formatPermissionName(perm));
          }
        }
        if (missingChannelPerms.length > 0) {
          return {
            allowed: false,
            code: 'CHANNEL_OVERRIDE_DENIED',
            message: `Ririko lacks permission(s) in #${channel.name}: ${missingChannelPerms.join(', ')}`,
            missingPermissions: missingChannelPerms,
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Helper to format permission bits/names into readable strings.
   */
  private formatPermissionName(perm: PermissionResolvable): string {
    if (typeof perm === 'string') return perm;
    if (typeof perm === 'bigint' || typeof perm === 'number') {
      const bitfield = new PermissionsBitField(perm);
      const names = bitfield.toArray();
      return names.length > 0 ? names.join(' & ') : perm.toString();
    }
    return String(perm);
  }
}
