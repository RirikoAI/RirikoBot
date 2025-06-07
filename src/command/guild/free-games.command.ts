import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { EmbedBuilder } from 'discord.js';

/**
 * FreeGamesCommand
 * @description Command to send alerts about free games from Epic and Steam
 * @category Command
 * @author AI Assistant
 */
export default class FreeGamesCommand
  extends Command
  implements CommandInterface
{
  name = 'freegames';
  description = 'Get alerts about free games from Epic and Steam';
  regex = new RegExp('^freegames$|^freegames ', 'i');
  category = 'general';
  usageExamples = [
    'freegames',
    'freegames setchannel #channel',
    'freegames remove',
  ];

  slashOptions = [
    {
      name: 'show',
      description: 'Show current free games from Epic and Steam',
      type: SlashCommandOptionTypes.Subcommand,
    },
    {
      name: 'setchannel',
      description: 'Set the channel for free games alerts',
      type: SlashCommandOptionTypes.Subcommand,
      options: [
        {
          name: 'channel',
          description: 'The channel to send free games alerts to',
          type: SlashCommandOptionTypes.Channel,
          required: true,
        },
      ],
    },
    {
      name: 'remove',
      description: 'Remove the free games alerts channel configuration',
      type: SlashCommandOptionTypes.Subcommand,
    },
  ];

  async runPrefix(message: DiscordMessage) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0]?.toLowerCase();

    if (subCommand === 'setchannel') {
      // Get the channel mention from the message
      const channelMention = message.mentions.channels.first();
      if (!channelMention) {
        return message.reply(
          'Please mention a channel to set for free games alerts.',
        );
      }

      await this.setFreeGamesChannel(message, channelMention.id);
    } else if (subCommand === 'remove') {
      // Remove the free games channel configuration
      await this.removeFreeGamesChannel(message);
    } else {
      // Default to showing free games
      await this.sendFreeGamesAlert(message);
    }
  }

  async runSlash(interaction: DiscordInteraction) {
    const subCommand = interaction.options.getSubcommand();

    if (subCommand === 'setchannel') {
      const channel = interaction.options.getChannel('channel');
      await this.setFreeGamesChannel(interaction, channel.id);
    } else if (subCommand === 'remove') {
      // Remove the free games channel configuration
      await this.removeFreeGamesChannel(interaction);
    } else {
      // Default to showing free games
      await interaction.deferReply();
      await this.sendFreeGamesAlert(interaction);
    }
  }

  /**
   * Remove the free games channel configuration
   * @param interaction Discord interaction or message
   */
  private async removeFreeGamesChannel(
    interaction: DiscordMessage | DiscordInteraction,
  ) {
    try {
      // Get the guild ID
      const guildId =
        'guild' in interaction && interaction.guild
          ? interaction.guild.id
          : null;

      if (!guildId) {
        const errorMessage = 'This command can only be used in a server.';
        if ('author' in interaction) {
          await interaction.reply(errorMessage);
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
        return;
      }

      // Get the guild from the database
      const guild = await this.services.db.guildRepository.findOne({
        where: { id: guildId },
      });

      if (!guild) {
        const errorMessage = 'No configuration found for this server.';
        if ('author' in interaction) {
          await interaction.reply(errorMessage);
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
        return;
      }

      // Check if a config exists for this guild
      const existingConfig =
        await this.services.db.guildConfigRepository.findOne({
          where: { guild, name: 'freeGamesChannelId' },
        });

      if (!existingConfig) {
        const errorMessage =
          'No free games channel is configured for this server.';
        if ('author' in interaction) {
          await interaction.reply(errorMessage);
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
        return;
      }

      // Remove the config
      await this.services.db.guildConfigRepository.remove(existingConfig);

      const successMessage = 'Free games alerts channel has been removed.';
      if ('author' in interaction) {
        await interaction.reply(successMessage);
      } else {
        await interaction.reply({ content: successMessage, ephemeral: true });
      }
    } catch (error) {
      console.error('Error removing free games channel:', error);
      const errorMessage = `An error occurred while removing the free games channel: ${error.message}`;
      if ('author' in interaction) {
        await interaction.reply(errorMessage);
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }

  /**
   * Set the channel for free games alerts
   * @param interaction Discord interaction or message
   * @param channelId The channel ID to set
   */
  private async setFreeGamesChannel(
    interaction: DiscordMessage | DiscordInteraction,
    channelId: string,
  ) {
    try {
      // Get the guild ID
      const guildId =
        'guild' in interaction && interaction.guild
          ? interaction.guild.id
          : null;

      if (!guildId) {
        const errorMessage = 'This command can only be used in a server.';
        if ('author' in interaction) {
          await interaction.reply(errorMessage);
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
        return;
      }

      // Check if the channel exists and is a text channel
      const channel =
        await this.services.discord.client.channels.fetch(channelId);
      if (!channel || !(channel.isTextBased() && 'send' in channel)) {
        const errorMessage =
          'The specified channel is not a valid text channel.';
        if ('author' in interaction) {
          await interaction.reply(errorMessage);
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
        return;
      }

      // Get the guild from the database or create it if it doesn't exist
      let guild = await this.services.db.guildRepository.findOne({
        where: { id: guildId },
      });

      if (!guild) {
        guild = await this.services.db.guildRepository.save({
          guildId,
          name:
            'guild' in interaction && interaction.guild
              ? interaction.guild.name
              : '',
        });
      }

      // Check if a config already exists for this guild
      const existingConfig =
        await this.services.db.guildConfigRepository.findOne({
          where: { guild, name: 'freeGamesChannelId' },
        });

      if (existingConfig) {
        // Update the existing config
        existingConfig.value = channelId;
        await this.services.db.guildConfigRepository.save(existingConfig);
      } else {
        // Create a new config
        await this.services.db.guildConfigRepository.save({
          guild,
          name: 'freeGamesChannelId',
          value: channelId,
        });
      }

      const successMessage = `Free games alerts will now be sent to <#${channelId}>.`;
      if ('author' in interaction) {
        await interaction.reply(successMessage);
      } else {
        await interaction.reply({ content: successMessage, ephemeral: true });
      }
    } catch (error) {
      console.error('Error setting free games channel:', error);
      const errorMessage = `An error occurred while setting the free games channel: ${error.message}`;
      if ('author' in interaction) {
        await interaction.reply(errorMessage);
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }

  /**
   * Send alerts about free games from Epic and Steam
   * @param interaction Discord interaction or message
   */
  private async sendFreeGamesAlert(
    interaction: DiscordMessage | DiscordInteraction,
  ) {
    try {
      // Get free games from Epic and Steam
      const epicGames = await this.services.freeGamesService.getEpicFreeGames();
      const steamGames =
        await this.services.freeGamesService.getSteamFreeGames();

      // Create embeds
      const epicEmbed = this.services.freeGamesService.createFreeGamesEmbed(
        epicGames,
        'Epic',
      );
      const steamEmbed = this.services.freeGamesService.createFreeGamesEmbed(
        steamGames,
        'Steam',
      );

      // Send embeds
      if ('author' in interaction) {
        await interaction.reply({ embeds: [epicEmbed, steamEmbed] });
      } else {
        await interaction.editReply({ embeds: [epicEmbed, steamEmbed] });
      }
    } catch (error) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Error')
        .setDescription(
          `An error occurred while fetching free games: ${error.message}`,
        )
        .setTimestamp();

      if ('author' in interaction) {
        await interaction.reply({ embeds: [errorEmbed] });
      } else {
        await interaction.editReply({ embeds: [errorEmbed] });
      }
    }
  }

  /**
   * Send alerts to the configured channel
   * This method can be called by a scheduled task
   */
  async sendAlertToConfiguredChannel() {
    try {
      // Get all guilds from the database
      const guilds = await this.services.db.guildRepository.find();

      if (guilds.length === 0) {
        console.log('No guilds found in the database');
        return;
      }

      // Get free games from Epic and Steam (do this once for all guilds)
      const epicGames = await this.services.freeGamesService.getEpicFreeGames();
      const steamGames =
        await this.services.freeGamesService.getSteamFreeGames();

      if (epicGames.length === 0 && steamGames.length === 0) {
        console.log('No free games found');
        return;
      }

      // For each guild, check if they have a configured channel and send the alert
      for (const guild of guilds) {
        try {
          // Get the guild config for free games channel
          const guildConfig =
            await this.services.db.guildConfigRepository.findOne({
              where: { guild, name: 'freeGamesChannelId' },
            });

          if (!guildConfig) {
            console.log(
              `No free games channel configured for guild ${guild.name} (${guild.id})`,
            );
            continue;
          }

          const channelId = guildConfig.value;

          // Get the channel
          const channel =
            await this.services.discord.client.channels.fetch(channelId);
          if (!channel || !(channel.isTextBased() && 'send' in channel)) {
            console.log(
              `Channel ${channelId} for guild ${guild.name} (${guild.id}) not found or does not support sending messages`,
            );
            continue;
          }

          // Check for new games that haven't been notified yet
          const newEpicGames = [];
          const newSteamGames = [];

          // Process Epic games
          for (const game of epicGames) {
            const gameId = game.id || game.productSlug || game.urlSlug;
            const gameName = game.title;

            // Check if this game has already been notified for this guild
            const existingNotification =
              await this.services.db.freeGameNotificationRepository.findOne({
                where: {
                  guildId: guild.id,
                  gameId,
                  source: 'Epic',
                  notified: true,
                },
              });

            if (!existingNotification) {
              newEpicGames.push(game);

              // Create a notification record
              await this.services.db.freeGameNotificationRepository.save({
                guildId: guild.id,
                gameId,
                gameName,
                source: 'Epic',
                notified: true,
                guild,
              });
            }
          }

          // Process Steam games
          for (const game of steamGames) {
            const gameId = game.url;
            const gameName = game.name;

            // Check if this game has already been notified for this guild
            const existingNotification =
              await this.services.db.freeGameNotificationRepository.findOne({
                where: {
                  guildId: guild.id,
                  gameId,
                  source: 'Steam',
                  notified: true,
                },
              });

            if (!existingNotification) {
              newSteamGames.push(game);

              // Create a notification record
              await this.services.db.freeGameNotificationRepository.save({
                guildId: guild.id,
                gameId,
                gameName,
                source: 'Steam',
                notified: true,
                guild,
              });
            }
          }

          // If there are no new games, skip sending notification
          if (newEpicGames.length === 0 && newSteamGames.length === 0) {
            console.log(
              `No new free games to notify for guild ${guild.name} (${guild.id})`,
            );
            continue;
          }

          // Create embeds for new games only
          const newEpicEmbed =
            this.services.freeGamesService.createFreeGamesEmbed(
              newEpicGames,
              'Epic',
            );
          const newSteamEmbed =
            this.services.freeGamesService.createFreeGamesEmbed(
              newSteamGames,
              'Steam',
            );

          // Prepare embeds to send (only include non-empty ones)
          const embedsToSend = [];
          if (newEpicGames.length > 0) embedsToSend.push(newEpicEmbed);
          if (newSteamGames.length > 0) embedsToSend.push(newSteamEmbed);

          // Send embeds to the channel
          await channel.send({
            content:
              '🎮 **Free Games Alert** 🎮\nHere are the latest free games from Epic Games Store and Steam!',
            embeds: embedsToSend,
          });

          console.log(
            `Free games alert sent to channel ${channelId} in guild ${guild.name} (${guild.id})`,
          );
        } catch (error) {
          console.error(
            `Error sending free games alert to guild ${guild.name} (${guild.id}):`,
            error,
          );
        }
      }
    } catch (error) {
      console.error('Error sending free games alerts:', error);
    }
  }
}
