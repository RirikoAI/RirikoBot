import {
  type Guild,
  type GuildMember,
  type Role,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import type { ReactionRoleRepository } from '@ririko/database';
import type { RoleAssignmentResult, ReactionRoleMode } from './types.js';

export class ReactionRoleService {
  constructor(private readonly reactionRoleRepo: ReactionRoleRepository) {}

  // ==========================================
  // Role Hierarchy & Permission Validation
  // ==========================================

  hasPermission(guild: Guild): boolean {
    const botMember = guild.members.me ?? guild.members.cache.get(guild.client.user.id);
    return botMember?.permissions.has(PermissionFlagsBits.ManageRoles) ?? false;
  }

  isValidRole(guild: Guild, roleId: string): boolean {
    const role = guild.roles.cache.get(roleId);
    if (!role) return false;

    // Check if it's the @everyone role
    if (role.id === guild.id) return false;

    // Check if it's an integration/managed role
    if (role.managed) return false;

    // Check if bot's highest role is strictly higher than role
    const botMember = guild.members.me ?? guild.members.cache.get(guild.client.user.id);
    if (!botMember) return false;

    return botMember.roles.highest.position > role.position;
  }

  canManageMember(guild: Guild, member: GuildMember): boolean {
    if (member.id === guild.ownerId) return false;

    const botMember = guild.members.me ?? guild.members.cache.get(guild.client.user.id);
    if (!botMember) return false;
    if (botMember.id === guild.ownerId) return true;

    return botMember.roles.highest.position > member.roles.highest.position;
  }

  // ==========================================
  // Core Role Assignment Evaluator
  // ==========================================

  private async applyRoleMode(
    guild: Guild,
    member: GuildMember,
    role: Role,
    mode: ReactionRoleMode = 'TOGGLE',
    groupId?: string | null,
  ): Promise<RoleAssignmentResult> {
    const hasRole = member.roles.cache.has(role.id);

    try {
      switch (mode) {
        case 'GIVE_ONLY': {
          if (!hasRole) {
            await member.roles.add(role, 'ReactionRole: Role granted (GIVE_ONLY)');
            return {
              success: true,
              action: 'ADDED',
              roleId: role.id,
              roleName: role.name,
              message: `Added role **${role.name}**.`,
            };
          }
          return {
            success: true,
            action: 'NOOP',
            roleId: role.id,
            roleName: role.name,
            message: `You already have the **${role.name}** role.`,
          };
        }

        case 'REMOVE_ONLY': {
          if (hasRole) {
            await member.roles.remove(role, 'ReactionRole: Role removed (REMOVE_ONLY)');
            return {
              success: true,
              action: 'REMOVED',
              roleId: role.id,
              roleName: role.name,
              message: `Removed role **${role.name}**.`,
            };
          }
          return {
            success: true,
            action: 'NOOP',
            roleId: role.id,
            roleName: role.name,
            message: `You do not have the **${role.name}** role.`,
          };
        }

        case 'UNIQUE': {
          // Mutually exclusive: remove other roles in the same group before adding
          if (groupId) {
            const groupBindings = await this.reactionRoleRepo.findByGroup(guild.id, groupId);
            const rolesToRemove = groupBindings
              .filter((b) => b.roleId !== role.id && member.roles.cache.has(b.roleId))
              .map((b) => b.roleId);

            if (rolesToRemove.length > 0) {
              await member.roles.remove(
                rolesToRemove,
                'ReactionRole: Mutually exclusive group selection',
              );
            }
          }

          if (!hasRole) {
            await member.roles.add(role, 'ReactionRole: Role granted (UNIQUE)');
            return {
              success: true,
              action: 'ADDED',
              roleId: role.id,
              roleName: role.name,
              message: `Selected role **${role.name}**.`,
            };
          }
          return {
            success: true,
            action: 'NOOP',
            roleId: role.id,
            roleName: role.name,
            message: `You already have the **${role.name}** role.`,
          };
        }

        case 'TOGGLE':
        default: {
          if (hasRole) {
            await member.roles.remove(role, 'ReactionRole: Role toggled off');
            return {
              success: true,
              action: 'REMOVED',
              roleId: role.id,
              roleName: role.name,
              message: `Removed role **${role.name}**.`,
            };
          } else {
            await member.roles.add(role, 'ReactionRole: Role toggled on');
            return {
              success: true,
              action: 'ADDED',
              roleId: role.id,
              roleName: role.name,
              message: `Added role **${role.name}**.`,
            };
          }
        }
      }
    } catch (err: any) {
      console.error(
        `[ReactionRoleService] Error updating role ${role.id} for member ${member.id}:`,
        err,
      );
      return {
        success: false,
        action: 'FAILED',
        roleId: role.id,
        roleName: role.name,
        message: `Failed to update role: ${err?.message || 'Discord permission or hierarchy error'}`,
      };
    }
  }

  // ==========================================
  // Emoji Reaction Handlers
  // ==========================================

  async handleReactionAdd(
    guild: Guild,
    messageId: string,
    emoji: string,
    member: GuildMember,
  ): Promise<RoleAssignmentResult> {
    const binding = await this.reactionRoleRepo.findByMessageAndEmoji(messageId, emoji);
    if (!binding) {
      return { success: false, action: 'NOOP', roleId: '' };
    }

    if (!this.hasPermission(guild)) {
      return {
        success: false,
        action: 'FAILED',
        roleId: binding.roleId,
        message: 'Bot lacks ManageRoles permission.',
      };
    }

    if (!this.isValidRole(guild, binding.roleId)) {
      return {
        success: false,
        action: 'FAILED',
        roleId: binding.roleId,
        message: 'Invalid role or insufficient role hierarchy.',
      };
    }

    let role = guild.roles.cache.get(binding.roleId);
    if (!role) {
      role = (await guild.roles.fetch(binding.roleId).catch(() => null)) ?? undefined;
    }
    if (!role) {
      return {
        success: false,
        action: 'FAILED',
        roleId: binding.roleId,
        message: 'Role not found in guild.',
      };
    }

    const mode = (binding.mode as ReactionRoleMode) || 'TOGGLE';

    // In classic emoji mode without explicit TOGGLE, adding a reaction adds the role
    const effectiveMode = mode === 'TOGGLE' ? 'GIVE_ONLY' : mode;
    return this.applyRoleMode(guild, member, role, effectiveMode, binding.groupId);
  }

  async handleReactionRemove(
    guild: Guild,
    messageId: string,
    emoji: string,
    member: GuildMember,
  ): Promise<RoleAssignmentResult> {
    const binding = await this.reactionRoleRepo.findByMessageAndEmoji(messageId, emoji);
    if (!binding) {
      return { success: false, action: 'NOOP', roleId: '' };
    }

    // GIVE_ONLY reaction roles are not removed when unreacting
    if (binding.mode === 'GIVE_ONLY') {
      return { success: true, action: 'NOOP', roleId: binding.roleId };
    }

    if (!this.hasPermission(guild) || !this.isValidRole(guild, binding.roleId)) {
      return {
        success: false,
        action: 'FAILED',
        roleId: binding.roleId,
        message: 'Cannot modify role due to permissions or hierarchy.',
      };
    }

    let role = guild.roles.cache.get(binding.roleId);
    if (!role) {
      role = (await guild.roles.fetch(binding.roleId).catch(() => null)) ?? undefined;
    }
    if (!role) {
      return { success: false, action: 'FAILED', roleId: binding.roleId };
    }

    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, 'ReactionRole: Removed on reaction remove');
      return {
        success: true,
        action: 'REMOVED',
        roleId: role.id,
        roleName: role.name,
        message: `Removed role **${role.name}**.`,
      };
    }

    return { success: true, action: 'NOOP', roleId: role.id };
  }

  // ==========================================
  // Interactive Button Component Handler
  // ==========================================

  async handleButtonInteraction(interaction: ButtonInteraction): Promise<RoleAssignmentResult> {
    const { guild, member, customId } = interaction;
    if (!guild || !member) {
      return {
        success: false,
        action: 'FAILED',
        roleId: '',
        message: 'Interaction outside of guild.',
      };
    }

    const guildMember =
      member && 'roles' in member && typeof (member.roles as any).add === 'function'
        ? (member as GuildMember)
        : await guild.members.fetch(interaction.user.id).catch(() => null);

    if (!guildMember) {
      return {
        success: false,
        action: 'FAILED',
        roleId: '',
        message: 'Could not resolve guild member.',
      };
    }

    // Parse customId: rr:btn:<bindingId> OR rr:btn:role:<roleId>:<mode>:<groupId?>
    let targetRoleId: string | null = null;
    let mode: ReactionRoleMode = 'TOGGLE';
    let groupId: string | null = null;

    if (customId.startsWith('rr:btn:role:')) {
      const parts = customId.split(':');
      targetRoleId = parts[3] || null;
      mode = (parts[4] as ReactionRoleMode) || 'TOGGLE';
      groupId = parts[5] || null;
    } else if (customId.startsWith('rr:btn:')) {
      const bindingId = customId.replace('rr:btn:', '');
      const binding = await this.reactionRoleRepo.findById(bindingId);
      if (binding) {
        targetRoleId = binding.roleId;
        mode = (binding.mode as ReactionRoleMode) || 'TOGGLE';
        groupId = binding.groupId;
      }
    }

    if (!targetRoleId) {
      const result: RoleAssignmentResult = {
        success: false,
        action: 'FAILED',
        roleId: '',
        message: 'Could not resolve target role for this button.',
      };
      await interaction
        .reply({ content: result.message ?? 'Could not resolve target role.', ephemeral: true })
        .catch(() => null);
      return result;
    }

    if (!this.hasPermission(guild)) {
      const result: RoleAssignmentResult = {
        success: false,
        action: 'FAILED',
        roleId: targetRoleId,
        message: "I don't have permission to manage roles in this server.",
      };
      await interaction
        .reply({ content: result.message ?? 'Permission denied.', ephemeral: true })
        .catch(() => null);
      return result;
    }

    if (!this.isValidRole(guild, targetRoleId)) {
      const result: RoleAssignmentResult = {
        success: false,
        action: 'FAILED',
        roleId: targetRoleId,
        message: 'This role cannot be assigned (hierarchy or managed role).',
      };
      await interaction
        .reply({ content: result.message ?? 'Invalid role.', ephemeral: true })
        .catch(() => null);
      return result;
    }

    let role = guild.roles.cache.get(targetRoleId);
    if (!role) {
      role = (await guild.roles.fetch(targetRoleId).catch(() => null)) ?? undefined;
    }
    if (!role) {
      const result: RoleAssignmentResult = {
        success: false,
        action: 'FAILED',
        roleId: targetRoleId,
        message: 'Role not found in guild.',
      };
      await interaction
        .reply({ content: result.message ?? 'Role not found in guild.', ephemeral: true })
        .catch(() => null);
      return result;
    }

    const result = await this.applyRoleMode(guild, guildMember, role, mode, groupId);

    if (result.success) {
      const userTag =
        interaction.user?.tag ??
        interaction.user?.username ??
        guildMember.user?.tag ??
        guildMember.user?.username ??
        guildMember.id;
      const guildName = guild.name ?? guild.id;
      const roleName = result.roleName ?? role.name;

      if (result.action === 'ADDED') {
        console.log(
          `[ReactionRole] Assigned role "${roleName}" to ${userTag} in "${guildName}" (button)`,
        );
      } else if (result.action === 'REMOVED') {
        console.log(
          `[ReactionRole] Removed role "${roleName}" from ${userTag} in "${guildName}" (button)`,
        );
      }
    }

    await interaction
      .reply({
        content: result.message ?? 'Role updated.',
        ephemeral: true,
      })
      .catch(() => null);

    return result;
  }

  // ==========================================
  // Interactive Dropdown Select Menu Handler
  // ==========================================

  async handleSelectMenuInteraction(
    interaction: StringSelectMenuInteraction,
  ): Promise<RoleAssignmentResult[]> {
    const { guild, member, values, customId } = interaction;
    if (!guild || !member) {
      await interaction
        .reply({ content: 'Interaction outside of guild.', ephemeral: true })
        .catch(() => null);
      return [];
    }

    const guildMember =
      member && 'roles' in member && typeof (member.roles as any).add === 'function'
        ? (member as GuildMember)
        : await guild.members.fetch(interaction.user.id).catch(() => null);

    if (!guildMember) {
      await interaction
        .reply({ content: 'Could not resolve guild member.', ephemeral: true })
        .catch(() => null);
      return [];
    }

    if (!this.hasPermission(guild)) {
      await interaction
        .reply({
          content: 'Cannot manage roles due to permissions or hierarchy.',
          ephemeral: true,
        })
        .catch(() => null);
      return [];
    }

    // Selected values can be roleIds
    const results: RoleAssignmentResult[] = [];
    const addedNames: string[] = [];
    const removedNames: string[] = [];

    // Parse groupId if customId is rr:select:group:<groupId>
    let groupId: string | null = null;
    if (customId.startsWith('rr:select:group:')) {
      groupId = customId.replace('rr:select:group:', '');
    }

    // Only roles still bound to the menu's group count; an option whose binding was removed
    // no longer gives its role.
    let selected: readonly string[] = values;
    // If groupId is present, remove other roles in the group that weren't selected
    if (groupId) {
      const groupBindings = await this.reactionRoleRepo.findByGroup(guild.id, groupId);
      const rolesInGroup = groupBindings.map((b) => b.roleId);
      selected = values.filter((rId) => rolesInGroup.includes(rId));
      const rolesToRemove = rolesInGroup.filter(
        (rId) => !selected.includes(rId) && guildMember.roles.cache.has(rId),
      );

      if (rolesToRemove.length > 0) {
        await guildMember.roles.remove(rolesToRemove, 'ReactionRole: Dropdown selection change');
        const userTag =
          interaction.user?.tag ??
          interaction.user?.username ??
          guildMember.user?.tag ??
          guildMember.user?.username ??
          guildMember.id;
        const guildName = guild.name ?? guild.id;

        for (const rId of rolesToRemove) {
          const r = guild.roles.cache.get(rId);
          if (r) {
            removedNames.push(r.name);
            console.log(
              `[ReactionRole] Removed role "${r.name}" from ${userTag} in "${guildName}" (select menu)`,
            );
          }
        }
      }
    }

    for (const roleId of selected) {
      if (!this.isValidRole(guild, roleId)) continue;
      const role = guild.roles.cache.get(roleId);
      if (!role) continue;

      if (!guildMember.roles.cache.has(role.id)) {
        await guildMember.roles.add(role, 'ReactionRole: Dropdown menu selection');
        addedNames.push(role.name);
        const userTag =
          interaction.user?.tag ??
          interaction.user?.username ??
          guildMember.user?.tag ??
          guildMember.user?.username ??
          guildMember.id;
        const guildName = guild.name ?? guild.id;

        console.log(
          `[ReactionRole] Assigned role "${role.name}" to ${userTag} in "${guildName}" (select menu)`,
        );
        results.push({
          success: true,
          action: 'ADDED',
          roleId: role.id,
          roleName: role.name,
        });
      }
    }

    const messages: string[] = [];
    if (addedNames.length > 0) messages.push(`Added: **${addedNames.join(', ')}**`);
    if (removedNames.length > 0) messages.push(`Removed: **${removedNames.join(', ')}**`);
    if (messages.length === 0) messages.push('No role changes made.');

    await interaction
      .reply({
        content: messages.join('\n'),
        ephemeral: true,
      })
      .catch(() => null);

    return results;
  }
}
