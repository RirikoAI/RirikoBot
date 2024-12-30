import { Injectable } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { CliHelpUtil } from '#util/command/cli-help.util';

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

    if (
      ['react', 'reacts', 'reaction', 'reactions'].includes(
        this.params[0]?.toLowerCase(),
      )
    ) {
      embed = this.createReactionsHelpEmbed(
        this.getCategorizedPrefixCommands(),
        'prefix',
      );
    } else if (this.params.length === 0) {
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

    if (
      ['react', 'reacts', 'reaction', 'reactions'].includes(
        commandName?.toLowerCase(),
      )
    ) {
      embed = this.createReactionsHelpEmbed(
        this.getCategorizedSlashCommands(),
        'slash',
      );
    } else if (commandName) {
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

  async runCli(input: string): Promise<void> {
    const params = input.split(' ').slice(1);
    // check all commands which have the runCli method
    const commands = this.services.commandService.getCliCommands;

    if (params.length === 0) {
      const table = [];
      commands.forEach((command) => {
        table.push({
          name: command.name,
          description: command.description,
          usageExamples: command.usageExamples.join(' | '),
        });
      });

      CliHelpUtil.table(table);
    } else {
      // check help entry to params[0]
      const command = this.services.commandService.getCommand(params[0]);
      if (!command) return;
      console.log(`${command.description}\n`);
      console.log(`Usage: ${command.usageExamples.join(' | ')}`);
    }
  }

  private createReactionsHelpEmbed(
    commandsMap: Map<string, CommandInterface[]>,
    type: 'prefix' | 'slash',
  ): EmbedBuilder {
    const embed = this.getBasicEmbed()
      .setTitle(`📚 Help`)
      .setDescription(
        `List of available ${type} reaction commands for Ririko:`,
      );

    const fields: { name: string; value: string; inline: boolean }[] = [];
    const categoryName = 'reactions';
    const commandsPerField: number = 10;

    Array.from(commandsMap)
      .filter(([category]) => category === categoryName)
      .forEach(([category, commands]) => {
        let currentFieldValue = '';
        let startIndex = 1;

        commands.forEach((command, index) => {
          const commandText = `**${command.name}** - ${command.description}\n`;
          if (
            currentFieldValue.length + commandText.length > 1024 ||
            index + 1 - startIndex >= commandsPerField
          ) {
            fields.push({
              name: `Reactions ${startIndex}-${index}`,
              value: currentFieldValue.trimEnd(),
              inline: false,
            });
            currentFieldValue = '';
            startIndex = index + 1;
          }

          currentFieldValue += commandText;
        });

        if (currentFieldValue) {
          fields.push({
            name: `Reactions ${startIndex}-${commands.length}`,
            value: currentFieldValue.trimEnd(),
            inline: false,
          });
        }
      });

    embed.addFields(fields);

    return embed;
  }

  private createHelpEmbed(
    commandsMap: Map<string, CommandInterface[]>,
    type: 'prefix' | 'slash',
  ): EmbedBuilder {
    const embed = this.getBasicEmbed()
      .setTitle(`📚 Help`)
      .setDescription(`List of available ${type} commands for Ririko:`);

    const fields = Array.from(commandsMap)
      .filter(([category]) => category !== 'reactions')
      .map(([category, commands]) => ({
        name: `__${category.charAt(0).toUpperCase() + category.slice(1)}__`,
        value:
          commands
            .map((command) => `**${command.name}** - ${command.description}`)
            .join('\n') + '\n\u200b',
        inline: false,
      }));

    fields.push({
      name: `__Reactions__`,
      value: `There are over 60 reactions like **hug**, **blush**, **kiss** and many more. \n**help reacts** - For a full list of reactions.\n\u200b`,
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
      if (!categorizedCommands.has(command.category)) {
        categorizedCommands.set(command.category, []);
      }

      categorizedCommands.get(command.category)?.push(command);
    });

    return categorizedCommands;
  }
}
