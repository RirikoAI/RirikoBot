import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReactionRole } from '#database/entities/reaction-role.entity';
import { Guild as DiscordGuild, GuildMember, Role } from 'discord.js';

/**
 * ReactionRoleService
 * @description Service for managing reaction roles
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export class ReactionRoleService {
  constructor(
    @InjectRepository(ReactionRole)
    private readonly reactionRoleRepository: Repository<ReactionRole>,
  ) {}

  /**
   * Create a new reaction role
   * @param guildId The guild ID
   * @param messageId The message ID
   * @param emoji The emoji
   * @param roleId The role ID
   * @returns The created reaction role
   */
  async createReactionRole(
    guildId: string,
    messageId: string,
    emoji: string,
    roleId: string,
  ): Promise<ReactionRole> {
    const reactionRole = this.reactionRoleRepository.create({
      messageId,
      emoji,
      roleId,
      guild: { id: guildId },
    });

    return this.reactionRoleRepository.save(reactionRole);
  }

  /**
   * Get all reaction roles for a guild
   * @param guildId The guild ID
   * @returns The reaction roles
   */
  async getReactionRoles(guildId: string): Promise<ReactionRole[]> {
    return this.reactionRoleRepository.find({
      where: { guild: { id: guildId } },
    });
  }

  /**
   * Get a reaction role by message ID and emoji
   * @param messageId The message ID
   * @param emoji The emoji
   * @returns The reaction role
   */
  async getReactionRole(
    messageId: string,
    emoji: string,
  ): Promise<ReactionRole | null> {
    return this.reactionRoleRepository.findOne({
      where: { messageId, emoji },
      relations: ['guild'],
    });
  }

  /**
   * Delete a reaction role
   * @param id The reaction role ID
   * @returns The deleted reaction role
   */
  async deleteReactionRole(id: string): Promise<ReactionRole> {
    const reactionRole = await this.reactionRoleRepository.findOne({
      where: { id },
    });

    if (!reactionRole) {
      throw new Error('Reaction role not found');
    }

    await this.reactionRoleRepository.remove(reactionRole);
    return reactionRole;
  }

  /**
   * Check if the bot has permission to manage roles
   * @param guild The Discord guild
   * @returns Whether the bot has permission to manage roles
   */
  hasPermission(guild: DiscordGuild): boolean {
    const botMember = guild.members.cache.get(guild.client.user.id);
    return botMember?.permissions.has('ManageRoles') ?? false;
  }

  /**
   * Check if the role is valid for assignment
   * @param guild The Discord guild
   * @param roleId The role ID
   * @returns Whether the role is valid
   */
  isValidRole(guild: DiscordGuild, roleId: string): boolean {
    const role = guild.roles.cache.get(roleId);
    if (!role) return false;

    // Check if it's the @everyone role
    if (role.id === guild.id) return false;

    // Check if the bot's highest role is higher than the role to assign
    const botMember = guild.members.cache.get(guild.client.user.id);
    if (!botMember) return false;

    return botMember.roles.highest.position > role.position;
  }

  /**
   * Assign a role to a member
   * @param member The guild member
   * @param role The role
   * @returns Whether the role was assigned
   */
  async assignRole(member: GuildMember, role: Role): Promise<boolean> {
    try {
      await member.roles.add(role);
      return true;
    } catch (error) {
      console.error('Error assigning role:', error);
      return false;
    }
  }

  /**
   * Remove a role from a member
   * @param member The guild member
   * @param role The role
   * @returns Whether the role was removed
   */
  async removeRole(member: GuildMember, role: Role): Promise<boolean> {
    try {
      await member.roles.remove(role);
      return true;
    } catch (error) {
      console.error('Error removing role:', error);
      return false;
    }
  }
}
