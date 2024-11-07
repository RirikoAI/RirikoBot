import { APIEmbed } from 'discord-api-types/v10';

export type SlashCommandOptions = SlashCommandOption[];

export type SlashCommandOption = {
  type: SlashCommandOptionTypes;
  name: string;
  description: string;
  required: boolean;
};

export enum SlashCommandOptionTypes {
  Subcommand = 1,
  SubcommandGroup = 2,
  String = 3,
  Integer = 4,
  Boolean = 5,
  User = 6,
  Channel = 7,
  Role = 8,
  Mentionable = 9,
}

export type Pages = APIEmbed[];
