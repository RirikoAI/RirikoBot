import type { Client, GuildMember } from 'discord.js';
import type { BotServices } from '../services.js';

/**
 * Gateway Member Listener: Monitors member join events, evaluates join velocity
 * and suspicious fresh account surges via AntiRaidService, and posts alerts to the staff mod-log channel.
 */
export function registerMemberListener(
  client: Client,
  services: BotServices,
): void {
  client.on('guildMemberAdd', async (member: GuildMember) => {
    try {
      // 1. Evaluate join event in AntiRaidService
      const result = await services.antiRaidService.handleMemberJoin({
        guildId: member.guild.id,
        userId: member.id,
        accountCreatedTimestamp: member.user.createdTimestamp,
        joinedTimestamp: member.joinedTimestamp ?? Date.now(),
        isBot: member.user.bot,
        username: member.user.username,
      });

      // 2. If raid criteria met, dispatch alert embed to staff log channel
      if (result.isRaid) {
        console.warn(
          `[AntiRaid] 🚨 Raid activity detected in guild ${member.guild.name} (${member.guild.id}): ${result.reason}`,
        );

        // Fetch guild settings to discover configured log channel
        const settings = await services.guildSettingsRepo
          .findById(member.guild.id)
          .catch(() => null);

        const modLogChannelId = settings?.logChannelId ?? undefined;

        if (modLogChannelId) {
          const logChannel =
            member.guild.channels.cache.get(modLogChannelId) ??
            (await member.guild.channels.fetch(modLogChannelId).catch(() => null));

          if (logChannel && 'send' in logChannel) {
            const alertEmbed = services.antiRaidService.generateAlertEmbed(result);
            await (logChannel as { send: (payload: unknown) => Promise<unknown> })
              .send({ embeds: [alertEmbed] })
              .catch((sendErr) => {
                console.error('[AntiRaid] Failed to dispatch raid alert to channel:', sendErr);
              });
          }
        }
      }

      // 3. Assign automated join roles via AutoRoleService
      await services.autoRoleService.handleMemberJoin(member).catch((roleErr) => {
        console.error(`[AutoRole] Failed to assign join roles for member ${member.id}:`, roleErr);
      });
    } catch (err) {
      console.error('[MemberListener] Error handling guildMemberAdd event:', err);
    }
  });
}
