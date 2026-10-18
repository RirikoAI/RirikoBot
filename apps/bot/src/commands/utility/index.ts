import type { Command } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { createPrefixCommand } from './prefix.command.js';
import { createTimezoneCommand } from './timezone.command.js';
import { createAvatarCommand } from './avatar.command.js';
import { createGuildInfoCommand } from './guild-info.command.js';
import { createMemberInfoCommand } from './member-info.command.js';
import { createWelcomerCommand } from './welcomer.command.js';
import { createFarewellCommand } from './farewell.command.js';

/**
 * Creates the complete suite of server utility and identity commands for EPIC-014:
 * - /prefix (!prefix, !setprefix)
 * - /timezone (!tz, !timezone, !settimezone)
 * - /get-avatar (!avatar, !pfp)
 * - /guild-info (!guildinfo, !serverinfo, !info)
 * - /member-info (!memberinfo, !userinfo, !whois)
 * - /welcomer (!welcome)
 * - /farewell (!goodbye)
 */
export function createUtilityCommands(services: BotServices): Command[] {
  return [
    createPrefixCommand(services),
    createTimezoneCommand(services),
    createAvatarCommand(services),
    createGuildInfoCommand(services),
    createMemberInfoCommand(services),
    createWelcomerCommand(services),
    createFarewellCommand(services),
  ];
}

export * from './prefix.command.js';
export * from './timezone.command.js';
export * from './avatar.command.js';
export * from './guild-info.command.js';
export * from './member-info.command.js';
export * from './welcomer.command.js';
export * from './farewell.command.js';
