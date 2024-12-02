import { Injectable } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';

/**
 * Help command
 * @description Display help message
 * @category Command
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export default class HelpCommand extends Command implements CommandInterface {
  name = 'help';
  regex = /^help$|^help /i;
  description = 'Display help message';
  category = 'general';
  usageExamples = ['help <command>'];

  slashOptions = [
    {
      type: SlashCommandOptionTypes.String, // STRING type
      name: 'command',
      description: 'Choose the command to get help for',
      required: false,
    },
  ];

  async runPrefix(message: DiscordMessage): Promise<void> {
    const prefix = await this.getGuildPrefix(message);
    let embed: EmbedBuilder;

    if (this.params.length === 0) {
      embed = this.createHelpEmbed(
        this.getCategorizedPrefixCommands(),
        'prefix',
      );
    } else {
      const command = this.services.commandService.getCommand(this.params[0]);
      if (!command) return;

      embed = this.createCommandHelpEmbed(command, prefix);
    }

    await message.reply({ embeds: [embed] });
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    const commandName = (interaction as any).options.getString('command');
    let embed: EmbedBuilder;

    if (commandName) {
      const command = this.services.commandService.getCommand(commandName);
      if (!command) {
        await interaction.reply({
          content: `Command not found`,
          ephemeral: true,
        });
        return;
      }

      embed = this.createCommandHelpEmbed(command);
    } else {
      embed = this.createHelpEmbed(this.getCategorizedSlashCommands(), 'slash');
    }

    await interaction.reply({ embeds: [embed] });
  }

  private createHelpEmbed(
    commandsMap: Map<string, CommandInterface[]>,
    type: 'prefix' | 'slash',
  ): EmbedBuilder {
    const embed = this.getBasicEmbed()
      .setTitle(`📚 Help`)
      .setDescription(`List of available ${type} commands for Ririko:`);
  
    const fields = Array.from(commandsMap)
      .filter(([category]) => category !== 'reactions') // Exclude "reactions" from the main categories
      .map(([category, commands]) => ({
        name: `__${category.charAt(0).toUpperCase() + category.slice(1)}__`,
        value:
          commands
            .map((command) => `**${command.name}** - ${command.description}`)
            .join('\n') + '\n\u200b',
        inline: false,
      }));
  
    // Add field for reactions information
    fields.push({
      name: `__Reactions__`,
      value: `There are over 60 reactions like **hug**, **blush**, **kiss** and many more. \n**reacts** - For a full list of reactions.\n\u200b`,
      inline: false,
    });
  
    embed.addFields(fields);
    return embed;
  }
  

  private createCommandHelpEmbed(
    command: CommandInterface,
    prefix: string = '',
  ): EmbedBuilder {
    const fields = [];

    if (command.usageExamples.length > 0) {
      fields.push({
        name: 'Usage',
        value: `${prefix}${command.usageExamples.join(`\n${prefix}`)}`,
        inline: true,
      });
    }

    return this.getBasicEmbed()
      .setTitle(`📚 Help entry for ${command.name}`)
      .setDescription(`Description: ${command.description}`)
      .addFields(fields);
  }

  private getBasicEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setThumbnail(this.client.user.displayAvatarURL())
      .setTimestamp()
      .setFooter({
        text: `Made with ❤️ by Ririko`,
      });
  }

  private getCategorizedPrefixCommands(): Map<string, CommandInterface[]> {
    return this.categorizeCommands(
      this.services.commandService.getPrefixCommands,
    );
  }

  private getCategorizedSlashCommands(): Map<string, any> {
    return this.categorizeCommands(
      this.services.commandService.getSlashCommands,
    );
  }

  private categorizeCommands(commands: any): Map<string, any> {
  const categorizedCommands = new Map<string, CommandInterface[]>();

  commands.forEach((command) => {
    // Skip commands in the "reactions" category
    if (command.category === 'reactions') return;

    if (!categorizedCommands.has(command.category)) {
      categorizedCommands.set(command.category, []);
    }

    categorizedCommands.get(command.category)?.push(command);
  });

  return categorizedCommands;
}

}
