import { DiscordClient } from '#discord/discord.client';
import { Events, GuildMember, GuildTextBasedChannel } from 'discord.js';
import { Logger } from '@nestjs/common';
import { CommandService } from '#command/command.service';
import { WelcomeCard } from '#util/banner/welcome-card.util';

export const GuildMemberAddEvent = (
  client: DiscordClient,
  commandService: CommandService,
) => {
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    if (member.user.bot) return;
    Logger.log(
      `Member has joined the guild ${member.guild.name}: ${member.displayName}`,
      'GuildMemberAddEvent',
    );
    try {
      const guild = await commandService.db.guildRepository.findOne({
        where: {
          id: member.guild.id,
        },
      });

      const welcomerEnabled = guild?.configurations?.find(
        (config) => config.name === 'welcomer_enabled',
      );

      if (welcomerEnabled.value !== 'true') {
        Logger.log('Welcomer is not enabled for this guild.');
        return;
      } else {
        Logger.log(
          'Welcomer is enabled for this guild. Proceeding with welcome message and card.',
        );
      }

      // get the channel id
      const channelID = guild?.configurations?.find(
        (config) => config.name === 'welcomer_channel',
      );

      // get the channel
      const channel = member.guild.channels.cache.get(
        channelID.value,
      ) as GuildTextBasedChannel;

      Logger.log(`Channel ID for welcome message: ${channelID.value}`);

      // get the background image
      const bg = guild?.configurations?.find(
        (config) => config?.name === 'welcomer_bg',
      );

      // send the message
      const welcomeCard = new WelcomeCard();
      const buffer = await welcomeCard.generate({
        displayName: member.displayName,
        avatarURL: member.displayAvatarURL({
          extension: 'png',
          size: 512,
        }),
        welcomeText: 'Welcome',
        backgroundImgURL: bg?.value,
      });

      Logger.log('Welcome card generated successfully.');

      channel.send({
        content: `Welcome to the server, <@${member.id}>!`,
        files: [
          {
            attachment: buffer,
            name: 'welcome-card.png',
          },
        ],
      });

      Logger.log('Welcome message and card sent successfully.');
    } catch (error) {
      Logger.error(error.message, error.stack);
    }
  });
};
