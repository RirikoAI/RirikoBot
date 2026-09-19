import type { Command } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { createCreateReactionRoleCommand } from './create-reaction-role.command.js';
import { createReactionRolesCommand } from './reaction-roles.command.js';
import { createAutoRoleCommand } from './autorole.command.js';
import { createTempRoleCommand } from './temprole.command.js';

export function createRoleCommands(services: BotServices): Command[] {
  return [
    createCreateReactionRoleCommand(services),
    createReactionRolesCommand(services),
    createAutoRoleCommand(services),
    createTempRoleCommand(services),
  ];
}

export * from './create-reaction-role.command.js';
export * from './reaction-roles.command.js';
export * from './autorole.command.js';
export * from './temprole.command.js';
