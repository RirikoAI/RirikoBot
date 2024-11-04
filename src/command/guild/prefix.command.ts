import { Injectable } from '@nestjs/common';
import {
  EmbedBuilder,
  GuildMember,
  Message,
  PermissionsBitField,
} from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';

@Injectable()
export default class PrefixCommand extends Command implements CommandInterface {
  name = 'prefix';
  regex = new RegExp('^prefix$|^prefix |^setprefix ', 'i');
  description = 'Set prefix for this Discord server';
  category = 'server';
  usageExamples = ['prefix', 'prefix <prefix>', 'setprefix <prefix>'];

  async runPrefix(message: Message): Promise<void> {
    if (this.hasPermission(message.member) === false) {
      await message.reply({
        content: `You don't have the required permission to change the prefix`,
      });
      return;
    }

    // If no parameters are provided, we will display the current prefix
    if (this.params.length === 0) {
      const embed = new EmbedBuilder().addFields([
        {
          name: `Prefix`,
          value: `The current server prefix is: \`${await this.getGuildPrefix(message)}\``,
        },
      ]);

      await message.reply({
        embeds: [embed],
      });
    } else {
      // If a parameter is provided, we will update the prefix
      await this.updateGuildPrefix(message, this.params[0]);

      const embed = new EmbedBuilder().addFields([
        {
          name: `Prefix`,
          value: `The prefix for this server has been set to \`${this.params[0]}\``,
        },
      ]);

      await message.reply({
        embeds: [embed],
      });
    }
  }

  private hasPermission(member: GuildMember): boolean {
    return member.permissions.has(
      PermissionsBitField.Flags.ManageChannels,
      true,
    );
  }

  private async updateGuildPrefix(
    message: Message,
    prefix: string,
  ): Promise<void> {
    const guildId = message.guild.id;
    await this.services.guildRepository.upsert(
      {
        guildId,
        prefix,
        name: message.guild.name,
      },
      ['guildId'],
    );
  }
}
