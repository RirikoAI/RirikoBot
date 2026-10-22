import type { Client, GuildMember } from 'discord.js';
import type { BotServices } from '../services.js';

type Services = Pick<BotServices, 'eventBus' | 'levelRoleService' | 'xpRepo'>;

/**
 * Gives the level role rewards. A level-up from chat, voice or an item reaches the event bus as
 * `leveling:levelUp` (whatever the announcement settings say), and a member who comes back to a
 * server keeps their XP, so their rewards are given again when they rejoin. Each handler catches
 * its own errors; nothing reaches the gateway or the event bus as an unhandled rejection.
 */
export function registerLevelRolesListener(client: Client, services: Services): void {
  const { eventBus, levelRoleService, xpRepo } = services;

  eventBus.on('leveling:levelUp', async ({ guildId, userId, newLevel }) => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;
      const member: GuildMember | null = await guild.members.fetch(userId).catch(() => null);
      if (!member) return;
      await levelRoleService.applyForMember(member, newLevel);
    } catch (error) {
      console.error(`[LevelRoles] Failed to give level rewards in guild ${guildId}:`, error);
    }
  });

  client.on('guildMemberAdd', async (member: GuildMember) => {
    try {
      if (member.user.bot) return;
      const account = await xpRepo.getAccount(member.id, member.guild.id);
      // applyForMember does nothing when the server has no rewards.
      if (!account || account.level <= 0) return;
      await levelRoleService.applyForMember(member, account.level);
    } catch (error) {
      console.error(
        `[LevelRoles] Failed to restore level rewards in guild ${member.guild.id}:`,
        error,
      );
    }
  });
}
