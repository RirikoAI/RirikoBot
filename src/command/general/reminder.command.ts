import { Injectable, Logger } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';

/**
 * Reminder command
 * @description Command for setting reminders
 */
@Injectable()
export default class ReminderCommand
  extends Command
  implements CommandInterface
{
  private readonly logger = new Logger(ReminderCommand.name);

  name = 'reminder';
  regex = new RegExp('^reminder|^remindme', 'i');
  description = 'Set a reminder for yourself';
  category = 'general';
  usageExamples = [
    'remindme 1h Take a break',
    'remindme 30m Check the oven',
    'remindme 2d Call mom',
    'remindme 2023-12-25 08:00 Open presents',
  ];

  // Define slash command options
  slashOptions = [
    {
      type: SlashCommandOptionTypes.Subcommand,
      name: 'set',
      description: 'Set a new reminder',
      options: [
        {
          type: SlashCommandOptionTypes.String,
          name: 'time',
          description:
            'When to remind you (e.g., 1h, 30m, 2d, or 2023-12-25 08:00)',
          required: true,
        },
        {
          type: SlashCommandOptionTypes.String,
          name: 'message',
          description: 'What to remind you about',
          required: true,
        },
      ],
    },
    {
      type: SlashCommandOptionTypes.Subcommand,
      name: 'list',
      description: 'List your active reminders',
    },
    {
      type: SlashCommandOptionTypes.Subcommand,
      name: 'cancel',
      description: 'Cancel a reminder',
      options: [
        {
          type: SlashCommandOptionTypes.String,
          name: 'id',
          description: 'The ID of the reminder to cancel',
          required: true,
        },
      ],
    },
  ];

  /**
   * Run the prefix command
   * @param message The message that triggered the command
   */
  async runPrefix(message: DiscordMessage): Promise<void> {
    const content = message.content.trim();

    // Check if it's a list command
    if (/^remind(er|me)\s+list$/i.test(content)) {
      await this.listReminders(message);
      return;
    }

    // Check if it's a cancel command
    if (/^remind(er|me)\s+cancel\s+/i.test(content)) {
      const id = content.replace(/^remind(er|me)\s+cancel\s+/i, '').trim();
      await this.cancelReminder(message, id);
      return;
    }

    // It's a set command
    const match = content.match(/^remind(er|me)\s+(.+?)\s+(.+)$/i);

    if (!match) {
      await message.reply({
        content:
          '❌ Invalid format. Please use `remindme <time> <message>` (e.g., `remindme 1h Take a break`).',
      });
      return;
    }

    const timeString = match[2];
    const reminderMessage = match[3];

    await this.setReminder(message, timeString, reminderMessage);
  }

  /**
   * Run the slash command
   * @param interaction The interaction that triggered the command
   */
  async runSlash(interaction: DiscordInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
      await this.listRemindersInteraction(interaction);
      return;
    }

    if (subcommand === 'cancel') {
      const id = interaction.options.getString('id', true);
      await this.cancelReminderInteraction(interaction, id);
      return;
    }

    if (subcommand === 'set') {
      const timeString = interaction.options.getString('time', true);
      const reminderMessage = interaction.options.getString('message', true);

      await this.setReminderInteraction(
        interaction,
        timeString,
        reminderMessage,
      );
      return;
    }
  }

  /**
   * Set a reminder (prefix command)
   * @param message The message that triggered the command
   * @param timeString The time string (e.g., 1h, 30m, 2d, or 2023-12-25 08:00)
   * @param reminderMessage The reminder message
   */
  private async setReminder(
    message: DiscordMessage,
    timeString: string,
    reminderMessage: string,
  ): Promise<void> {
    try {
      const scheduledTime = this.parseTime(timeString);

      if (!scheduledTime) {
        await message.reply({
          content:
            '❌ Invalid time format. Please use a relative time (e.g., 1h, 30m, 2d) or an absolute date and time (e.g., 2023-12-25 08:00).',
        });
        return;
      }

      // Check if the time is too far in the future (more than 1 year)
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

      if (scheduledTime > oneYearFromNow) {
        await message.reply({
          content:
            '❌ The reminder time is too far in the future. Please set a reminder within the next year.',
        });
        return;
      }

      // Check if the time is in the past
      if (scheduledTime < new Date()) {
        await message.reply({
          content:
            '❌ The reminder time is in the past. Please set a reminder for a future time.',
        });
        return;
      }

      // Create the reminder
      const reminder = await this.services.reminderService.createReminder(
        message.author.id,
        message.channel.id,
        message.guild?.id || 'DM',
        reminderMessage,
        scheduledTime,
      );

      // Format the time for display
      // const formattedTime = scheduledTime.toLocaleString();

      // Send confirmation
      const embed = new EmbedBuilder()
        .setTitle('✅ Reminder Set')
        .setDescription(`I'll remind you about: **${reminderMessage}**`)
        .addFields([
          {
            name: 'When',
            value: `<t:${Math.floor(scheduledTime.getTime() / 1000)}:F> (<t:${Math.floor(scheduledTime.getTime() / 1000)}:R>)`,
          },
          {
            name: 'Reminder ID',
            value: reminder.id,
            inline: true,
          },
          {
            name: '\u200B',
            value:
              'ℹ️ Use "remindme list" to see your reminders or "remindme cancel <id>" to cancel',
          },
        ])
        .setColor('#00FF00')
        .setThumbnail(this.client.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({
          text: `Made with ❤️ by Ririko`,
        });

      await message.reply({
        embeds: [embed],
      });
    } catch (error) {
      this.logger.error(`Error setting reminder: ${error.message}`);

      await message.reply({
        content:
          '❌ An error occurred while setting your reminder. Please try again later.',
      });
    }
  }

  /**
   * Set a reminder (interaction command)
   * @param interaction The interaction that triggered the command
   * @param timeString The time string (e.g., 1h, 30m, 2d, or 2023-12-25 08:00)
   * @param reminderMessage The reminder message
   */
  private async setReminderInteraction(
    interaction: DiscordInteraction,
    timeString: string,
    reminderMessage: string,
  ): Promise<void> {
    try {
      const scheduledTime = this.parseTime(timeString);

      if (!scheduledTime) {
        await interaction.reply({
          content:
            '❌ Invalid time format. Please use a relative time (e.g., 1h, 30m, 2d) or an absolute date and time (e.g., 2023-12-25 08:00).',
          ephemeral: true,
        });
        return;
      }

      // Check if the time is too far in the future (more than 1 year)
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

      if (scheduledTime > oneYearFromNow) {
        await interaction.reply({
          content:
            '❌ The reminder time is too far in the future. Please set a reminder within the next year.',
          ephemeral: true,
        });
        return;
      }

      // Check if the time is in the past
      if (scheduledTime < new Date()) {
        await interaction.reply({
          content:
            '❌ The reminder time is in the past. Please set a reminder for a future time.',
          ephemeral: true,
        });
        return;
      }

      // Create the reminder
      const reminder = await this.services.reminderService.createReminder(
        interaction.user.id,
        interaction.channel.id,
        interaction.guild?.id || 'DM',
        reminderMessage,
        scheduledTime,
      );

      // Format the time for display
      // const formattedTime = scheduledTime.toLocaleString();

      // Send confirmation
      const embed = new EmbedBuilder()
        .setTitle('✅ Reminder Set')
        .setDescription(`I'll remind you about: **${reminderMessage}**`)
        .addFields([
          {
            name: 'When',
            value: `<t:${Math.floor(scheduledTime.getTime() / 1000)}:F> (<t:${Math.floor(scheduledTime.getTime() / 1000)}:R>)`,
          },
          {
            name: 'Reminder ID',
            value: reminder.id,
            inline: true,
          },
          {
            name: '\u200B',
            value:
              'ℹ️ Use "/reminder list" to see your reminders or "/reminder cancel" to cancel',
          },
        ])
        .setColor('#00FF00')
        .setThumbnail(this.client.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({
          text: `Made with ❤️ by Ririko`,
        });

      await interaction.reply({
        embeds: [embed],
      });
    } catch (error) {
      this.logger.error(`Error setting reminder: ${error.message}`);

      await interaction.reply({
        content:
          '❌ An error occurred while setting your reminder. Please try again later.',
        ephemeral: true,
      });
    }
  }

  /**
   * List reminders (prefix command)
   * @param message The message that triggered the command
   */
  private async listReminders(message: DiscordMessage): Promise<void> {
    try {
      const reminders = await this.services.reminderService.getUserReminders(
        message.author.id,
      );

      if (reminders.length === 0) {
        await message.reply({
          content: '📝 You have no active reminders.',
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📝 Your Reminders')
        .setDescription(`You have ${reminders.length} active reminder(s)`)
        .setColor('#0099FF');

      for (const reminder of reminders) {
        embed.addFields([
          {
            name: `${reminder.message}`,
            value: `ID: \`${reminder.id}\`\nWhen: <t:${Math.floor(reminder.scheduledTime.getTime() / 1000)}:F> (<t:${Math.floor(reminder.scheduledTime.getTime() / 1000)}:R>)`,
          },
        ]);
      }

      embed.addFields([
        {
          name: '\u200B ',
          value: 'ℹ️ Use "remindme cancel <id>" to cancel a reminder',
        },
      ]);

      embed
        .setThumbnail(this.client.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({
          text: `Made with ❤️ by Ririko`,
        });

      await message.reply({
        embeds: [embed],
      });
    } catch (error) {
      this.logger.error(`Error listing reminders: ${error.message}`);

      await message.reply({
        content:
          '❌ An error occurred while listing your reminders. Please try again later.',
      });
    }
  }

  /**
   * List reminders (interaction command)
   * @param interaction The interaction that triggered the command
   */
  private async listRemindersInteraction(
    interaction: DiscordInteraction,
  ): Promise<void> {
    try {
      const reminders = await this.services.reminderService.getUserReminders(
        interaction.user.id,
      );

      if (reminders.length === 0) {
        await interaction.reply({
          content: '📝 You have no active reminders.',
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📝 Your Reminders')
        .setDescription(`You have ${reminders.length} active reminder(s)`)
        .setColor('#0099FF');

      for (const reminder of reminders) {
        embed.addFields([
          {
            name: `${reminder.message}`,
            value: `ID: \`${reminder.id}\`\nWhen: <t:${Math.floor(reminder.scheduledTime.getTime() / 1000)}:F> (<t:${Math.floor(reminder.scheduledTime.getTime() / 1000)}:R>)`,
          },
        ]);
      }

      embed.addFields([
        {
          name: '\u200B ',
          value: 'ℹ️ Use "/reminder cancel" to cancel a reminder',
        },
      ]);

      embed
        .setThumbnail(this.client.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({
          text: `Made with ❤️ by Ririko`,
        });

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    } catch (error) {
      this.logger.error(`Error listing reminders: ${error.message}`);

      await interaction.reply({
        content:
          '❌ An error occurred while listing your reminders. Please try again later.',
        ephemeral: true,
      });
    }
  }

  /**
   * Cancel a reminder (prefix command)
   * @param message The message that triggered the command
   * @param id The ID of the reminder to cancel
   */
  private async cancelReminder(
    message: DiscordMessage,
    id: string,
  ): Promise<void> {
    try {
      const deleted = await this.services.reminderService.deleteReminder(
        id,
        message.author.id,
      );

      if (deleted) {
        await message.reply({
          content: '✅ Reminder cancelled successfully.',
        });
      } else {
        await message.reply({
          content:
            '❌ Reminder not found or you do not have permission to cancel it.',
        });
      }
    } catch (error) {
      this.logger.error(`Error cancelling reminder: ${error.message}`);

      await message.reply({
        content:
          '❌ An error occurred while cancelling your reminder. Please try again later.',
      });
    }
  }

  /**
   * Cancel a reminder (interaction command)
   * @param interaction The interaction that triggered the command
   * @param id The ID of the reminder to cancel
   */
  private async cancelReminderInteraction(
    interaction: DiscordInteraction,
    id: string,
  ): Promise<void> {
    try {
      const deleted = await this.services.reminderService.deleteReminder(
        id,
        interaction.user.id,
      );

      if (deleted) {
        await interaction.reply({
          content: '✅ Reminder cancelled successfully.',
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content:
            '❌ Reminder not found or you do not have permission to cancel it.',
          ephemeral: true,
        });
      }
    } catch (error) {
      this.logger.error(`Error cancelling reminder: ${error.message}`);

      await interaction.reply({
        content:
          '❌ An error occurred while cancelling your reminder. Please try again later.',
        ephemeral: true,
      });
    }
  }

  /**
   * Parse a time string into a Date object
   * @param timeString The time string to parse
   * @returns The parsed Date object, or null if the string is invalid
   */
  private parseTime(timeString: string): Date | null {
    // Try to parse as relative time (e.g., 1h, 30m, 2d)
    const relativeMatch = timeString.match(/^(\d+)([hmd])$/i);

    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2].toLowerCase();

      const now = new Date();

      switch (unit) {
        case 'm':
          now.setMinutes(now.getMinutes() + amount);
          break;
        case 'h':
          now.setHours(now.getHours() + amount);
          break;
        case 'd':
          now.setDate(now.getDate() + amount);
          break;
        default:
          return null;
      }

      return now;
    }

    // Try to parse as absolute date and time (e.g., 2023-12-25 08:00)
    try {
      // Check if it's a valid date format with regex
      const dateRegex = /^(\d{4})-(\d{2})-(\d{2})(\s+\d{1,2}:\d{2})?$/;
      const match = timeString.match(dateRegex);

      if (match) {
        // Extract year, month, day from the regex match
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; // JS months are 0-based
        const day = parseInt(match[3], 10);

        // Validate month and day
        if (month < 0 || month > 11 || day < 1 || day > 31) {
          return null;
        }

        const date = new Date(timeString);

        // Verify the date is valid and the year matches what was provided
        // This ensures we don't get unexpected year values
        if (!isNaN(date.getTime()) && date.getFullYear() === year) {
          return date;
        }
      }
    } catch (error) {
      // Ignore parsing errors
    }

    return null;
  }
}
