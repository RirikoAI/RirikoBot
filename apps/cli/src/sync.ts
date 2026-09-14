import { ApplicationCommandType, PermissionFlagsBits, REST, Routes, SlashCommandBuilder, ContextMenuCommandBuilder } from 'discord.js';
import { AppError, type RuntimeConfig, requireDiscordCredentials } from '@ririko/core';
import type { CommandMetadata } from '@ririko/discord';

/** Build registration payloads directly from the same metadata used by help and dispatch. */
export function registrationPayload(commands: readonly CommandMetadata[]): unknown[] {
  return commands.filter((command) => !command.hidden).flatMap((command) => {
    const slash = new SlashCommandBuilder().setName(command.name).setDescription(command.description);
    if (command.guildOnly) slash.setContexts(0);
    if (command.permissions?.length) {
      let permissions = 0n;
      for (const name of command.permissions) {
        const flag = Object.entries(PermissionFlagsBits).find(([key]) => key === name)?.[1];
        if (flag === undefined) throw new AppError('REGISTRATION', `Unknown permission: ${name}.`);
        permissions |= flag;
      }
      slash.setDefaultMemberPermissions(permissions);
    }
    for (const option of command.options ?? []) {
      switch (option.type) {
        case 'string': slash.addStringOption((builder) => {
          builder.setName(option.name).setDescription(option.description).setRequired(option.required ?? false);
          if (option.min !== undefined) builder.setMinLength(option.min);
          if (option.max !== undefined) builder.setMaxLength(option.max);
          const choices = option.choices?.filter((choice): choice is { name: string; value: string } => typeof choice.value === 'string');
          if (choices?.length) builder.addChoices(...choices);
          return builder;
        }); break;
        case 'integer': slash.addIntegerOption((builder) => {
          builder.setName(option.name).setDescription(option.description).setRequired(option.required ?? false);
          if (option.min !== undefined) builder.setMinValue(option.min);
          if (option.max !== undefined) builder.setMaxValue(option.max);
          const choices = option.choices?.filter((choice): choice is { name: string; value: number } => typeof choice.value === 'number');
          if (choices?.length) builder.addChoices(...choices);
          return builder;
        }); break;
        case 'boolean': slash.addBooleanOption((builder) => builder.setName(option.name).setDescription(option.description).setRequired(option.required ?? false)); break;
        case 'user': slash.addUserOption((builder) => builder.setName(option.name).setDescription(option.description).setRequired(option.required ?? false)); break;
        case 'channel': slash.addChannelOption((builder) => builder.setName(option.name).setDescription(option.description).setRequired(option.required ?? false)); break;
        case 'role': slash.addRoleOption((builder) => builder.setName(option.name).setDescription(option.description).setRequired(option.required ?? false)); break;
      }
    }
    return [slash.toJSON(), ...(command.contextMenus ?? []).map((context) => {
      const builder = new ContextMenuCommandBuilder().setName(context.name).setType(context.type === 'user' ? ApplicationCommandType.User : ApplicationCommandType.Message);
      if (command.guildOnly) builder.setContexts(0);
      return builder.toJSON();
    })];
  });
}

/** Sync only when explicitly invoked by an operator; startup never overwrites registrations. */
export async function synchronizeCommands(config: RuntimeConfig, commands: readonly CommandMetadata[], global: boolean): Promise<void> {
  const credentials = requireDiscordCredentials(config);
  const guildId = config.discord.guildId;
  if (!global && !guildId) throw new AppError('CONFIG', 'Set DISCORD_GUILD_ID for a development server, or explicitly pass --global.');
  const route = global ? Routes.applicationCommands(credentials.applicationId) : Routes.applicationGuildCommands(credentials.applicationId, guildId ?? '');
  const rest = new REST({ version: '10', timeout: 15000, retries: 2 }).setToken(credentials.token);
  await rest.put(route, { body: registrationPayload(commands) });
}
