import { Injectable } from '@nestjs/common';
import { Message, EmbedBuilder, CommandInteraction } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';

@Injectable()
export default class HelpCommand extends Command implements CommandInterface {
  name = 'help';
  regex = new RegExp('^help$|^help ', 'i');
  description = 'Display help message';
  category = 'general';
  usageExamples = ['help <command>'];

  async runPrefix(message: Message): Promise<void> {
    const prefix = this.services.config.get('DEFAULT_PREFIX');

    let embed;
    if (this.params.length === 0) {
      embed = this.getBasicEmbed()
        .setTitle('📚 Help')
        .setDescription(`List of available prefix commands for Ririko:`)
        .addFields([
          // Loop through all prefix commands and add them to the embed
          ...this.services.commandService.getPrefixCommands.map((command) => ({
            name: `${prefix}${command.name}`,
            value: command.description,
            inline: true
          })),
        ]);
    } else {
      const command = this.services.commandService.getCommand(this.params[0]);
      if (!command) {
        return;
      }

      let fields = [];

      if (command.usageExamples.length > 0) {
        fields.push({
          name: 'Usage',
          value: `${prefix}${command.usageExamples.join(`\n${prefix}`)}`,
          inline: true
        });
      }

      embed = this.getBasicEmbed()
        .setTitle('📚 Help entry for ' + command.name)
        .setDescription(`Description: ${command.description}`)
        .addFields(fields);
    }

    await message.reply({
      embeds: [embed],
    });
  }

  async runSlash(interaction: CommandInteraction): Promise<any> {
    const embed = this.getBasicEmbed()
      .setTitle('📚 Help')
      .setDescription(`List of available slash commands for Ririko:`)
      .addFields([
        // Loop through all slash commands and add them to the embed
        ...this.services.commandService.getSlashCommands.map((command) => ({
          name: `/${command.name}`,
          value: command.description,
          inline: true
        })),
      ]);

    await interaction.reply({
      embeds: [embed],
    });
  }

  private getBasicEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setThumbnail(this.client.user.displayAvatarURL())
      .setTimestamp()
      .setFooter({
        text: `Made with ❤️ by Ririko`,
      });
  }
}
