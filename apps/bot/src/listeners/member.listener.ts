import {
  AttachmentBuilder,
  type Client,
  type Guild,
  type GuildMember,
  type PartialGuildMember,
} from 'discord.js';
import { fillWelcomerText } from '@ririko/services';
import type { BotServices } from '../services.js';

/** The channels of the server by name, for turning `#channel-name` in the text into a link. */
function namedChannels(guild: Guild): { id: string; name: string }[] {
  const channels: { id: string; name: string }[] = [];
  for (const channel of guild.channels.cache.values()) {
    if (channel.isThread() || typeof channel.name !== 'string') continue;
    channels.push({ id: channel.id, name: channel.name });
  }
  return channels;
}

/** The optional text of a welcome or farewell card, or null when it is off or empty. */
function cardText(
  config: { textMessageEnabled?: boolean; textMessage?: string },
  guild: Guild,
  who: { user: string; username: string },
): string | null {
  if (!config.textMessageEnabled || !config.textMessage?.trim()) return null;
  const text = fillWelcomerText(config.textMessage, {
    ...who,
    serverName: guild.name,
    memberCount: guild.memberCount,
    channels: namedChannels(guild),
  });
  return text.trim() === '' ? null : text;
}

/**
 * Gateway Member Listener: Monitors member join events, evaluates join velocity
 * and suspicious fresh account surges via AntiRaidService, and posts alerts to the staff mod-log channel.
 */
export function registerMemberListener(client: Client, services: BotServices): void {
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

      // 4. Send Welcome Card
      const welcomeConfig = await services.welcomerRepo
        .getWelcomeConfig(member.guild.id)
        .catch(() => null);
      if (welcomeConfig?.isEnabled && welcomeConfig.channelId) {
        const channel =
          member.guild.channels.cache.get(welcomeConfig.channelId) ??
          (await member.guild.channels.fetch(welcomeConfig.channelId).catch(() => null));
        if (channel && channel.isTextBased() && 'send' in channel) {
          const cardBuf = await services.welcomerService.renderCard({
            userTag: member.user.tag,
            avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
            memberCount: member.guild.memberCount,
            serverName: member.guild.name,
            messageText: welcomeConfig.messageTemplate,
            background: await services.welcomerService.loadBackground(welcomeConfig),
            textColor: welcomeConfig.textColor,
            isFarewell: false,
          });
          const attachment = new AttachmentBuilder(cardBuf, { name: 'welcome.png' });
          const text = cardText(welcomeConfig, member.guild, {
            user: `<@${member.id}>`,
            username: member.user.username,
          });
          // Only the joining member can be pinged by the text, never @everyone, @here or a role.
          const payload = text
            ? { files: [attachment], content: text, allowedMentions: { users: [member.id] } }
            : { files: [attachment] };
          await (channel as any).send(payload).catch((err: any) => {
            console.error(`[Welcomer] Failed to send welcome for ${member.id}:`, err);
          });
        }
      }
    } catch (err) {
      console.error('[MemberListener] Error handling guildMemberAdd event:', err);
    }
  });

  client.on('guildMemberRemove', async (member: GuildMember | PartialGuildMember) => {
    try {
      const farewellConfig = await services.welcomerRepo
        .getFarewellConfig(member.guild.id)
        .catch(() => null);
      if (farewellConfig?.isEnabled && farewellConfig.channelId) {
        const channel =
          member.guild.channels.cache.get(farewellConfig.channelId) ??
          (await member.guild.channels.fetch(farewellConfig.channelId).catch(() => null));
        if (channel && channel.isTextBased() && 'send' in channel) {
          const user = member.user;
          const cardBuf = await services.welcomerService.renderCard({
            userTag: user ? user.tag || user.username : 'Unknown User',
            avatarUrl:
              user?.displayAvatarURL({ extension: 'png', size: 256 }) ??
              'https://cdn.discordapp.com/embed/avatars/0.png',
            memberCount: member.guild.memberCount,
            serverName: member.guild.name,
            messageText: farewellConfig.messageTemplate,
            background: await services.welcomerService.loadBackground(farewellConfig),
            textColor: farewellConfig.textColor,
            isFarewell: true,
          });
          const attachment = new AttachmentBuilder(cardBuf, { name: 'farewell.png' });
          const name = user?.username ?? 'Unknown User';
          const text = cardText(farewellConfig, member.guild, { user: name, username: name });
          // The farewell text pings nobody.
          const payload = text
            ? { files: [attachment], content: text, allowedMentions: { parse: [] } }
            : { files: [attachment] };
          await (channel as any).send(payload).catch((err: any) => {
            console.error(`[Farewell] Failed to send farewell for ${member.id}:`, err);
          });
        }
      }
    } catch (err) {
      console.error('[MemberListener] Error handling guildMemberRemove event:', err);
    }
  });
}
