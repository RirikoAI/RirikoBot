import { DiscordClient } from '#discord/discord.client';
import { Events, GuildMember, GuildTextBasedChannel } from 'discord.js';
import { Logger } from '@nestjs/common';
import { CommandService } from '#command/command.service';
import { WelcomeCard } from '#util/banner/welcome-card.util';

export const GuildMemberRemoveEvent = (
  client: DiscordClient,
  commandService: CommandService,
) => {
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    try {
      const guild = await commandService.db.guildRepository.findOne({
        where: {
          id: member.guild.id,
        },
      });

      const farewellEnabled = guild?.configurations?.find(
        (config) => config.name === 'farewell_enabled',
      );

      if (farewellEnabled.value !== 'true') {
        return;
      }

      // get the channel id
      const channelID = guild?.configurations?.find(
        (config) => config.name === 'farewell_channel',
      );

      // get the channel
      const channel = member.guild.channels.cache.get(
        channelID.value,
      ) as GuildTextBasedChannel;

      // send the message
      const welcomeCard = new WelcomeCard();
      const buffer = await welcomeCard.generate({
        displayName: member.displayName,
        avatarURL: member.displayAvatarURL({
          extension: 'png',
          size: 512,
        }),
        welcomeText: 'Good Bye',
        backgroundColor: '#ff9700',
        backgroundColor2: '#ff4700',
        borderColor: '#ff0000',
        borderColor2: '#970000',
        bubblesColor: 'rgba(255, 255, 255, 0.5)',
        // backgroundImgURL: 'https://i.imgur.com/70gHapy.jpeg',
      });

      channel.send({
        content: `Goodbye, <@${member.id}>!`,
        files: [
          {
            attachment: buffer,
            name: 'goodbye-card.png',
          },
        ],
      });
    } catch (error) {
      Logger.error(error.message, error.stack);
    }
  });
};
