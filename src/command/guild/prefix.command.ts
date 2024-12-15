import { Injectable } from '@nestjs/common';
import {
  EmbedBuilder,
  GuildMember,
  Message,
  PermissionsBitField,
} from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { SlashCommandOptionTypes } from '#command/command.types';
import { DiscordPermissions } from '#util/features/permissions.util';

/**
 * Command to set the prefix for the Discord server
 * @category Command
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export default class PrefixCommand extends Command implements CommandInterface {
  name = 'prefix';
  regex = /^(prefix|setprefix)\s*/i;
  description = 'Set prefix for this Discord server';
  category = 'guild';
  usageExamples = ['prefix', 'prefix <prefix>', 'setprefix <prefix>'];

  slashOptions = [
    {
      type: SlashCommandOptionTypes.String, // STRING type
      name: 'newprefix',
      description: 'New prefix to set',
      required: false,
    },
  ];

  permissions: DiscordPermissions = ['ManageGuild'];

  async runPrefix(message: Message): Promise<void> {
    // Check for permission
    if (!this.checkPermission(message.member)) {
      await message.reply({
        content: `You don't have the required permission to change the prefix`,
      });
      return;
    }

    // If no parameters are provided, display the current prefix
    if (this.params.length === 0) {
      await this.sendPrefixResponse(message);
    } else {
      // Update the prefix
      await this.updateGuildPrefix(message, this.params[0]);
      await this.sendPrefixResponse(message, this.params[0]);
    }
  }

  async runSlash(interaction: any): Promise<void> {
    // Check for permission
    if (!this.checkPermission(interaction.member)) {
      await interaction.reply({
        content: `You don't have the required permission to change the prefix`,
        ephemeral: false,
      });
      return;
    }

    // Get the new prefix from the interaction options
    const prefix = interaction.options.getString('newprefix');
    if (!prefix) {
      // Display current prefix if none is provided
      await this.sendPrefixResponse(interaction);
    } else {
      // Update the prefix
      await this.updateGuildPrefix(interaction, prefix);
      await this.sendPrefixResponse(interaction, prefix);
    }
  }

  private checkPermission(member: GuildMember): boolean {
    return member.permissions.has(
      PermissionsBitField.Flags.ManageChannels,
      true,
    );
  }

  private async updateGuildPrefix(
    message: Message | any,
    prefix: string,
  ): Promise<void> {
    const guildId = message.guild.id;
    await this.db.guildRepository.upsert(
      {
        id: guildId,
        prefix,
        name: message.guild.name,
      },
      ['id'],
    );
  }

  private async sendPrefixResponse(
    context: Message | any,
    prefix: string = '',
  ): Promise<void> {
    const currentPrefix = prefix || (await this.getGuildPrefix(context));
    const embed = new EmbedBuilder().addFields([
      {
        name: `Prefix`,
        value: `The current server prefix is: \`${currentPrefix}\``,
      },
      {
        name: 'Usage',
        value: `${currentPrefix}${this.usageExamples.join('\n' + currentPrefix)}`,
      },
    ]);

    // Send the reply (message or interaction)
    if (context instanceof Message) {
      await context.reply({ embeds: [embed] });
    } else {
      await context.reply({ embeds: [embed], ephemeral: false });
    }
  }
}
