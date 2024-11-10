import {
  ChatInputCommandInteraction,
  CommandInteractionOption,
  CommandInteractionOptionResolver,
  GuildMember,
  Message,
  PermissionsBitField,
} from 'discord.js';
import { Command } from '#command/command.class';

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

export type MenuOptions = MenuOption[];

export type MenuOption = {
  label: string;
  value: string;
  description: string;
};

export type MenuCallback = (
  interaction: DiscordInteraction,
  selectedOption: string,
  context?: Command,
) => Promise<any>;

export interface DiscordGuildMember extends GuildMember {
  get permissions(): Readonly<PermissionsBitField> | any;
}

export interface DiscordMessage extends Message<true> {
  get member(): DiscordGuildMember;
}

export interface DiscordInteraction extends ChatInputCommandInteraction {
  options:
    | CommandInteractionOptionResolver
    | NonNullable<CommandInteractionOption<any>['member']>
    | any;

  get member(): DiscordGuildMember;

  fetchReply(): Promise<Message<true>>;
}
